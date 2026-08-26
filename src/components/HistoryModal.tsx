import React, { useEffect, useState } from 'react';
import { X, History, FileText, Download, Trash2, Loader2, ArrowRight, CheckCircle2, AlertTriangle, XCircle, FileCheck2 } from 'lucide-react';
import type { AnalysisRecordSummary } from '../domain/beta';
import { LocalStorageProvider } from '../storage/LocalStorageProvider';
import { formatBytes } from '../../server/pdfExtractor';
import { buildTechnicalReport } from '../services/technicalReport';
import { generateTechnicalReportPdf, generateReportPdfFileName, downloadTechnicalReportPdf } from '../services/reportPdfGenerator';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAnalysis?: (id: string) => void;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({ isOpen, onClose, onSelectAnalysis }) => {
  const [history, setHistory] = useState<AnalysisRecordSummary[]>([]);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);
  const storage = new LocalStorageProvider();

  useEffect(() => {
    if (isOpen) {
      setExportError(null);
      setExportSuccess(null);
      storage.listAnalyses().then(setHistory);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDelete = async (id: string) => {
    await storage.deleteAnalysis(id);
    setHistory((prev) => prev.filter((a) => a.id !== id));
  };

  const handleExportReport = async (item: AnalysisRecordSummary) => {
    try {
      setExportError(null);
      setExportSuccess(null);
      setExportingId(item.id);

      let reportData = item.reportData;
      if (!reportData && item.initialSnapshot && item.initialSnapshot.documentSummary) {
        reportData = buildTechnicalReport(
          item.initialSnapshot,
          item.postFixSnapshot ? { ruleResults: { results: item.postFixSnapshot.rules, scoreSummary: { score: item.postFixSnapshot.score, classification: item.postFixSnapshot.classification } } } as any : null,
          { id: item.productionProfileId, name: item.productName, category: item.segmentName, rules: {} } as any
        );
      }

      if (!reportData) {
        throw new Error('Relatório técnico completo indisponível para este registro. Metadados salvos não contêm snapshot estrutural.');
      }

      const pdfBytes = await generateTechnicalReportPdf(reportData);
      const fileName = generateReportPdfFileName(reportData.fileName, reportData.generatedAt);
      downloadTechnicalReportPdf(pdfBytes, fileName);
      setExportSuccess(`Relatório técnico de "${item.fileName}" gerado e baixado com sucesso.`);
      setTimeout(() => setExportSuccess(null), 4000);
    } catch (err: any) {
      console.error('Erro ao exportar relatório do histórico:', err);
      setExportError(`Falha ao gerar PDF do relatório para "${item.fileName}": ${err?.message || 'Erro interno'}`);
    } finally {
      setExportingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs select-none">
      <div className="bg-white rounded-3xl border border-slate-200 w-full max-w-3xl p-6 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-50 text-[#4F46E5] border border-indigo-100">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-[#0F172A] tracking-tight">
                Histórico de Análises
              </h3>
              <p className="text-xs text-[#64748B] font-medium">
                Registros de arquivos processados e relatórios técnicos disponíveis para exportação.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {exportError && (
          <div className="mx-6 mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
            <span>{exportError}</span>
          </div>
        )}

        {exportSuccess && (
          <div className="mx-6 mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{exportSuccess}</span>
          </div>
        )}

        {/* Content list */}
        <div className="py-4 overflow-y-auto flex-1 space-y-3">
          {history.length === 0 ? (
            <div className="p-12 text-center text-[#64748B] space-y-2">
              <FileText className="w-8 h-8 mx-auto text-slate-300 stroke-[1.5]" />
              <p className="text-sm font-semibold text-slate-700">Nenhuma análise no histórico</p>
              <p className="text-xs text-slate-400">Os arquivos verificados aparecerão salvos aqui automaticamente.</p>
            </div>
          ) : (
            history.map((item) => {
              const dateStr = new Date(item.createdAt).toLocaleString('pt-BR');
              const statusBg =
                item.status === 'approved'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : item.status === 'review'
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-rose-50 text-rose-700 border-rose-200';

              const hasReportData = Boolean(item.reportData || (item.initialSnapshot && item.initialSnapshot.documentSummary));

              return (
                <div
                  key={item.id}
                  className="p-4 rounded-2xl bg-slate-50/70 hover:bg-slate-50 border border-slate-200/80 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#0F172A] truncate max-w-xs sm:max-w-md">
                        {item.fileName}
                      </span>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${statusBg}`}>
                        Score {item.score}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-[#64748B]">
                      <span>{dateStr}</span>
                      <span>•</span>
                      <span>{formatBytes(item.fileSizeBytes)}</span>
                      <span>•</span>
                      <span className="truncate max-w-[150px]">{item.productName || 'Perfil Padrão'}</span>
                    </div>
                    {!hasReportData && (
                      <p className="text-[10px] text-slate-400 italic">
                        Relatório técnico completo indisponível para este registro antigo (apenas metadados).
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleExportReport(item)}
                      disabled={!hasReportData || exportingId === item.id}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-colors ${
                        hasReportData
                          ? 'bg-white hover:bg-slate-100 border-slate-200 text-[#334155] shadow-2xs cursor-pointer'
                          : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed opacity-60'
                      }`}
                      title={
                        hasReportData
                          ? 'Exportar PDF do Relatório Técnico'
                          : 'Relatório indisponível para este registro antigo (apenas metadados salvos).'
                      }
                    >
                      {exportingId === item.id ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                          <span>Gerando relatório...</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-3.5 h-3.5 text-slate-500" />
                          <span>Relatório</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                      title="Excluir do Histórico"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
