import React, { useState } from 'react';
import { 
  ChevronDown, 
  Download, 
  Bot, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  HelpCircle, 
  FileText, 
  Layers, 
  Eye, 
  Sliders,
  ShieldCheck,
  Cpu
} from 'lucide-react';
import type { PreflightAnalysis } from '../types';
import type { ProductionProfile } from '../utils/productionProfiles';
import { AiAssistant } from './AiAssistant';
import { VisualPreview } from './VisualPreview';
import { evaluatePdfx4Eligibility } from '../services/pdfxEligibility';
import { formatBytes } from '../../server/pdfExtractor';

interface TechnicalDetailsAccordionProps {
  analysis: PreflightAnalysis;
  profile: ProductionProfile;
  originalFile?: File | Blob | Uint8Array | ArrayBuffer | null;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

export const TechnicalDetailsAccordion: React.FC<TechnicalDetailsAccordionProps> = ({
  analysis,
  profile,
  originalFile,
  activeTab: controlledActiveTab,
  onTabChange: setControlledActiveTab,
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [internalActiveTab, setInternalActiveTab] = useState<'rules' | 'pdfx' | 'technical' | 'objects' | 'separations'>('rules');
  const [ruleFilter, setRuleFilter] = useState<'all' | 'error' | 'warning' | 'approved'>('all');
  const [expandedRules, setExpandedRules] = useState<Record<string, boolean>>({});
  const [showAiAssistant, setShowAiAssistant] = useState(false);

  const activeTab = controlledActiveTab || internalActiveTab;
  const setActiveTab = (tab: any) => {
    if (setControlledActiveTab) setControlledActiveTab(tab);
    setInternalActiveTab(tab);
  };

  const { document, ruleResults } = analysis;
  const pdfxEligibility = evaluatePdfx4Eligibility(document, { profile });

  const toggleExpandRule = (ruleId: string) => {
    setExpandedRules(prev => ({ ...prev, [ruleId]: !prev[ruleId] }));
  };

  // Export JSON technical diagnostic
  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(analysis, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `${analysis.fileName.replace(/\.pdf$/i, '')}_diagnostic.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const filteredRules = ruleResults.results.filter(rule => {
    if (ruleFilter === 'all') return true;
    return rule.status === ruleFilter;
  });

  return (
    <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs p-6 mb-8 select-none">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2.5 text-left group cursor-pointer"
        >
          <div className="p-1.5 rounded-lg bg-slate-100 text-[#475569] group-hover:bg-slate-200 transition-colors">
            <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`} />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-[#0F172A] tracking-tight">
              Informações Técnicas <span className="text-xs font-semibold text-[#64748B] font-normal">(para especialistas)</span>
            </h3>
          </div>
        </button>

        {/* Action Buttons: Export & AI Assistant */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleExportJson}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-[#475569] bg-white hover:bg-slate-50 hover:text-[#0F172A] shadow-2xs transition-colors cursor-pointer"
          >
            <span>Exportar dados</span>
            <Download className="w-3.5 h-3.5 text-[#64748B]" />
          </button>

          <button
            type="button"
            onClick={() => setShowAiAssistant(!showAiAssistant)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer shadow-2xs ${
              showAiAssistant
                ? 'bg-[#EFF6FF] text-[#2563EB] border-[#BFDBFE]'
                : 'bg-white text-[#475569] border-slate-200 hover:bg-slate-50 hover:text-[#0F172A]'
            }`}
          >
            <Bot className={`w-3.5 h-3.5 ${showAiAssistant ? 'text-[#2563EB]' : 'text-[#64748B]'}`} />
            <span>Assistente Técnico</span>
          </button>
        </div>
      </div>

      {/* Collapsible Content */}
      {isOpen && (
        <div className="pt-4 space-y-5 animate-in fade-in duration-150">
          {/* AI Assistant grounded panel if opened */}
          {showAiAssistant && (
            <div className="mb-6 p-4 rounded-2xl bg-gradient-to-b from-blue-50/50 to-white border border-blue-100 shadow-xs">
              <AiAssistant analysis={analysis} />
            </div>
          )}

          {/* Tab Navigation */}
          <div className="flex items-center gap-6 border-b border-slate-200/80 overflow-x-auto text-xs font-bold scrollbar-none">
            <button
              type="button"
              onClick={() => setActiveTab('rules')}
              className={`pb-3 relative transition-colors cursor-pointer shrink-0 ${
                activeTab === 'rules' ? 'text-[#2563EB]' : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              <span>Regras de Verificação</span>
              {activeTab === 'rules' && (
                <span className="absolute bottom-0 inset-x-0 h-0.5 bg-[#2563EB] rounded-full" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('pdfx')}
              className={`pb-3 relative transition-colors cursor-pointer shrink-0 ${
                activeTab === 'pdfx' ? 'text-[#2563EB]' : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              <span>Elegibilidade PDF/X</span>
              {activeTab === 'pdfx' && (
                <span className="absolute bottom-0 inset-x-0 h-0.5 bg-[#2563EB] rounded-full" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('technical')}
              className={`pb-3 relative transition-colors cursor-pointer shrink-0 ${
                activeTab === 'technical' ? 'text-[#2563EB]' : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              <span>Detalhes Técnicos</span>
              {activeTab === 'technical' && (
                <span className="absolute bottom-0 inset-x-0 h-0.5 bg-[#2563EB] rounded-full" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('objects')}
              className={`pb-3 relative transition-colors cursor-pointer shrink-0 ${
                activeTab === 'objects' ? 'text-[#2563EB]' : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              <span>Objetos & Camadas</span>
              {activeTab === 'objects' && (
                <span className="absolute bottom-0 inset-x-0 h-0.5 bg-[#2563EB] rounded-full" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('separations')}
              className={`pb-3 relative transition-colors cursor-pointer shrink-0 ${
                activeTab === 'separations' ? 'text-[#2563EB]' : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              <span>Pré-visualização de Separações</span>
              {activeTab === 'separations' && (
                <span className="absolute bottom-0 inset-x-0 h-0.5 bg-[#2563EB] rounded-full" />
              )}
            </button>
          </div>

          {/* TAB 1: REGRAS DE VERIFICAÇÃO */}
          {activeTab === 'rules' && (
            <div className="space-y-4">
              {/* Filter Pills */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setRuleFilter('all')}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                      ruleFilter === 'all' ? 'bg-white text-[#0F172A] shadow-2xs' : 'text-[#64748B] hover:text-[#0F172A]'
                    }`}
                  >
                    Todas ({ruleResults.totalRules})
                  </button>
                  {ruleResults.errorCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setRuleFilter('error')}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                        ruleFilter === 'error' ? 'bg-[#FEE2E2] text-[#B91C1C]' : 'text-[#EF4444]'
                      }`}
                    >
                      Erros ({ruleResults.errorCount})
                    </button>
                  )}
                  {ruleResults.warningCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setRuleFilter('warning')}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                        ruleFilter === 'warning' ? 'bg-[#FEF3C7] text-[#B45309]' : 'text-[#F59E0B]'
                      }`}
                    >
                      Alertas ({ruleResults.warningCount})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setRuleFilter('approved')}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                      ruleFilter === 'approved' ? 'bg-[#DCFCE7] text-[#15803D]' : 'text-[#10B981]'
                    }`}
                  >
                    Aprovadas ({ruleResults.approvedCount})
                  </button>
                </div>

                <div className="text-xs text-[#64748B] font-medium">
                  Perfil de calibração: <strong className="text-[#0F172A]">{ruleResults.profileUsed.name}</strong>
                </div>
              </div>

              {/* Rules List */}
              <div className="space-y-2">
                {filteredRules.map((rule) => {
                  const isExpanded = expandedRules[rule.ruleId];
                  return (
                    <div
                      key={rule.ruleId}
                      className="border border-slate-200/80 rounded-2xl p-3.5 hover:border-slate-300 transition-all bg-white shadow-2xs"
                    >
                      <div
                        onClick={() => toggleExpandRule(rule.ruleId)}
                        className="flex items-center justify-between cursor-pointer gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {rule.status === 'approved' && <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />}
                          {rule.status === 'warning' && <AlertTriangle className="w-4 h-4 text-[#F59E0B] shrink-0" />}
                          {rule.status === 'error' && <XCircle className="w-4 h-4 text-[#EF4444] shrink-0" />}
                          {rule.status === 'undetermined' && <HelpCircle className="w-4 h-4 text-[#94A3B8] shrink-0" />}

                          <div className="min-w-0">
                            <span className="text-xs font-bold text-[#0F172A] mr-2">{rule.ruleName}</span>
                            <span className="text-[10px] font-mono font-semibold text-[#94A3B8] bg-slate-100 px-1.5 py-0.5 rounded-md">
                              {rule.ruleId}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            rule.status === 'approved' ? 'bg-[#DCFCE7] text-[#15803D]' :
                            rule.status === 'warning' ? 'bg-[#FEF3C7] text-[#B45309]' :
                            'bg-[#FEE2E2] text-[#B91C1C]'
                          }`}>
                            {rule.status === 'approved' ? 'Aprovado' : (rule.status === 'warning' ? 'Alerta' : 'Bloqueante')}
                          </span>
                          <ChevronDown className={`w-3.5 h-3.5 text-[#94A3B8] transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </div>
                      </div>

                      {/* Expanded Evidence & Guidance */}
                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t border-slate-100 space-y-2 text-xs text-[#475569] leading-relaxed">
                          <div>
                            <strong className="text-[#0F172A]">Evidência Factual:</strong> {rule.evidence}
                          </div>
                          <div>
                            <strong className="text-[#0F172A]">Explicação Técnica:</strong> {rule.explanation}
                          </div>
                          {rule.recommendation && (
                            <div className="p-2 rounded-xl bg-slate-50 text-[11px] text-[#334155] border border-slate-200/60 font-medium">
                              <strong className="text-[#0F172A]">Recomendação:</strong> {rule.recommendation}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Status Footer */}
              <div className="flex items-center justify-between pt-3 text-xs text-[#64748B] font-medium border-t border-slate-100">
                <span className="flex items-center gap-1.5 text-[#059669] font-bold">
                  <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
                  Aplicadas: {ruleResults.totalRules} de {ruleResults.totalRules} regras
                </span>
                <span className="text-[#2563EB] cursor-pointer hover:underline">
                  Ver documentação das regras →
                </span>
              </div>
            </div>
          )}

          {/* TAB 2: ELEGIBILIDADE PDF/X */}
          {activeTab === 'pdfx' && (
            <div className="space-y-4 text-xs">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-[#0F172A]">
                    Classificação Normativa PDF/X-4:
                  </div>
                  <div className="text-[11px] text-[#64748B] mt-0.5">
                    {pdfxEligibility.status === 'eligible_as_is' && 'O documento cumpre 100% dos requisitos normativos ISO 15930-7.'}
                    {pdfxEligibility.status === 'eligible_with_fixes' && 'Elegível com correções automatizadas (Output Intent / Caixas Técnicas / Conversão de Imagens).'}
                    {pdfxEligibility.status === 'manual_required' && 'Bloqueante normativo detectado que requer ajuste na arte gráfica original.'}
                  </div>
                </div>
                <span className={`px-3 py-1 rounded-xl text-xs font-bold ${
                  pdfxEligibility.status === 'eligible_as_is' ? 'bg-[#DCFCE7] text-[#15803D]' :
                  pdfxEligibility.status === 'eligible_with_fixes' ? 'bg-[#EFF6FF] text-[#1D4ED8]' :
                  'bg-[#FEF3C7] text-[#B45309]'
                }`}>
                  {pdfxEligibility.status === 'eligible_as_is' ? 'Elegível Direto' :
                   pdfxEligibility.status === 'eligible_with_fixes' ? 'Elegível com Correções' :
                   'Ajuste Manual Obrigatório'}
                </span>
              </div>

              <div className="space-y-2">
                {pdfxEligibility.checks.map(chk => (
                  <div key={chk.id} className="p-3 rounded-xl border border-slate-200/80 bg-white flex items-start justify-between gap-3">
                    <div>
                      <div className="font-bold text-[#0F172A]">{chk.title}</div>
                      <div className="text-[#64748B] text-[11px] mt-0.5">{chk.message}</div>
                      {chk.reasonCode && (
                        <span className="inline-block mt-1 font-mono text-[9px] text-[#94A3B8] bg-slate-100 px-1.5 py-0.5 rounded">
                          {chk.reasonCode}
                        </span>
                      )}
                    </div>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0 ${
                      chk.status === 'passed' ? 'bg-[#DCFCE7] text-[#15803D]' :
                      chk.status === 'fixable' ? 'bg-[#EFF6FF] text-[#1D4ED8]' :
                      'bg-[#FEE2E2] text-[#B91C1C]'
                    }`}>
                      {chk.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: DETALHES TÉCNICOS */}
          {activeTab === 'technical' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                <div className="font-bold text-[#0F172A] mb-2 flex items-center gap-1.5">
                  <Cpu className="w-4 h-4 text-[#2563EB]" />
                  Estrutura do Arquivo
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-[#64748B]">Versão PDF:</span>
                  <span className="font-bold text-[#0F172A]">{document.pdfVersion}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-[#64748B]">Contagem de Páginas:</span>
                  <span className="font-bold text-[#0F172A]">{document.pageCount}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-[#64748B]">Formato Pág 1:</span>
                  <span className="font-bold text-[#0F172A]">
                    {document.pages[0]?.widthMm.toFixed(1)} × {document.pages[0]?.heightMm.toFixed(1)} mm
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-[#64748B]">Tamanho do Arquivo:</span>
                  <span className="font-bold text-[#0F172A]">{formatBytes(analysis.fileSizeBytes)}</span>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                <div className="font-bold text-[#0F172A] mb-2 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#10B981]" />
                  Output Intents & ICC
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-[#64748B]">Output Intents:</span>
                  <span className="font-bold text-[#0F172A]">{document.outputIntents.length}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-[#64748B]">Subtipo PDF/X:</span>
                  <span className="font-bold text-[#0F172A]">{document.pdfxInfo?.recognizedStandard || 'Nenhum'}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-[#64748B]">Duração da Extração:</span>
                  <span className="font-bold text-[#0F172A]">{analysis.diagnosticInfo.extractionDurationMs} ms</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: OBJETOS & CAMADAS */}
          {activeTab === 'objects' && (
            <div className="space-y-4 text-xs">
              <div>
                <h4 className="font-bold text-[#0F172A] mb-2">Imagens Raster ({document.pages.flatMap(p => p.imageOccurrences || []).length})</h4>
                <div className="overflow-x-auto border border-slate-200/80 rounded-2xl">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[#64748B] text-[11px]">
                      <tr>
                        <th className="p-2.5">Nome / Ref</th>
                        <th className="p-2.5">Dimensão (px)</th>
                        <th className="p-2.5">Dimensão Aplicada</th>
                        <th className="p-2.5">DPI Efetivo</th>
                        <th className="p-2.5">Espaço de Cor</th>
                        <th className="p-2.5">Filtro</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-[#334155]">
                      {document.pages.flatMap((p, pIdx) => (p.imageOccurrences || []).map((img, i) => (
                        <tr key={`${pIdx}_${i}`} className="hover:bg-slate-50">
                          <td className="p-2.5 font-mono text-[11px] font-bold text-[#0F172A]">{img.name}</td>
                          <td className="p-2.5">{img.widthPx} × {img.heightPx}</td>
                          <td className="p-2.5">{img.appliedWidthPt ? `${(img.appliedWidthPt * 25.4 / 72).toFixed(1)} × ${(img.appliedHeightPt * 25.4 / 72).toFixed(1)} mm` : '-'}</td>
                          <td className="p-2.5 font-bold">{Math.round(img.effectiveDpiX)} × {Math.round(img.effectiveDpiY)}</td>
                          <td className="p-2.5">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              img.colorSpace === 'DeviceRGB' ? 'bg-[#FEF3C7] text-[#B45309]' : 'bg-[#ECFDF5] text-[#059669]'
                            }`}>{img.colorSpace}</span>
                          </td>
                          <td className="p-2.5 font-mono text-[10px] text-[#64748B]">{img.filter || 'None'}</td>
                        </tr>
                      )))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-[#0F172A] mb-2">Fontes Utilizadas ({document.fonts.length})</h4>
                <div className="overflow-x-auto border border-slate-200/80 rounded-2xl">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[#64748B] text-[11px]">
                      <tr>
                        <th className="p-2.5">Nome da Fonte</th>
                        <th className="p-2.5">Subtipo</th>
                        <th className="p-2.5">Incorporada</th>
                        <th className="p-2.5">Subset</th>
                        <th className="p-2.5">Utilizada no Conteúdo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-[#334155]">
                      {document.fonts.map((f, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="p-2.5 font-mono font-bold text-[#0F172A]">{f.name}</td>
                          <td className="p-2.5">{f.subtype}</td>
                          <td className="p-2.5">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              f.isEmbedded === 'yes' || f.isEmbedded === true ? 'bg-[#DCFCE7] text-[#15803D]' : 'bg-[#FEE2E2] text-[#B91C1C]'
                            }`}>
                              {f.isEmbedded === 'yes' || f.isEmbedded === true ? 'Sim' : 'Não'}
                            </span>
                          </td>
                          <td className="p-2.5">{f.isSubset ? 'Sim' : 'Não'}</td>
                          <td className="p-2.5">{f.isUsedInContent !== false ? 'Sim' : 'Não'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: PRÉ-VISUALIZAÇÃO DE SEPARAÇÕES & MAPA VISUAL */}
          {activeTab === 'separations' && (
            <div>
              <VisualPreview analysis={analysis} profile={profile} file={originalFile} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
