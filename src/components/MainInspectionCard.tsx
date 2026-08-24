import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  FileText, 
  Ruler, 
  Crop, 
  Eye, 
  Droplet, 
  Type, 
  Layers, 
  ShieldCheck, 
  Info, 
  Download, 
  ChevronLeft, 
  ChevronRight,
  Loader2
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { CircularGauge } from './CircularGauge';
import type { PreflightAnalysis } from '../types';
import type { ProductionProfile } from '../utils/productionProfiles';
import { formatBytes } from '../../server/pdfExtractor';
import { buildTechnicalReport, createAnalysisSnapshot } from '../services/technicalReport';
import { generateTechnicalReportPdf, generateReportPdfFileName, downloadTechnicalReportPdf } from '../services/reportPdfGenerator';

// Initialize PDF.js worker
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
  } catch {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '4.10.38'}/pdf.worker.min.mjs`;
  }
}

interface MainInspectionCardProps {
  analysis: PreflightAnalysis;
  profile: ProductionProfile;
  file?: File | Blob | Uint8Array | ArrayBuffer | null;
  onOpenReportModal?: () => void;
  userName?: string;
}

export const MainInspectionCard: React.FC<MainInspectionCardProps> = ({
  analysis,
  profile,
  file,
  onOpenReportModal,
  userName = 'Maria Silva',
}) => {
  const [currentPageNum, setCurrentPageNum] = useState(1);
  const [isRendering, setIsRendering] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<any>(null);

  const { document, ruleResults } = analysis;
  const { scoreSummary } = ruleResults;
  const totalPages = document.pageCount || 1;

  // Load PDF into memory for preview
  useEffect(() => {
    let isCancelled = false;

    async function loadDocument() {
      if (!file) return;

      try {
        setIsRendering(true);
        let data: ArrayBuffer | Uint8Array;
        if (file instanceof Uint8Array || file instanceof ArrayBuffer) {
          data = file;
        } else {
          data = await file.arrayBuffer();
        }

        if (isCancelled) return;

        const loadingTask = pdfjsLib.getDocument({
          data: new Uint8Array(data),
          cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/cmaps/',
          cMapPacked: true,
          standardFontDataUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/standard_fonts/',
        });

        const doc = await loadingTask.promise;
        if (!isCancelled) {
          setPdfDoc(doc);
        }
      } catch (err) {
        console.warn('Erro ao carregar preview do PDF:', err);
      } finally {
        if (!isCancelled) setIsRendering(false);
      }
    }

    loadDocument();
    return () => {
      isCancelled = true;
    };
  }, [file]);

  // Render current page to canvas
  const renderPage = useCallback(async (doc: pdfjsLib.PDFDocumentProxy, pageNumber: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel();
      } catch {}
      renderTaskRef.current = null;
    }

    try {
      setIsRendering(true);
      const page = await doc.getPage(Math.min(Math.max(1, pageNumber), doc.numPages));
      const unscaledViewport = page.getViewport({ scale: 1 });
      
      const targetWidth = 480;
      const scale = Math.max(1.2, Math.min(2.5, targetWidth / unscaledViewport.width));
      const viewport = page.getViewport({ scale });

      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) return;

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const renderContext: any = {
        canvasContext: ctx,
        viewport: viewport,
        canvas: canvas,
      };

      const task = page.render(renderContext);
      renderTaskRef.current = task;
      await task.promise;
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException') {
        console.warn('Erro na renderização da página:', err);
      }
    } finally {
      setIsRendering(false);
    }
  }, []);

  useEffect(() => {
    if (pdfDoc) {
      renderPage(pdfDoc, currentPageNum);
    }
  }, [pdfDoc, currentPageNum, renderPage]);

  // Export PDF Report handler
  const handleDownloadPdfReport = async () => {
    try {
      setIsExporting(true);
      const snapshot = createAnalysisSnapshot(analysis, profile);
      const report = buildTechnicalReport(snapshot, null, profile);
      const pdfBytes = await generateTechnicalReportPdf(report);
      const fileName = generateReportPdfFileName(report.fileName, report.generatedAt);
      downloadTechnicalReportPdf(pdfBytes, fileName);
    } catch (err) {
      console.error('Erro ao gerar relatório em PDF:', err);
    } finally {
      setIsExporting(false);
    }
  };

  // Determine Checklist items status
  const p1 = document.pages[0];
  const formatValue = p1 ? `${p1.widthMm.toFixed(0)} × ${p1.heightMm.toFixed(0)} mm` : '210 × 297 mm';
  
  // Bleed status
  const bleedRule = ruleResults.results.find(r => r.ruleId === 'RULE-PROF-BLD-001' || r.category === 'bleed');
  const bleedMm = p1?.bleedBox?.widthMm && p1?.trimBox?.widthMm 
    ? Math.max(0, Number(((p1.bleedBox.widthMm - p1.trimBox.widthMm) / 2).toFixed(1)))
    : 0;
  const bleedText = bleedMm > 0 ? `${bleedMm} mm` : 'Sem sangria';
  const bleedStatus = bleedRule?.status === 'approved' || bleedMm >= 3 ? 'OK' : 'Alerta';

  // Resolution status
  const dpiRule = ruleResults.results.find(r => r.ruleId === 'RULE-PROF-DPI-001' || r.category === 'resolution');
  const allImages = document.pages.flatMap(p => p.imageOccurrences || []);
  const minDpi = allImages.length > 0 ? Math.min(...allImages.map(i => Math.min(i.effectiveDpiX, i.effectiveDpiY))) : 300;
  const dpiText = allImages.length > 0 ? `${Math.round(minDpi)} DPI` : '100% Vetorial';
  const dpiStatus = dpiRule?.status === 'approved' || allImages.length === 0 || minDpi >= 300 ? 'OK' : (minDpi >= 200 ? 'Alerta' : 'Bloqueante');

  // Color status
  const colorRule = ruleResults.results.find(r => r.ruleId === 'RULE-PROF-CLR-001' || r.category === 'color');
  const colorText = document.colorSummary.hasRgb ? 'DeviceRGB' : (document.colorSummary.hasCmyk ? 'CMYK' : 'Spot / Gray');
  const colorStatus = !document.colorSummary.hasRgb ? 'OK' : (profile.rgbPolicy === 'warning' ? 'Alerta' : 'Alerta');

  // Font status
  const fontRule = ruleResults.results.find(r => r.ruleId === 'RULE-FONT-001');
  const unembedded = document.fonts.filter(f => f.isUsedInContent !== false && (f.isEmbedded === 'no' || f.isEmbedded === false));
  const fontText = unembedded.length === 0 ? 'Todas incorporadas' : `${unembedded.length} não incorporada(s)`;
  const fontStatus = unembedded.length === 0 ? 'OK' : 'Bloqueante';

  // Transparency status
  const hasTransp = document.pages.some(p => p.hasTransparency);
  const transpText = hasTransp ? 'Detectadas (PDF/X-4)' : 'Não detectadas';

  // PDF/X status
  const pdfxText = document.pdfxInfo?.recognizedStandard || (document.pdfxInfo?.isDeclaredPdfX ? 'PDF/X Declarado' : 'Compatível (PDF/X-4)');
  const pdfxStatus = document.pdfxInfo?.isDeclaredPdfX ? 'OK' : 'Alerta';

  // Quality verdict message
  let verdictMessage = 'Seu arquivo está pronto para produção com alta qualidade.';
  let verdictLabel = 'Excelente';
  if (scoreSummary.score >= 90) {
    verdictLabel = 'Excelente';
    verdictMessage = 'Seu arquivo está pronto para produção com alta qualidade.';
  } else if (scoreSummary.score >= 80) {
    verdictLabel = 'Muito Bom';
    verdictMessage = 'Arquivo utilizável, mas recomendamos revisar alguns pontos.';
  } else if (scoreSummary.score >= 60) {
    verdictLabel = 'Atenção';
    verdictMessage = 'Arquivo utilizável com ressalvas antes da gravação de matrizes.';
  } else {
    verdictLabel = 'Correção Obrigatória';
    verdictMessage = 'Arquivo possui problemas críticos que precisam ser corrigidos antes do envio.';
  }

  // Format date
  const dateFormatted = new Date(analysis.createdAt || Date.now()).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const timeFormatted = new Date(analysis.createdAt || Date.now()).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs p-6 mb-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* COLUNA 1: Real PDF Preview (4 cols) */}
        <div className="lg:col-span-4 flex flex-col items-center justify-center">
          <div className="relative w-full max-w-[290px] aspect-[1/1.414] rounded-2xl bg-[#090D14] border border-slate-200/80 shadow-md flex items-center justify-center overflow-hidden group">
            {file ? (
              <>
                <canvas ref={canvasRef} className="max-w-full max-h-full object-contain shadow-xs" />
                {isRendering && (
                  <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-2xs flex items-center justify-center text-white text-xs font-semibold">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    Renderizando...
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center text-[#94A3B8] p-4 text-center">
                <FileText className="w-12 h-12 stroke-[1.5] mb-2 text-[#64748B]" />
                <span className="text-xs font-semibold text-[#CBD5E1]">Prévia do PDF</span>
              </div>
            )}

            {/* Page navigation overlay if multi-page */}
            {totalPages > 1 && (
              <div className="absolute bottom-2 inset-x-2 flex items-center justify-between px-2 py-1 rounded-lg bg-black/60 backdrop-blur-xs text-white text-[11px] font-semibold">
                <button
                  type="button"
                  disabled={currentPageNum <= 1}
                  onClick={() => setCurrentPageNum(p => Math.max(1, p - 1))}
                  className="p-1 hover:text-[#38BDF8] disabled:opacity-30 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span>Pág {currentPageNum} de {totalPages}</span>
                <button
                  type="button"
                  disabled={currentPageNum >= totalPages}
                  onClick={() => setCurrentPageNum(p => Math.min(totalPages, p + 1))}
                  className="p-1 hover:text-[#38BDF8] disabled:opacity-30 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* COLUNA 2: File Info & Checklist List (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* File Header */}
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <span className="px-1.5 py-0.5 rounded-md bg-[#EF4444] text-white text-[10px] font-extrabold uppercase tracking-wider">
                PDF
              </span>
              <h2 className="text-base sm:text-lg font-black text-[#0F172A] tracking-tight truncate max-w-[230px] sm:max-w-[280px]">
                {analysis.fileName}
              </h2>
              {/* Approval status pill */}
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                scoreSummary.score >= 80 ? 'bg-[#DCFCE7] text-[#15803D]' : 'bg-[#FEF3C7] text-[#B45309]'
              }`}>
                {scoreSummary.score >= 80 ? '✓ Aprovado' : '▲ Revisão'}
              </span>
              <span className="text-xs text-[#94A3B8] font-medium hidden sm:inline">
                • {formatBytes(analysis.fileSizeBytes)}
              </span>
            </div>
            <p className="text-xs text-[#64748B] font-medium">
              Enviado em {dateFormatted} às {timeFormatted} por {userName}
            </p>
          </div>

          {/* Checklist Rows */}
          <div className="space-y-1.5 pt-1">
            {/* Dimensões */}
            <div className="flex items-center justify-between py-1.5 px-2.5 rounded-xl hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-2.5 text-xs text-[#475569] font-medium">
                <Ruler className="w-4 h-4 text-[#64748B]" />
                <span>Dimensões</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-[#0F172A]">{formatValue}</span>
                <span className="px-2 py-0.5 rounded-md bg-[#ECFDF5] text-[#059669] text-[10px] font-bold">OK</span>
              </div>
            </div>

            {/* Sangria */}
            <div className="flex items-center justify-between py-1.5 px-2.5 rounded-xl hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-2.5 text-xs text-[#475569] font-medium">
                <Crop className="w-4 h-4 text-[#64748B]" />
                <span>Sangria</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-[#0F172A]">{bleedText}</span>
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                  bleedStatus === 'OK' ? 'bg-[#ECFDF5] text-[#059669]' : 'bg-[#FEF3C7] text-[#B45309]'
                }`}>{bleedStatus}</span>
              </div>
            </div>

            {/* Resolução */}
            <div className="flex items-center justify-between py-1.5 px-2.5 rounded-xl hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-2.5 text-xs text-[#475569] font-medium">
                <Eye className="w-4 h-4 text-[#64748B]" />
                <span>Resolução</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-[#0F172A]">{dpiText}</span>
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                  dpiStatus === 'OK' ? 'bg-[#ECFDF5] text-[#059669]' : (dpiStatus === 'Alerta' ? 'bg-[#FEF3C7] text-[#B45309]' : 'bg-[#FEE2E2] text-[#B91C1C]')
                }`}>{dpiStatus}</span>
              </div>
            </div>

            {/* Cores */}
            <div className="flex items-center justify-between py-1.5 px-2.5 rounded-xl hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-2.5 text-xs text-[#475569] font-medium">
                <Droplet className="w-4 h-4 text-[#64748B]" />
                <span>Cores</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-[#0F172A]">{colorText}</span>
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                  colorStatus === 'OK' ? 'bg-[#ECFDF5] text-[#059669]' : 'bg-[#FEF3C7] text-[#B45309]'
                }`}>{colorStatus}</span>
              </div>
            </div>

            {/* Fontes */}
            <div className="flex items-center justify-between py-1.5 px-2.5 rounded-xl hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-2.5 text-xs text-[#475569] font-medium">
                <Type className="w-4 h-4 text-[#64748B]" />
                <span>Fontes</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-[#0F172A]">{fontText}</span>
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                  fontStatus === 'OK' ? 'bg-[#ECFDF5] text-[#059669]' : 'bg-[#FEE2E2] text-[#B91C1C]'
                }`}>{fontStatus}</span>
              </div>
            </div>

            {/* Transparências */}
            <div className="flex items-center justify-between py-1.5 px-2.5 rounded-xl hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-2.5 text-xs text-[#475569] font-medium">
                <Layers className="w-4 h-4 text-[#64748B]" />
                <span>Transparências</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-[#0F172A]">{transpText}</span>
                <span className="px-2 py-0.5 rounded-md bg-[#ECFDF5] text-[#059669] text-[10px] font-bold">OK</span>
              </div>
            </div>

            {/* PDF/X */}
            <div className="flex items-center justify-between py-1.5 px-2.5 rounded-xl hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-2.5 text-xs text-[#475569] font-medium">
                <ShieldCheck className="w-4 h-4 text-[#64748B]" />
                <span>PDF/X</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-[#0F172A] truncate max-w-[140px]">{pdfxText}</span>
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                  pdfxStatus === 'OK' ? 'bg-[#ECFDF5] text-[#059669]' : 'bg-[#FEF3C7] text-[#B45309]'
                }`}>
                  {pdfxStatus === 'OK' ? 'OK' : '▲ Alerta'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* COLUNA 3: Pontuação de Qualidade & Ações (3 cols) */}
        <div className="lg:col-span-3 flex flex-col justify-between h-full space-y-4 lg:pl-4 lg:border-l lg:border-slate-100">
          <div>
            <div className="flex items-center gap-1.5 text-sm font-bold text-[#0F172A] mb-3">
              <span>Pontuação de Qualidade</span>
              <Info className="w-3.5 h-3.5 text-[#94A3B8] cursor-help" />
            </div>

            <div className="flex items-center gap-4 my-2">
              <CircularGauge score={scoreSummary.score} size={98} strokeWidth={9} />
              <div>
                <span className="text-base font-extrabold text-[#10B981] block">
                  {verdictLabel}
                </span>
              </div>
            </div>

            <p className="text-xs text-[#64748B] font-medium leading-relaxed mt-2">
              {verdictMessage}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 pt-2">
            <button
              type="button"
              onClick={onOpenReportModal}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-white bg-gradient-to-r from-[#0066FF] to-[#7C3AED] hover:opacity-95 shadow-sm shadow-blue-500/20 cursor-pointer transition-all select-none"
            >
              <FileText className="w-4 h-4" />
              <span>Ver Relatório Completo</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPdfReport}
              disabled={isExporting}
              className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold text-[#64748B] hover:text-[#0F172A] transition-colors cursor-pointer"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Gerando PDF...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5 text-[#94A3B8]" />
                  <span>Baixar relatório em PDF</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
