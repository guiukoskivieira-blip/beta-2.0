import React, { useState } from 'react';
import { 
  X, 
  FileText, 
  Download, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Layers, 
  Image as ImageIcon, 
  Droplet, 
  Type, 
  Crop, 
  ShieldCheck, 
  Info,
  Sliders,
  Calendar,
  HardDrive,
  Printer,
  FileCheck2,
  Loader2
} from 'lucide-react';
import type { PreflightAnalysis } from '../types';
import type { ProductionProfile } from '../utils/productionProfiles';
import { formatBytes } from '../../server/pdfExtractor';
import { buildTechnicalReport, createAnalysisSnapshot } from '../services/technicalReport';
import { generateTechnicalReportPdf, generateReportPdfFileName, downloadTechnicalReportPdf } from '../services/reportPdfGenerator';

interface TechnicalReportModalProps {
  appliedCorrections?: Array<{ id: string; label: string; appliedAt: number }>;
  isOpen: boolean;
  onClose: () => void;
  analysis: PreflightAnalysis | null;
  profile: ProductionProfile;
}

export const TechnicalReportModal: React.FC<TechnicalReportModalProps> = ({
  appliedCorrections = [],
  isOpen,
  onClose,
  analysis,
  profile,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'images' | 'colors' | 'fonts' | 'boxes' | 'pdfx' | 'rules'>('overview');
  const [isExporting, setIsExporting] = useState(false);

  if (!isOpen || !analysis) return null;

  const { document, ruleResults } = analysis;
  const { scoreSummary, errorCount, warningCount, approvedCount, results } = ruleResults;
  const p1 = document.pages[0];

  // Build full report data
  const snapshot = createAnalysisSnapshot(analysis, profile);
  const reportData = buildTechnicalReport(snapshot, null, profile);

  const handleExportPdf = async () => {
    try {
      setIsExporting(true);
      const pdfBytes = await generateTechnicalReportPdf(reportData);
      const fileName = generateReportPdfFileName(reportData.fileName, reportData.generatedAt);
      downloadTechnicalReportPdf(pdfBytes, fileName);
    } catch (err) {
      console.error('Erro ao exportar PDF do relatório:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const tabs = [
    { id: 'overview', label: 'Visão Geral', icon: FileText },
    { id: 'images', label: `Imagens (${document.pages.reduce((acc, p) => acc + (p.imageOccurrences?.length || 0), 0)})`, icon: ImageIcon },
    { id: 'colors', label: 'Cores', icon: Droplet },
    { id: 'fonts', label: `Fontes (${document.fonts?.length || 0})`, icon: Type },
    { id: 'boxes', label: 'Caixas Técnicas', icon: Crop },
    { id: 'pdfx', label: 'PDF/X & ISO', icon: ShieldCheck },
    { id: 'rules', label: `Regras (${results?.length || 0})`, icon: Layers },
  ];

  const statusBg = 
    scoreSummary.classification === 'approved'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : scoreSummary.classification === 'review'
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : 'bg-rose-50 text-rose-700 border-rose-200';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs select-none">
      <div className="bg-white rounded-3xl border border-slate-200 w-full max-w-5xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Top Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-50 text-[#4F46E5] border border-indigo-100">
              <FileCheck2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-[#0F172A] tracking-tight">
                  Relatório Técnico de Pré-impressão
                </h2>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${statusBg}`}>
                  {scoreSummary.classification === 'approved' ? 'Aprovado para Produção' : scoreSummary.classification === 'review' ? 'Revisão Necessária' : 'Inviável para Impressão'}
                </span>
              </div>
              <p className="text-xs text-[#64748B] font-medium mt-0.5 truncate max-w-md sm:max-w-xl">
                {analysis.fileName} • {formatBytes(analysis.fileSizeBytes)} • Perfil: {profile.name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={isExporting}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-bold shadow-xs transition-all cursor-pointer disabled:opacity-50"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Exportando...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Exportar PDF</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 border-b border-slate-100 flex items-center gap-1 overflow-x-auto bg-white">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`inline-flex items-center gap-2 py-3 px-3.5 border-b-2 text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'border-[#2563EB] text-[#2563EB]'
                    : 'border-transparent text-[#64748B] hover:text-[#0F172A] hover:border-slate-300'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-[#2563EB]' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 bg-[#F8FAFC]">
          {/* TAB 1: VISÃO GERAL */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-1">
                  <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Score Técnico</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black text-[#0F172A]">{scoreSummary.score}</span>
                    <span className="text-xs text-[#64748B]">/ 100</span>
                  </div>
                  <div className="flex items-center gap-2 pt-1 text-xs">
                    <span className="text-emerald-600 font-bold">{approvedCount} aprovados</span>
                    <span className="text-amber-600 font-bold">{warningCount} avisos</span>
                    <span className="text-rose-600 font-bold">{errorCount} erros</span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-1">
                  <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Perfil Aplicado</span>
                  <div className="text-base font-bold text-[#0F172A] truncate">{profile.name}</div>
                  <p className="text-xs text-[#64748B] truncate">{profile.category} • DPI mínimo: {profile.minEffectiveDpi}</p>
                </div>

                <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-1">
                  <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Dimensões Visuais</span>
                  <div className="text-base font-bold text-[#0F172A]">
                    {p1?.visualWidthMm ? `${p1.visualWidthMm} × ${p1.visualHeightMm} mm` : `${p1?.widthMm} × ${p1?.heightMm} mm`}
                  </div>
                  <p className="text-xs text-[#64748B]">
                    {p1?.orientation === 'landscape' ? 'Paisagem' : 'Retrato'} • {document.pageCount} página(s)
                  </p>
                </div>
              </div>

              {/* Metadata details */}
              <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-[#0F172A]">Metadados do Arquivo</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                  <div>
                    <span className="text-[#64748B] block">Título:</span>
                    <span className="font-semibold text-[#0F172A]">{document.metadata?.title || 'Não informado'}</span>
                  </div>
                  <div>
                    <span className="text-[#64748B] block">Criador:</span>
                    <span className="font-semibold text-[#0F172A]">{document.metadata?.creator || 'Não informado'}</span>
                  </div>
                  <div>
                    <span className="text-[#64748B] block">Produtor:</span>
                    <span className="font-semibold text-[#0F172A]">{document.metadata?.producer || 'Não informado'}</span>
                  </div>
                  <div>
                    <span className="text-[#64748B] block">Padrão PDF/X:</span>
                    <span className="font-semibold text-[#0F172A]">{document.pdfxInfo?.isDeclaredPdfX ? document.pdfxInfo.declaredVersion || 'PDF/X' : 'Não declarado'}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: IMAGENS */}
          {activeTab === 'images' && (
            <div className="space-y-4">
              {document.pages.some(p => p.imageOccurrences && p.imageOccurrences.length > 0) ? (
                <div className="overflow-x-auto bg-white rounded-2xl border border-slate-200/80 shadow-2xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/70 text-[#64748B] font-bold">
                        <th className="py-3 px-4">Nome / ID</th>
                        <th className="py-3 px-4">Página</th>
                        <th className="py-3 px-4">Pixels (W × H)</th>
                        <th className="py-3 px-4">Tamanho Exibido</th>
                        <th className="py-3 px-4">DPI Efetivo</th>
                        <th className="py-3 px-4">Espaço de Cor</th>
                        <th className="py-3 px-4">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-[#334155]">
                      {document.pages.flatMap((p, pIdx) => (p.imageOccurrences || []).map((img, iIdx) => {
                        const isLowDpi = (img.effectiveDpiX || 300) < profile.minEffectiveDpi;
                        const isRgb = img.colorSpace?.includes('RGB');
                        return (
                          <tr key={`${pIdx}_${iIdx}`} className="hover:bg-slate-50/50">
                            <td className="py-3 px-4 font-bold text-[#0F172A]">{img.name || img.id}</td>
                            <td className="py-3 px-4">{img.page || p.page}</td>
                            <td className="py-3 px-4">{img.widthPx} × {img.heightPx} px</td>
                            <td className="py-3 px-4">{img.displayWidthMm ? `${img.displayWidthMm} × ${img.displayHeightMm} mm` : '-'}</td>
                            <td className="py-3 px-4">
                              <span className={`font-bold ${isLowDpi ? 'text-amber-600' : 'text-emerald-600'}`}>
                                {img.effectiveDpiX} DPI
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${isRgb ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>
                                {img.colorSpace || 'DeviceCMYK'}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              {isLowDpi || isRgb ? (
                                <span className="text-amber-600 font-bold">Atenção</span>
                              ) : (
                                <span className="text-emerald-600 font-bold">Conforme</span>
                              )}
                            </td>
                          </tr>
                        );
                      }))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center bg-white rounded-2xl border border-slate-200/80 text-[#64748B]">
                  Nenhum objeto de imagem raster incorporado detectado no PDF.
                </div>
              )}
            </div>
          )}

          {/* TAB 3: CORES */}
          {activeTab === 'colors' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-wider text-[#0F172A]">Famílias Detectadas</h4>
                  <div className="flex flex-wrap gap-2">
                    {document.colorSummary.familiesDetected.map((f) => (
                      <span key={f} className="px-3 py-1 rounded-xl bg-slate-100 text-slate-800 font-bold text-xs">
                        {f}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-wider text-[#0F172A]">Separações e Spot Colors</h4>
                  {document.colorSummary.hasSpotColors ? (
                    <p className="text-xs text-amber-700 font-semibold">Cores especiais (Spot/Pantone) detectadas.</p>
                  ) : (
                    <p className="text-xs text-emerald-700 font-semibold">Nenhuma tinta especial. Processo puro em quadricromia (CMYK).</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: FONTES */}
          {activeTab === 'fonts' && (
            <div className="space-y-4">
              {document.fonts && document.fonts.length > 0 ? (
                <div className="overflow-x-auto bg-white rounded-2xl border border-slate-200/80 shadow-2xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/70 text-[#64748B] font-bold">
                        <th className="py-3 px-4">Nome da Fonte</th>
                        <th className="py-3 px-4">Tipo</th>
                        <th className="py-3 px-4">Incorporação</th>
                        <th className="py-3 px-4">Páginas Usadas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-[#334155]">
                      {document.fonts.map((f, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="py-3 px-4 font-bold text-[#0F172A]">{f.cleanFontName || f.baseFont}</td>
                          <td className="py-3 px-4">{f.subtype}</td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                              f.isEmbedded === 'yes' || f.isEmbedded === 'subset'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}>
                              {f.isEmbedded === 'subset' ? 'Subconjunto (OK)' : f.isEmbedded === 'yes' ? 'Incorporada (OK)' : 'Não Incorporada'}
                            </span>
                          </td>
                          <td className="py-3 px-4">{f.usedPages?.join(', ') || '1'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center bg-white rounded-2xl border border-slate-200/80 text-[#64748B]">
                  Nenhuma fonte externa encontrada (todo texto convertido em curvas ou documento sem texto).
                </div>
              )}
            </div>
          )}

          {/* TAB 5: CAIXAS TÉCNICAS */}
          {activeTab === 'boxes' && (
            <div className="space-y-4">
              <div className="overflow-x-auto bg-white rounded-2xl border border-slate-200/80 shadow-2xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/70 text-[#64748B] font-bold">
                      <th className="py-3 px-4">Página</th>
                      <th className="py-3 px-4">MediaBox (Bruto)</th>
                      <th className="py-3 px-4">TrimBox (Corte Final)</th>
                      <th className="py-3 px-4">BleedBox (Sangria)</th>
                      <th className="py-3 px-4">CropBox</th>
                      <th className="py-3 px-4">Orientação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-[#334155]">
                    {document.pages.map((p) => (
                      <tr key={p.page} className="hover:bg-slate-50/50">
                        <td className="py-3 px-4 font-bold text-[#0F172A]">Pág. {p.page}</td>
                        <td className="py-3 px-4">{p.mediaBox?.widthMm} × {p.mediaBox?.heightMm} mm</td>
                        <td className="py-3 px-4">
                          {p.trimBox ? `${p.trimBox.widthMm} × ${p.trimBox.heightMm} mm` : <span className="text-amber-600 font-bold">Não definida</span>}
                        </td>
                        <td className="py-3 px-4">
                          {p.bleedBox ? `${p.bleedBox.widthMm} × ${p.bleedBox.heightMm} mm` : <span className="text-amber-600 font-bold">Não definida</span>}
                        </td>
                        <td className="py-3 px-4">{p.cropBox ? `${p.cropBox.widthMm} × ${p.cropBox.heightMm} mm` : '-'}</td>
                        <td className="py-3 px-4">{p.orientation === 'landscape' ? 'Paisagem' : 'Retrato'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 6: PDF/X */}
          {activeTab === 'pdfx' && (
            <div className="space-y-4">
              <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-[#0F172A]">Norma ISO 15930 (PDF/X)</h4>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${document.pdfxInfo?.isDeclaredPdfX ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                    {document.pdfxInfo?.isDeclaredPdfX ? 'Declarado' : 'Não Declarado'}
                  </span>
                </div>
                <p className="text-xs text-[#475569] leading-relaxed">
                  {document.pdfxInfo?.isDeclaredPdfX 
                    ? `O arquivo possui declaração de conformidade ${document.pdfxInfo.declaredVersion || 'PDF/X'}.`
                    : 'O arquivo não possui Output Intent normativo embutido. Recomendamos a preparação para PDF/X-4.'
                  }
                </p>
              </div>
            </div>
          )}

          {/* TAB 7: REGRAS */}
          {activeTab === 'rules' && (
            <div className="space-y-3">
              {results.map((r, idx) => (
                <div key={idx} className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs flex items-start gap-3">
                  <div className="mt-0.5">
                    {r.status === 'passed' && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                    {r.status === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-500" />}
                    {r.status === 'error' && <XCircle className="w-5 h-5 text-rose-500" />}
                  </div>
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#0F172A]">{r.ruleName}</span>
                      <span className="text-[10px] font-mono text-slate-400">{r.ruleId}</span>
                    </div>
                    <p className="text-xs text-[#64748B]">{r.description}</p>
                    <div className="text-[11px] text-slate-700 bg-slate-50 p-2 rounded-xl border border-slate-100 mt-2 font-mono">
                      <strong>Evidência:</strong> {r.evidence}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
