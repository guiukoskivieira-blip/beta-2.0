import React, { useEffect, useState } from 'react';
import { X, History, FileText, Download, Trash2, Loader2, ArrowRight } from 'lucide-react';
import type { AnalysisRecordSummary } from '../domain/beta';
import { LocalStorageProvider } from '../storage/LocalStorageProvider';
import { formatBytes } from '../../server/pdfExtractor';
import { buildTechnicalReport } from '../services/technicalReport';
import { generateTechnicalReportPdf, generateReportPdfFileName, downloadTechnicalReportPdf } from '../services/reportPdfGenerator';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({ isOpen, onClose }) => {
  const [history, setHistory] = useState<AnalysisRecordSummary[]>([]);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const storage = new LocalStorageProvider();

  useEffect(() => {
    if (isOpen) {
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
      setExportingId(item.id);

      let reportData = item.reportData;
      if (!reportData && item.initialSnapshot) {
        reportData = buildTechnicalReport(
          item.initialSnapshot,
          item.postFixSnapshot ? { ruleResults: { results: item.postFixSnapshot.rules, scoreSummary: { score: item.postFixSnapshot.score, classification: item.postFixSnapshot.classification } } } as any : null,
          { id: item.productionProfileId, name: item.productName, category: item.segmentName, rules: {} } as any
        );
      }

      if (!reportData) {
        // Fallback básico caso o registro seja legado sem snapshot completo
        const syntheticSnapshot: any = {
          id: item.id,
          createdAt: item.createdAt,
          fileName: item.fileName,
          fileSizeBytes: item.fileSizeBytes,
          profileId: item.productionProfileId,
          profileName: item.productName,
          profileCategory: item.segmentName,
          score: item.score,
          classification: item.status,
          label: item.status === 'approved' ? 'Pronto para Impressão' : item.status === 'review' ? 'Revisão Necessária' : 'Impressão Inviável',
          errorCount: item.errorCount,
          warningCount: item.warningCount,
          approvedCount: item.approvedCount,
          undeterminedCount: 0,
          rules: [],
          documentSummary: {
            pageCount: 1,
            dimensionsSummary: 'Dimensão registrada',
            hasRgb: false,
            hasCmyk: true,
            hasSpotColors: false,
            familiesDetected: ['DeviceCMYK'],
            isDeclaredPdfX: false,
          },
        };
        reportData = buildTechnicalReport(syntheticSnapshot);
      }

      const pdfBytes = await generateTechnicalReportPdf(reportData);
      const fileName = generateReportPdfFileName(reportData.fileName, reportData.generatedAt);
      downloadTechnicalReportPdf(pdfBytes, fileName);
    } catch (err) {
      console.error('Erro ao exportar relatório do histórico:', err);
    } finally {
      setExportingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
      <div className="bg-[#101722] border border-[#243244] rounded-2xl w-full max-w-2xl p-6 shadow-2xl relative max-h-[90vh] flex flex-col">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-[#8E98A7] hover:text-white p-1"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mb-4">
          <h3 className="text-xl font-bold text-white flex items-center">
            <History className="w-5 h-5 mr-2 text-[#007BFF]" />
            Histórico de Análises e Relatórios
          </h3>
          <p className="text-xs text-[#8E98A7] mt-1">
            Registro das últimas checagens de pré-impressão realizadas com opção de exportação de relatório PDF.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {history.length === 0 ? (
            <div className="text-center py-12 text-[#8E98A7] text-xs">
              Nenhuma análise salva no histórico recente.
            </div>
          ) : (
            history.map((item) => {
              const hasComparison = Boolean(item.postFixSnapshot && item.initialSnapshot);
              return (
                <div
                  key={item.id}
                  className="bg-[#0B1018] border border-[#243244] rounded-xl p-4 flex items-center justify-between gap-4"
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-[#16202E] flex items-center justify-center text-[#007BFF] shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold text-white truncate max-w-xs sm:max-w-md">
                        {item.fileName}
                      </h4>
                      <p className="text-xs text-[#8E98A7]">
                        {new Date(item.createdAt).toLocaleString('pt-BR')} • {formatBytes(item.fileSizeBytes)}
                      </p>
                      {hasComparison && (
                        <span className="inline-flex items-center text-[10px] font-medium text-[#00D18F] mt-1">
                          Corrigido: {item.initialSnapshot?.score} <ArrowRight className="w-2.5 h-2.5 mx-1" /> {item.score}/100
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-3 shrink-0">
                    <div className="text-right">
                      <span className="text-sm font-bold text-white block">
                        {item.score}/100
                      </span>
                      <span className="text-[10px] text-[#8E98A7] uppercase font-semibold">
                        {item.status}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleExportReport(item)}
                      disabled={exportingId === item.id}
                      title="Exportar Relatório Técnico em PDF"
                      className="p-2 text-[#A6B4C9] hover:text-[#007BFF] bg-[#16202E] hover:bg-[#1C283A] rounded-lg transition-colors cursor-pointer"
                    >
                      {exportingId === item.id ? (
                        <Loader2 className="w-4 h-4 animate-spin text-[#007BFF]" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      title="Excluir do histórico"
                      className="p-2 text-[#8E98A7] hover:text-[#FF4D4D] rounded-lg transition-colors cursor-pointer"
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
