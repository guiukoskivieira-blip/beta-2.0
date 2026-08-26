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
  ZoomIn,
  ZoomOut,
  Loader2,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  Sliders
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { CircularGauge } from './CircularGauge';
import type { PreflightAnalysis } from '../types';
import type { ProductionProfile } from '../utils/productionProfiles';
import { formatBytes } from '../../server/pdfExtractor';
import { buildTechnicalReport, createAnalysisSnapshot } from '../services/technicalReport';
import { generateTechnicalReportPdf, generateReportPdfFileName, downloadTechnicalReportPdf } from '../services/reportPdfGenerator';

// Initialize PDF.js worker securely in browser
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
  onOpenProfiles?: () => void;
  userName?: string;
}

export const MainInspectionCard: React.FC<MainInspectionCardProps> = ({
  analysis,
  profile,
  file,
  onOpenReportModal,
  onOpenProfiles,
  userName = 'Maria Silva',
}) => {
  const [currentPageNum, setCurrentPageNum] = useState(1);
  const [zoomScale, setZoomScale] = useState(1.0);
  const [isRendering, setIsRendering] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<any>(null);

  const { document, ruleResults } = analysis;
  const { scoreSummary, errorCount, warningCount } = ruleResults;
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
  const renderPage = useCallback(async (doc: pdfjsLib.PDFDocumentProxy, pageNumber: number, zoom: number) => {
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
      
      const targetWidth = 460 * zoom;
      const scale = Math.max(1.0, Math.min(3.0, targetWidth / unscaledViewport.width));
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
      renderPage(pdfDoc, currentPageNum, zoomScale);
    }
  }, [pdfDoc, currentPageNum, zoomScale, renderPage]);

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
  const pages = document.pages || [];
  const getPageNominalDimensions = (p: typeof document.pages[0]) => {
    const hasValidTrimBox = Boolean(
      p.trimBox &&
      p.trimBox.status === 'explicit' &&
      typeof p.trimBox.widthMm === 'number' &&
      p.trimBox.widthMm > 0 &&
      typeof p.trimBox.heightMm === 'number' &&
      p.trimBox.heightMm > 0
    );
    const isRotated = p.rotation === 90 || p.rotation === 270;
    let w = hasValidTrimBox ? p.trimBox!.widthMm : (p.visualWidthMm ?? p.widthMm);
    let h = hasValidTrimBox ? p.trimBox!.heightMm : (p.visualHeightMm ?? p.heightMm);
    if (hasValidTrimBox && isRotated) {
      w = p.trimBox!.heightMm;
      h = p.trimBox!.widthMm;
    }
    return { w: Math.round(w), h: Math.round(h), exactW: w, exactH: h, hasValidTrimBox };
  };

  const pageDims = pages.map(getPageNominalDimensions);
  const firstDim = pageDims[0];
  const TOLERANCE_MM = 1.5;

  // Check if all pages match firstDim (either direct or rotated physical equivalence)
  const isHeterogeneous = pages.length > 1 && pageDims.some(d => {
    const normalMatch = Math.abs(d.exactW - firstDim.exactW) <= TOLERANCE_MM && Math.abs(d.exactH - firstDim.exactH) <= TOLERANCE_MM;
    const rotatedMatch = Math.abs(d.exactW - firstDim.exactH) <= TOLERANCE_MM && Math.abs(d.exactH - firstDim.exactW) <= TOLERANCE_MM;
    return !normalMatch && !rotatedMatch;
  });

  let formatValue = '';
  if (!isHeterogeneous) {
    const w = firstDim ? firstDim.w : 210;
    const h = firstDim ? firstDim.h : 297;
    formatValue = `${w} × ${h} mm`;
  } else {
    // Collect unique dimensions (preserving order)
    const uniqueDims: Array<{ w: number; h: number }> = [];
    for (const d of pageDims) {
      const exists = uniqueDims.some(u => 
        (Math.abs(u.w - d.w) <= 1 && Math.abs(u.h - d.h) <= 1) ||
        (Math.abs(u.w - d.h) <= 1 && Math.abs(u.h - d.w) <= 1)
      );
      if (!exists) {
        uniqueDims.push({ w: d.w, h: d.h });
      }
    }

    if (uniqueDims.length === 2) {
      formatValue = `${uniqueDims[0].w} × ${uniqueDims[0].h} + ${uniqueDims[1].w} × ${uniqueDims[1].h} mm`;
    } else if (uniqueDims.length > 2) {
      formatValue = `Formatos diferentes (${uniqueDims.length} tamanhos)`;
    } else {
      formatValue = 'Formatos diferentes';
    }
  }

  const p1 = document.pages[0];
  const hasValidTrimBox = Boolean(firstDim?.hasValidTrimBox);

  // Dimensions status from Motor 1
  const dimRule = ruleResults.results.find(r => r.ruleId === 'RULE-PROF-DIM-001');
  const geomRule = ruleResults.results.find(r => r.ruleId === 'RULE-GEOM-001');
  const isGenericProfile = Boolean(!profile.expectedWidthMm || !profile.expectedHeightMm);
  const isRotatedWarning = Boolean(dimRule?.status === 'warning' && (dimRule?.evidence?.includes('invertida') || dimRule?.evidence?.includes('Orientação')));
  const isBlockingError = Boolean(dimRule?.status === 'error' || geomRule?.status === 'error');
  const isWarningOnly = Boolean(geomRule?.status === 'warning' && !isBlockingError);

  const dimStatusText: 'OK' | 'Orientação' | 'Ajustável' | 'Manual' | 'Atenção' = 
    (isGenericProfile && !isHeterogeneous) || (dimRule?.status === 'approved' && geomRule?.status === 'approved')
      ? 'OK'
      : (isRotatedWarning
          ? 'Orientação'
          : (isBlockingError
              ? 'Manual'
              : (isWarningOnly
                  ? 'Atenção'
                  : 'Ajustável')));

  // Bleed status matching Motor 1 geometry
  const bleedRule = ruleResults.results.find(r => r.ruleId === 'RULE-PROF-BLD-001' || r.category === 'bleed');
  let calculatedBleedMm = 0;
  if (hasValidTrimBox && p1) {
    const tb = p1.trimBox!;
    const bb = p1.bleedBox?.status === 'explicit' ? p1.bleedBox : p1.mediaBox;
    if (bb) {
      const leftBleedMm = (tb.xMm ?? 0) - (bb.xMm ?? 0);
      const bottomBleedMm = (tb.yMm ?? 0) - (bb.yMm ?? 0);
      const rightBleedMm = ((bb.xMm ?? 0) + (bb.widthMm ?? 0)) - ((tb.xMm ?? 0) + (tb.widthMm ?? 0));
      const topBleedMm = ((bb.yMm ?? 0) + (bb.heightMm ?? 0)) - ((tb.yMm ?? 0) + (tb.heightMm ?? 0));
      const minBleed = Math.max(0, Math.min(leftBleedMm, bottomBleedMm, rightBleedMm, topBleedMm));
      calculatedBleedMm = Number(minBleed.toFixed(1));
    }
  }

  const bleedText = calculatedBleedMm > 0
    ? (Number.isInteger(calculatedBleedMm) ? `${calculatedBleedMm} mm` : `${calculatedBleedMm.toFixed(1)} mm`)
    : 'Sem sangria';
  const bleedStatusText = bleedRule?.status === 'approved' || calculatedBleedMm >= (profile.expectedBleedMm || 3) ? 'OK' : 'Atenção';

  // Resolution status
  const dpiRule = ruleResults.results.find(r => r.ruleId === 'RULE-PROF-DPI-001' || r.category === 'resolution');
  const allImages = document.pages.flatMap(p => p.imageOccurrences || []);
  const minDpi = allImages.length > 0 ? Math.min(...allImages.map(i => Math.min(i.effectiveDpiX, i.effectiveDpiY))) : 300;
  const dpiText = allImages.length > 0 ? `${Math.round(minDpi)} DPI` : '100% Vetorial';
  const dpiStatusText = dpiRule?.status === 'approved' || allImages.length === 0 || minDpi >= 300 
    ? 'OK' 
    : (minDpi >= 200 ? 'Atenção' : 'Manual');

  // Color status
  const colorText = document.colorSummary.hasRgb ? 'RGB' : (document.colorSummary.hasCmyk ? 'CMYK' : 'Spot / Gray');
  const colorStatusText = !document.colorSummary.hasRgb ? 'OK' : 'Corrigir';

  // Font status
  const unembedded = document.fonts.filter(f => f.isUsedInContent !== false && (f.isEmbedded === 'no' || f.isEmbedded === false));
  const fontText = unembedded.length === 0 ? 'Incorporadas' : `${unembedded.length} não incorporada(s)`;
  const fontStatusText = unembedded.length === 0 ? 'OK' : 'Manual';

  // Transparency status
  const hasTransp = document.pages.some(p => p.hasTransparency);
  const transpText = hasTransp ? 'Ativas (PDF/X-4)' : 'Nenhuma';

  // PDF/X status
  const pdfxText = document.pdfxInfo?.isDeclaredPdfX ? 'Declarado' : 'Não declarado';
  const pdfxStatusText = document.pdfxInfo?.isDeclaredPdfX ? 'OK' : 'Ajustável';

  // Overall verdict label
  let verdictStatus = 'PRONTO PARA PRODUÇÃO';
  let verdictColor = 'text-[#10B981]';
  if (errorCount > 0) {
    verdictStatus = 'CORREÇÃO OBRIGATÓRIA';
    verdictColor = 'text-[#EF4444]';
  } else if (warningCount > 0) {
    verdictStatus = 'ATENÇÃO NECESSÁRIA';
    verdictColor = 'text-[#F59E0B]';
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
    <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs p-5 sm:p-6 mb-6 select-none">
      {/* File Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-5 border-b border-slate-100">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="px-2 py-0.5 rounded-md bg-[#EF4444] text-white text-[10px] font-black uppercase tracking-wider shrink-0">
            PDF
          </span>
          <h2 className="text-base sm:text-lg font-black text-[#0F172A] tracking-tight truncate max-w-xs sm:max-w-md">
            {analysis.fileName}
          </h2>
          <span className="text-xs text-[#94A3B8] font-medium shrink-0 hidden sm:inline">
            • {formatBytes(analysis.fileSizeBytes)}
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs text-[#64748B] font-medium">
          <span>Enviado em {dateFormatted} às {timeFormatted}</span>
        </div>
      </div>

      {/* 3-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* COLUNA 1: Real PDF Preview (4 cols) */}
        <div className="lg:col-span-4 flex flex-col items-center justify-center">
          <div className="relative w-full max-w-[280px] aspect-[1/1.414] rounded-2xl bg-[#090D14] border border-slate-200/80 shadow-md flex items-center justify-center overflow-hidden group">
            {file ? (
              <>
                <canvas ref={canvasRef} className="max-w-full max-h-full object-contain shadow-xs transition-transform" />
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

            {/* Controls Overlay: Page navigation & Zoom */}
            <div className="absolute bottom-2 inset-x-2 flex items-center justify-between px-2 py-1 rounded-xl bg-black/60 backdrop-blur-xs text-white text-[11px] font-semibold">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={currentPageNum <= 1}
                  onClick={() => setCurrentPageNum(p => Math.max(1, p - 1))}
                  className="p-1 hover:text-[#38BDF8] disabled:opacity-30 cursor-pointer"
                  title="Página anterior"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span>{currentPageNum}/{totalPages}</span>
                <button
                  type="button"
                  disabled={currentPageNum >= totalPages}
                  onClick={() => setCurrentPageNum(p => Math.min(totalPages, p + 1))}
                  className="p-1 hover:text-[#38BDF8] disabled:opacity-30 cursor-pointer"
                  title="Próxima página"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setZoomScale(z => Math.max(0.8, z - 0.2))}
                  className="p-1 hover:text-[#38BDF8] cursor-pointer"
                  title="Reduzir zoom"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10px] text-slate-300 font-mono">{Math.round(zoomScale * 100)}%</span>
                <button
                  type="button"
                  onClick={() => setZoomScale(z => Math.min(2.0, z + 0.2))}
                  className="p-1 hover:text-[#38BDF8] cursor-pointer"
                  title="Aumentar zoom"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* COLUNA 2: Checklist Operacional Rápido (5 cols) */}
        <div className="lg:col-span-5 space-y-1.5">
          <div className="text-xs font-bold text-[#64748B] uppercase tracking-wider mb-2">
            Checagem Principal
          </div>

          {/* Dimensões */}
          <div className="flex items-center justify-between py-1.5 px-3 rounded-xl hover:bg-slate-50 transition-colors">
            <div className="flex items-center gap-2.5 text-xs text-[#475569] font-medium">
              <Ruler className="w-4 h-4 text-[#64748B]" />
              <span>Dimensões</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-[#0F172A]">{formatValue}</span>
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                dimStatusText === 'OK' 
                  ? 'bg-[#ECFDF5] text-[#059669]' 
                  : (dimStatusText === 'Orientação' || dimStatusText === 'Atenção'
                      ? 'bg-[#FEF3C7] text-[#B45309]' 
                      : (dimStatusText === 'Manual'
                          ? 'bg-[#FEE2E2] text-[#B91C1C]'
                          : 'bg-[#EFF6FF] text-[#1D4ED8]'))
              }`}>{dimStatusText}</span>
            </div>
          </div>

          {/* Sangria */}
          <div className="flex items-center justify-between py-1.5 px-3 rounded-xl hover:bg-slate-50 transition-colors">
            <div className="flex items-center gap-2.5 text-xs text-[#475569] font-medium">
              <Crop className="w-4 h-4 text-[#64748B]" />
              <span>Sangria</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-[#0F172A]">{bleedText}</span>
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                bleedStatusText === 'OK' ? 'bg-[#ECFDF5] text-[#059669]' : 'bg-[#FEF3C7] text-[#B45309]'
              }`}>{bleedStatusText}</span>
            </div>
          </div>

          {/* Resolução */}
          <div className="flex items-center justify-between py-1.5 px-3 rounded-xl hover:bg-slate-50 transition-colors">
            <div className="flex items-center gap-2.5 text-xs text-[#475569] font-medium">
              <Eye className="w-4 h-4 text-[#64748B]" />
              <span>Resolução</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-[#0F172A]">{dpiText}</span>
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                dpiStatusText === 'OK' ? 'bg-[#ECFDF5] text-[#059669]' : (dpiStatusText === 'Atenção' ? 'bg-[#FEF3C7] text-[#B45309]' : 'bg-[#FEE2E2] text-[#B91C1C]')
              }`}>{dpiStatusText}</span>
            </div>
          </div>

          {/* Cores */}
          <div className="flex items-center justify-between py-1.5 px-3 rounded-xl hover:bg-slate-50 transition-colors">
            <div className="flex items-center gap-2.5 text-xs text-[#475569] font-medium">
              <Droplet className="w-4 h-4 text-[#64748B]" />
              <span>Cores</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-[#0F172A]">{colorText}</span>
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                colorStatusText === 'OK' ? 'bg-[#ECFDF5] text-[#059669]' : 'bg-[#EFF6FF] text-[#1D4ED8]'
              }`}>{colorStatusText}</span>
            </div>
          </div>

          {/* Fontes */}
          <div className="flex items-center justify-between py-1.5 px-3 rounded-xl hover:bg-slate-50 transition-colors">
            <div className="flex items-center gap-2.5 text-xs text-[#475569] font-medium">
              <Type className="w-4 h-4 text-[#64748B]" />
              <span>Fontes</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-[#0F172A]">{fontText}</span>
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                fontStatusText === 'OK' ? 'bg-[#ECFDF5] text-[#059669]' : 'bg-[#FEE2E2] text-[#B91C1C]'
              }`}>{fontStatusText}</span>
            </div>
          </div>

          {/* Transparências */}
          <div className="flex items-center justify-between py-1.5 px-3 rounded-xl hover:bg-slate-50 transition-colors">
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
          <div className="flex items-center justify-between py-1.5 px-3 rounded-xl hover:bg-slate-50 transition-colors">
            <div className="flex items-center gap-2.5 text-xs text-[#475569] font-medium">
              <ShieldCheck className="w-4 h-4 text-[#64748B]" />
              <span>PDF/X</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-[#0F172A]">{pdfxText}</span>
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                pdfxStatusText === 'OK' ? 'bg-[#ECFDF5] text-[#059669]' : 'bg-[#EFF6FF] text-[#1D4ED8]'
              }`}>
                {pdfxStatusText}
              </span>
            </div>
          </div>
        </div>

        {/* COLUNA 3: Resultado Consolidado & Relatório (3 cols) */}
        <div className="lg:col-span-3 flex flex-col justify-between h-full space-y-4 lg:pl-5 lg:border-l lg:border-slate-100">
          <div>
            <div className="text-xs font-bold text-[#64748B] uppercase tracking-wider mb-2">
              Resultado
            </div>

            <div className="flex items-center gap-4 my-2">
              <CircularGauge score={scoreSummary.score} size={88} strokeWidth={8} />
              <div>
                <span className={`text-sm font-black tracking-tight block ${verdictColor}`}>
                  {verdictStatus}
                </span>
                <span className="text-xs text-[#64748B] font-medium">
                  {scoreSummary.score}/100 no Motor 1
                </span>
              </div>
            </div>

            <div className="space-y-1 my-3 text-xs font-medium text-[#475569]">
              {errorCount > 0 && (
                <div className="flex items-center gap-1.5 text-[#B91C1C] font-semibold">
                  <XCircle className="w-3.5 h-3.5 text-[#EF4444]" />
                  <span>{errorCount} correção(ões) obrigatória(s)</span>
                </div>
              )}
              {warningCount > 0 && (
                <div className="flex items-center gap-1.5 text-[#B45309]">
                  <AlertTriangle className="w-3.5 h-3.5 text-[#F59E0B]" />
                  <span>{warningCount} ajuste(s) recomendado(s)</span>
                </div>
              )}
              {errorCount === 0 && warningCount === 0 && (
                <div className="flex items-center gap-1.5 text-[#059669] font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981]" />
                  <span>Arquivo 100% em conformidade</span>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 pt-1">
            <button
              type="button"
              onClick={onOpenReportModal}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#0066FF] to-[#7C3AED] hover:opacity-95 shadow-sm shadow-blue-500/20 cursor-pointer transition-all select-none"
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
