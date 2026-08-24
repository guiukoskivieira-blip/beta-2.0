import React from 'react';
import { 
  FolderOpen, 
  FileText, 
  Download, 
  RotateCcw, 
  ArrowLeft, 
  Plus, 
  Trash2, 
  Calendar, 
  Layers, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle,
  FileCheck2,
  Sliders
} from 'lucide-react';
import type { PreflightAnalysis } from '../types';
import type { ProductionProfile } from '../utils/productionProfiles';
import type { AnalysisRecordSummary } from '../domain/beta';
import { formatBytes } from '../../server/pdfExtractor';

interface FilesManagementViewProps {
  currentAnalysis: PreflightAnalysis | null;
  workingFile: File | null;
  originalFile: File | null;
  profile: ProductionProfile;
  appliedCorrections: Array<{ id: string; label: string; appliedAt: number }>;
  onGoToDashboard: () => void;
  onDownloadWorkingPdf: () => void;
  onRestoreOriginal: () => void;
  onOpenReportModal: () => void;
  onReset: () => void;
  historyList: AnalysisRecordSummary[];
  onSelectHistoryItem?: (id: string) => void;
  onDeleteHistoryItem?: (id: string) => void;
  onExportHistoryReport?: (item: AnalysisRecordSummary) => void;
}

export const FilesManagementView: React.FC<FilesManagementViewProps> = ({
  currentAnalysis,
  workingFile,
  originalFile,
  profile,
  appliedCorrections,
  onGoToDashboard,
  onDownloadWorkingPdf,
  onRestoreOriginal,
  onOpenReportModal,
  onReset,
  historyList,
  onSelectHistoryItem,
  onDeleteHistoryItem,
  onExportHistoryReport,
}) => {
  return (
    <div className="space-y-6 select-none animate-in fade-in duration-150">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h2 className="text-xl font-black text-[#0F172A] tracking-tight flex items-center gap-2.5">
            <FolderOpen className="w-6 h-6 text-[#2563EB]" />
            Arquivos & Sessão de Trabalho
          </h2>
          <p className="text-xs text-[#64748B] font-medium mt-1">
            Gerencie o arquivo atualmente em análise, seu histórico de correções acumuladas e documentos salvos.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {currentAnalysis && (
            <button
              type="button"
              onClick={onGoToDashboard}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Voltar para a Inspeção</span>
            </button>
          )}
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Analisar Novo Arquivo</span>
          </button>
        </div>
      </div>

      {/* Active File Session Card */}
      {currentAnalysis && originalFile ? (
        <div className="p-6 rounded-3xl bg-white border border-slate-200/90 shadow-2xs space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-black text-[#0F172A]">{originalFile.name}</span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-[#2563EB] border border-blue-200">
                  Arquivo em Sessão Ativa
                </span>
                {appliedCorrections.length > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {appliedCorrections.length} correção(ões) acumulada(s)
                  </span>
                )}
              </div>
              <p className="text-xs text-[#64748B]">
                Tamanho: {formatBytes(workingFile?.size || originalFile.size)} • Perfil: {profile.name} • {currentAnalysis.document.pageCount} página(s)
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {appliedCorrections.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={onDownloadWorkingPdf}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Baixar Arquivo Corrigido</span>
                  </button>
                  <button
                    type="button"
                    onClick={onRestoreOriginal}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
                    title="Desfazer todas as correções e retornar ao PDF original"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Restaurar Original</span>
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={onOpenReportModal}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-[#4F46E5] text-xs font-bold border border-indigo-200 transition-all cursor-pointer"
              >
                <FileCheck2 className="w-4 h-4" />
                <span>Ver Relatório Técnico</span>
              </button>
            </div>
          </div>

          {/* Applied Corrections Timeline */}
          <div className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-[#0F172A]">
              Histórico de Alterações na Sessão
            </h4>
            {appliedCorrections.length === 0 ? (
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/70 text-xs text-slate-500">
                Nenhuma correção automática foi aplicada ao arquivo ainda. Execute ajustes de cores, caixas ou PDF/X no painel principal para acumular alterações.
              </div>
            ) : (
              <div className="space-y-2">
                {appliedCorrections.map((c, idx) => (
                  <div key={idx} className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
                        ✓
                      </div>
                      <div>
                        <span className="font-bold text-[#0F172A] block">{c.label}</span>
                        <span className="text-[11px] text-slate-400">
                          Aplicado em {new Date(c.appliedAt).toLocaleTimeString('pt-BR')} sobre o arquivo de trabalho
                        </span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold text-[10px]">
                      Ativo no Working PDF
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="p-10 rounded-3xl bg-white border border-slate-200/90 text-center space-y-3">
          <FileText className="w-10 h-10 text-slate-300 mx-auto" />
          <h3 className="text-sm font-black text-[#0F172A]">Nenhum Arquivo em Sessão Ativa</h3>
          <p className="text-xs text-[#64748B] max-w-md mx-auto">
            Envie um documento PDF na aba Dashboard para iniciar a validação automatizada e aplicar correções acumulativas.
          </p>
          <button
            type="button"
            onClick={onReset}
            className="px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-bold transition-all shadow-xs"
          >
            Enviar Novo Arquivo
          </button>
        </div>
      )}

      {/* Recent Files Table from Local Storage */}
      <div className="p-6 rounded-3xl bg-white border border-slate-200/90 shadow-2xs space-y-4">
        <h3 className="text-sm font-black text-[#0F172A] tracking-tight uppercase">
          Análises Anteriores e Relatórios Salvos
        </h3>

        {historyList.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 bg-slate-50 rounded-2xl border border-slate-200/70">
            Nenhum registro histórico salvo no navegador.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-[#64748B] font-bold">
                  <th className="py-3 px-4">Arquivo</th>
                  <th className="py-3 px-4">Data</th>
                  <th className="py-3 px-4">Tamanho</th>
                  <th className="py-3 px-4">Perfil</th>
                  <th className="py-3 px-4">Score</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-[#334155]">
                {historyList.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4 font-bold text-[#0F172A] truncate max-w-xs">{item.fileName}</td>
                    <td className="py-3 px-4 text-[#64748B]">{new Date(item.createdAt).toLocaleString('pt-BR')}</td>
                    <td className="py-3 px-4">{formatBytes(item.fileSizeBytes)}</td>
                    <td className="py-3 px-4 text-[#64748B] truncate max-w-[150px]">{item.productName || 'Perfil Padrão'}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        item.status === 'approved'
                          ? 'bg-emerald-50 text-emerald-700'
                          : item.status === 'review'
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-rose-50 text-rose-700'
                      }`}>
                        {item.score}/100
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right space-x-2">
                      {onExportHistoryReport && (
                        <button
                          type="button"
                          onClick={() => onExportHistoryReport(item)}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] transition-colors"
                          title="Exportar Relatório PDF"
                        >
                          PDF
                        </button>
                      )}
                      {onDeleteHistoryItem && (
                        <button
                          type="button"
                          onClick={() => onDeleteHistoryItem(item.id)}
                          className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          title="Excluir"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
