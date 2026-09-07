import React, { useState } from 'react';
import { 
  X, 
  FileText, 
  Download, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  HelpCircle,
  Crop, 
  Droplet, 
  Type, 
  ShieldCheck, 
  Sparkles,
  Loader2,
  Sliders,
  ChevronRight,
  Info
} from 'lucide-react';
import type { AnalysisRecordSummary } from '../domain/beta';
import type { SnapshotRuleItem, RuleComparisonItem } from '../services/technicalReport';
import { formatBytes } from '../../server/pdfExtractor';
import { checkReportExportEligibility } from './HistoryModal';
import { useModalAccessibility } from '../hooks/useModalAccessibility';

export interface AnalysisDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: AnalysisRecordSummary | null;
  onExportReport?: (item: AnalysisRecordSummary) => Promise<void> | void;
}

export const AnalysisDetailModal: React.FC<AnalysisDetailModalProps> = ({
  isOpen,
  onClose,
  record,
  onExportReport,
}) => {
  const { closeButtonRef, handleBackdropClick, handleContentClick } = useModalAccessibility({
    isOpen,
    onClose,
  });

  const [activeTab, setActiveTab] = useState<'overview' | 'rules' | 'fixes'>('overview');
  const [ruleFilter, setRuleFilter] = useState<'all' | 'issues' | 'approved'>('all');
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  if (!record) {
    return (
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs select-none"
        onClick={handleBackdropClick}
        role="dialog"
        aria-modal="true"
      >
        <div 
          className="bg-white rounded-3xl border border-slate-200 w-full max-w-md p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150"
          onClick={handleContentClick}
        >
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Registro Indisponível
            </h3>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="text-xs text-slate-600">
            Não foi possível carregar os detalhes deste registro histórico. O item pode ter sido removido ou estar corrompido.
          </p>
          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    );
  }

  const snapshot = record.initialSnapshot;
  const docSummary = snapshot?.documentSummary;
  const snapshotRules: SnapshotRuleItem[] = snapshot?.rules || [];
  const reportData = record.reportData;
  const comparisonResults: RuleComparisonItem[] = reportData?.comparisonResults || [];
  const hasFixes = Boolean(reportData?.hasFixApplied || record.postFixSnapshot || comparisonResults.length > 0);

  const dateFormatted = new Date(record.createdAt).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const statusConfig = {
    approved: {
      label: 'Pronto para Produção',
      badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      icon: CheckCircle2,
      iconColor: 'text-emerald-600',
      bgCard: 'bg-emerald-50/40 border-emerald-100',
    },
    review: {
      label: 'Requer Atenção',
      badge: 'bg-amber-50 text-amber-700 border-amber-200',
      icon: AlertTriangle,
      iconColor: 'text-amber-600',
      bgCard: 'bg-amber-50/40 border-amber-100',
    },
    blocked: {
      label: 'Bloqueado / Revisão Manual',
      badge: 'bg-rose-50 text-rose-700 border-rose-200',
      icon: XCircle,
      iconColor: 'text-rose-600',
      bgCard: 'bg-rose-50/40 border-rose-100',
    },
  }[record.status] || {
    label: record.status,
    badge: 'bg-slate-50 text-slate-700 border-slate-200',
    icon: HelpCircle,
    iconColor: 'text-slate-500',
    bgCard: 'bg-slate-50 border-slate-100',
  };

  const StatusIcon = statusConfig.icon;

  // Extract rule-specific technical evidences safely
  const findRuleEvidence = (ruleIds: string[], categories: string[] = []) => {
    if (!snapshotRules.length) return null;
    const found = snapshotRules.find(
      (r) => ruleIds.includes(r.ruleId) || categories.includes(r.category)
    );
    return found ? { status: rStatusLabel(found.status), evidence: found.evidence, rawStatus: found.status, explanation: found.explanation } : null;
  };

  function rStatusLabel(s: string) {
    if (s === 'approved') return 'Aprovado';
    if (s === 'warning') return 'Alerta';
    if (s === 'error') return 'Erro';
    if (s === 'undetermined') return 'Indeterminado';
    return s;
  }

  // Technical metrics
  const dimEvidence = docSummary?.dimensionsSummary || findRuleEvidence(['RULE-PROF-DIM-001', 'RULE-UNIV-DIM-001'], ['dimension'])?.evidence;
  const pageCountText = (docSummary?.pageCount !== undefined && docSummary?.pageCount !== null)
    ? `${docSummary.pageCount} página(s)`
    : 'Não informado';
  const dpiRule = findRuleEvidence(['RULE-PROF-RES-001', 'RULE-PROF-DPI-001'], ['dpi', 'resolution']);
  const colorRule = findRuleEvidence(['RULE-PROF-CLR-001'], ['color']);
  const fontRule = findRuleEvidence(['RULE-PROF-FNT-001'], ['font', 'typography']);
  const bleedRule = findRuleEvidence(['RULE-PROF-BLD-001'], ['bleed']);
  const trpRule = findRuleEvidence(['RULE-PROF-TRP-001'], ['transparency']);
  const isoRule = findRuleEvidence(['RULE-PROF-ISO-001', 'RULE-UNIV-STR-002'], ['iso', 'pdfx']);

  // Color families display
  const colorFamiliesText = docSummary?.familiesDetected?.length
    ? docSummary.familiesDetected.join(', ')
    : (docSummary?.hasCmyk ? 'CMYK' : null);

  // PDF/X text
  const pdfxText = docSummary
    ? docSummary.isDeclaredPdfX
      ? `${docSummary.declaredPdfX || 'Declarado'} (${docSummary.verifiedPdfX ? 'Validado' : 'Não certificado'})`
      : 'Não declarado'
    : null;

  const exportEligibility = checkReportExportEligibility(record);

  const handleExport = async () => {
    if (!onExportReport || !exportEligibility.eligible) return;
    try {
      setIsExporting(true);
      setExportMessage(null);
      await onExportReport(record);
      setExportMessage({ type: 'success', text: 'Relatório baixado com sucesso!' });
      setTimeout(() => setExportMessage(null), 4000);
    } catch (err: any) {
      setExportMessage({ type: 'error', text: err?.message || 'Falha ao exportar relatório.' });
    } finally {
      setIsExporting(false);
    }
  };

  const filteredRules = snapshotRules.filter((r) => {
    if (ruleFilter === 'issues') return r.status === 'error' || r.status === 'warning' || r.status === 'undetermined';
    if (ruleFilter === 'approved') return r.status === 'approved';
    return true;
  });

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs select-none"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="analysis-detail-title"
    >
      <div 
        className="bg-white rounded-3xl border border-slate-200 w-full max-w-4xl p-5 sm:p-6 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={handleContentClick}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-2xl bg-indigo-50 text-[#4F46E5] border border-indigo-100 shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 id="analysis-detail-title" className="text-base sm:text-lg font-black text-[#0F172A] tracking-tight truncate max-w-sm sm:max-w-xl">
                {record.fileName}
              </h2>
              <div className="flex items-center gap-2 text-xs text-[#64748B] flex-wrap">
                <span>{dateFormatted}</span>
                <span>•</span>
                <span>{formatBytes(record.fileSizeBytes)}</span>
                <span>•</span>
                <span className="font-semibold text-slate-700">{record.productName || record.segmentName || 'Perfil Geral'}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-2">
            {exportEligibility.eligible && onExportReport && (
              <button
                type="button"
                onClick={handleExport}
                disabled={isExporting}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-[#4F46E5] border border-indigo-200 text-xs font-bold transition-colors cursor-pointer"
                title="Exportar PDF do Relatório Técnico"
              >
                {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                <span>Exportar Relatório</span>
              </button>
            )}
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {exportMessage && (
          <div className={`mt-3 p-2.5 rounded-xl border text-xs font-semibold flex items-center gap-2 shrink-0 ${
            exportMessage.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}>
            {exportMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />}
            <span>{exportMessage.text}</span>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 mt-4 border-b border-slate-100 pb-2 shrink-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'overview'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Visão Geral e Métricas
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('rules')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'rules'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span>Verificações Técnicas</span>
            {snapshotRules.length > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                activeTab === 'rules' ? 'bg-indigo-700 text-white' : 'bg-slate-200 text-slate-700'
              }`}>
                {snapshotRules.length}
              </span>
            )}
          </button>
          {hasFixes && (
            <button
              type="button"
              onClick={() => setActiveTab('fixes')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'fixes'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Correções Registradas</span>
            </button>
          )}
        </div>

        {/* Scrollable Body Content */}
        <div className="py-4 overflow-y-auto flex-1 space-y-4 pr-1">
          {activeTab === 'overview' && (
            <div className="space-y-4">
              {/* Score & Verdict Card */}
              <div className={`p-4 sm:p-5 rounded-2xl border ${statusConfig.bgCard} flex flex-col sm:flex-row sm:items-center justify-between gap-4`}>
                <div className="flex items-center gap-3.5">
                  <div className={`p-3 rounded-2xl bg-white shadow-2xs border border-slate-200/60 ${statusConfig.iconColor}`}>
                    <StatusIcon className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-0.5 rounded-md text-xs font-bold border ${statusConfig.badge}`}>
                        {statusConfig.label}
                      </span>
                      <span className="text-xs font-bold text-slate-900">
                        Score: {record.score}/100
                      </span>
                    </div>
                    {snapshot?.reviewExplanation ? (
                      <p className="text-xs text-slate-700 mt-1 font-medium">
                        {snapshot.reviewExplanation}
                      </p>
                    ) : (
                      <p className="text-xs text-slate-500 mt-0.5">
                        Resultado consolidado da análise conforme as regras do perfil de produção.
                      </p>
                    )}
                  </div>
                </div>

                {/* Counters Pill */}
                <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
                  <div className="px-3 py-1.5 rounded-xl bg-white border border-slate-200/80 shadow-2xs text-center">
                    <span className="text-xs font-bold text-emerald-700 block">{record.approvedCount}</span>
                    <span className="text-[10px] text-slate-400 font-medium">Aprovados</span>
                  </div>
                  <div className="px-3 py-1.5 rounded-xl bg-white border border-slate-200/80 shadow-2xs text-center">
                    <span className="text-xs font-bold text-amber-700 block">{record.warningCount}</span>
                    <span className="text-[10px] text-slate-400 font-medium">Alertas</span>
                  </div>
                  <div className="px-3 py-1.5 rounded-xl bg-white border border-slate-200/80 shadow-2xs text-center">
                    <span className="text-xs font-bold text-rose-700 block">{record.errorCount}</span>
                    <span className="text-[10px] text-slate-400 font-medium">Erros</span>
                  </div>
                </div>
              </div>

              {/* Technical Specifications Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {/* Dimensions & Pages */}
                <div className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-200/80 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                    <Crop className="w-4 h-4 text-indigo-600" />
                    <span>Dimensões & Páginas</span>
                  </div>
                  <div className="text-xs text-slate-700 space-y-0.5">
                    <p><strong>Formato:</strong> {dimEvidence || 'Não registrado'}</p>
                    <p><strong>Páginas:</strong> {pageCountText || 'Não registrado'}</p>
                  </div>
                </div>

                {/* Colors */}
                <div className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-200/80 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                    <Droplet className="w-4 h-4 text-indigo-600" />
                    <span>Espaço de Cor</span>
                  </div>
                  <div className="text-xs text-slate-700 space-y-0.5">
                    <p><strong>Famílias:</strong> {colorFamiliesText || (colorRule?.evidence ? colorRule.evidence : 'Não registrado')}</p>
                    {colorRule && <p><strong>Status:</strong> {colorRule.status}</p>}
                  </div>
                </div>

                {/* Resolution / DPI */}
                <div className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-200/80 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                    <Sliders className="w-4 h-4 text-indigo-600" />
                    <span>Resolução / DPI</span>
                  </div>
                  <div className="text-xs text-slate-700 space-y-0.5">
                    <p><strong>Evidência:</strong> {dpiRule?.evidence || 'Não registrado'}</p>
                    {dpiRule && <p><strong>Status:</strong> {dpiRule.status}</p>}
                  </div>
                </div>

                {/* Bleed / Technical Boxes */}
                <div className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-200/80 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                    <Crop className="w-4 h-4 text-indigo-600" />
                    <span>Sangria & Caixas</span>
                  </div>
                  <div className="text-xs text-slate-700 space-y-0.5">
                    <p><strong>Sangria:</strong> {bleedRule?.evidence || 'Não registrado'}</p>
                    {bleedRule && <p><strong>Status:</strong> {bleedRule.status}</p>}
                  </div>
                </div>

                {/* Fonts */}
                <div className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-200/80 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                    <Type className="w-4 h-4 text-indigo-600" />
                    <span>Tipografia & Fontes</span>
                  </div>
                  <div className="text-xs text-slate-700 space-y-0.5">
                    <p><strong>Evidência:</strong> {fontRule?.evidence || 'Não registrado'}</p>
                    {fontRule && <p><strong>Status:</strong> {fontRule.status}</p>}
                  </div>
                </div>

                {/* PDF/X & ISO */}
                <div className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-200/80 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                    <ShieldCheck className="w-4 h-4 text-indigo-600" />
                    <span>Norma PDF/X & ISO</span>
                  </div>
                  <div className="text-xs text-slate-700 space-y-0.5">
                    <p><strong>Conformidade:</strong> {pdfxText || isoRule?.evidence || 'Não registrado'}</p>
                    {isoRule && <p><strong>Status:</strong> {isoRule.status}</p>}
                  </div>
                </div>
              </div>

              {/* Notice if legacy minimal record */}
              {snapshotRules.length === 0 && (
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-500 flex items-start gap-2.5">
                  <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-slate-700">Registro histórico resumido:</span> Este registro possui os metadados principais salvos. Análises mais detalhadas e snapshots completos de regras estão disponíveis para análises processadas no motor atual.
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'rules' && (
            <div className="space-y-3">
              {/* Filter controls */}
              <div className="flex items-center justify-between gap-2 pb-2">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setRuleFilter('all')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                      ruleFilter === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Todas ({snapshotRules.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRuleFilter('issues')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                      ruleFilter === 'issues' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                    }`}
                  >
                    Pendências ({record.errorCount + record.warningCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRuleFilter('approved')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                      ruleFilter === 'approved' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                    }`}
                  >
                    Aprovadas ({record.approvedCount})
                  </button>
                </div>
                <span className="text-[11px] text-slate-400 font-medium">
                  {filteredRules.length} regra(s) listada(s)
                </span>
              </div>

              {filteredRules.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 bg-slate-50 rounded-2xl border border-slate-200">
                  Nenhuma regra encontrada para o filtro selecionado.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredRules.map((rule) => {
                    const isError = rule.status === 'error';
                    const isWarn = rule.status === 'warning';
                    const isApp = rule.status === 'approved';

                    const badgeStyle = isError
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : isWarn
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : isApp
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-slate-100 text-slate-700 border-slate-200';

                    return (
                      <div
                        key={rule.ruleId}
                        className="p-3.5 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-2 hover:border-slate-300 transition-colors"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900">{rule.title}</span>
                            <span className="text-[10px] text-slate-400 font-mono">[{rule.ruleId}]</span>
                          </div>
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border self-start sm:self-auto ${badgeStyle}`}>
                            {rStatusLabel(rule.status)}
                          </span>
                        </div>

                        <div className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100 space-y-1 font-medium">
                          <p><strong className="text-slate-700">Evidência:</strong> {rule.evidence}</p>
                          {rule.explanation && (
                            <p className="text-slate-500"><strong className="text-slate-700">Detalhe:</strong> {rule.explanation}</p>
                          )}
                          {rule.recommendation && (isError || isWarn) && (
                            <p className="text-amber-800"><strong className="text-amber-900">Ação sugerida:</strong> {rule.recommendation}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'fixes' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100 space-y-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  <h4 className="text-xs font-black text-indigo-900 uppercase">
                    Resumo de Correções Aplicadas
                  </h4>
                </div>
                {reportData?.fixDescription ? (
                  <p className="text-xs text-slate-700 font-medium">
                    {reportData.fixDescription}
                  </p>
                ) : (
                  <p className="text-xs text-slate-600">
                    Ajustes automatizados executados e validados pelo Motor 1 sobre o arquivo de trabalho.
                  </p>
                )}
                {reportData?.initialScore !== undefined && reportData?.finalScore !== undefined && (
                  <div className="flex items-center gap-3 pt-1 text-xs font-bold text-slate-800">
                    <span>Score Inicial: {reportData.initialScore}/100</span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-emerald-700">Score Pós-Correção: {reportData.finalScore}/100</span>
                  </div>
                )}
              </div>

              {comparisonResults.length > 0 ? (
                <div className="space-y-2">
                  <h5 className="text-xs font-bold text-slate-800">Detalhes Comparativos:</h5>
                  {comparisonResults.map((comp) => (
                    <div key={comp.ruleId} className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs flex items-center justify-between gap-3">
                      <div>
                        <span className="font-bold text-slate-900 block">{comp.title}</span>
                        <span className="text-[11px] text-slate-500">{comp.actionTaken || comp.explanation}</span>
                      </div>
                      <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold text-[10px] shrink-0">
                        {comp.comparison === 'corrected' ? 'Corrigido' : comp.comparison}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic">
                  Nenhuma alteração regra-a-regra registrada separadamente.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="pt-4 border-t border-slate-100 flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="text-[11px] text-slate-400">
            Registro ID: <span className="font-mono text-slate-500">{record.id}</span>
          </div>

          <div className="flex items-center gap-2 justify-end">
            {exportEligibility.eligible && onExportReport && (
              <button
                type="button"
                onClick={handleExport}
                disabled={isExporting}
                className="inline-flex sm:hidden items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-[#4F46E5] border border-indigo-200 text-xs font-bold transition-colors cursor-pointer"
              >
                {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                <span>Exportar PDF</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
