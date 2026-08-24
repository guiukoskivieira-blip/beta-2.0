import React, { useState } from 'react';
import { 
  ChevronDown, 
  Terminal, 
  Bot, 
  Download, 
  Layers, 
  Eye, 
  Type, 
  Droplet, 
  Ruler, 
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Cpu
} from 'lucide-react';
import type { PreflightAnalysis } from '../types';
import type { ProductionProfile } from '../utils/productionProfiles';

interface TechnicalDetailsAccordionProps {
  analysis: PreflightAnalysis;
  profile: ProductionProfile;
  isOpenDefault?: boolean;
  onOpenAiAssistant?: () => void;
}

export const TechnicalDetailsAccordion: React.FC<TechnicalDetailsAccordionProps> = ({
  analysis,
  profile,
  isOpenDefault = false,
  onOpenAiAssistant,
}) => {
  const [isOpen, setIsOpen] = useState(isOpenDefault);
  const [activeTab, setActiveTab] = useState<'rules' | 'pdfx' | 'images' | 'fonts' | 'colors' | 'boxes' | 'structure'>('rules');

  const { document, ruleResults } = analysis;
  const { results: rules } = ruleResults;

  // React to prop updates (e.g. when viewMode === 'technical')
  React.useEffect(() => {
    setIsOpen(isOpenDefault);
  }, [isOpenDefault]);

  // Export raw JSON analysis data
  const handleExportJson = () => {
    try {
      const jsonStr = JSON.stringify(analysis, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = `${analysis.fileName.replace(/\.pdf$/i, '')}_technical_analysis.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Erro ao exportar JSON:', err);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden mb-8 select-none">
      {/* Header Bar */}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="px-5 sm:px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-slate-50/80 transition-colors border-b border-slate-100"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-slate-100 text-[#475569]">
            <Terminal className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-black text-[#0F172A] tracking-tight">
                Detalhes Técnicos
              </h3>
              <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[10px] font-bold text-[#64748B]">
                Para Especialistas
              </span>
            </div>
            <p className="text-xs text-[#64748B] font-medium">
              Matriz completa de conformidade, objetos PDF, caixas técnicas e evidências factuais.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ChevronDown className={`w-5 h-5 text-[#64748B] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {/* Collapsible Content */}
      {isOpen && (
        <div className="p-5 sm:p-6 space-y-6">
          {/* Top Bar: Tabs & Action Buttons */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            {/* Tab Navigation */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
              {[
                { id: 'rules', label: 'Regras', icon: ShieldCheck, count: rules.length },
                { id: 'pdfx', label: 'PDF/X', icon: Cpu },
                { id: 'images', label: 'Imagens', icon: Eye, count: document.pages.flatMap(p => p.imageOccurrences || []).length },
                { id: 'fonts', label: 'Fontes', icon: Type, count: document.fonts.length },
                { id: 'colors', label: 'Cores', icon: Droplet },
                { id: 'boxes', label: 'Caixas', icon: Ruler },
                { id: 'structure', label: 'Estrutura', icon: Layers },
              ].map(tab => {
                const TabIcon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                      isActive
                        ? 'bg-[#2563EB] text-white shadow-2xs'
                        : 'bg-slate-100/80 text-[#64748B] hover:text-[#0F172A] hover:bg-slate-200/80'
                    }`}
                  >
                    <TabIcon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                    {tab.count !== undefined && (
                      <span className={`px-1.5 py-0.2 rounded-md text-[10px] ${
                        isActive ? 'bg-white/20 text-white' : 'bg-slate-200 text-[#475569]'
                      }`}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Actions: Export JSON & AI Assistant */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleExportJson}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-[#475569] hover:bg-slate-50 transition-colors cursor-pointer"
                title="Exportar dados técnicos da análise em formato JSON"
              >
                <Download className="w-3.5 h-3.5 text-[#64748B]" />
                <span>Exportar JSON</span>
              </button>

              {onOpenAiAssistant && (
                <button
                  type="button"
                  onClick={onOpenAiAssistant}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#EEF2FF] text-[#4338CA] hover:bg-[#E0E7FF] border border-[#C7D2FE] text-xs font-bold transition-colors cursor-pointer"
                >
                  <Bot className="w-3.5 h-3.5 text-[#6366F1]" />
                  <span>Assistente IA</span>
                </button>
              )}
            </div>
          </div>

          {/* TAB 1: Rules Table */}
          {activeTab === 'rules' && (
            <div className="space-y-3">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[#64748B] uppercase tracking-wider font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Regra</th>
                      <th className="py-2.5 px-3">Categoria</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Severidade</th>
                      <th className="py-2.5 px-3">Evidência Factual</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-[#334155]">
                    {rules.map((rule) => {
                      const isError = rule.status === 'error';
                      const isWarning = rule.status === 'warning';
                      const isApproved = rule.status === 'approved';

                      return (
                        <tr key={rule.ruleId} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-2.5 px-3 font-mono font-semibold text-[#0F172A] whitespace-nowrap">
                            {rule.ruleId}
                          </td>
                          <td className="py-2.5 px-3 capitalize font-medium text-[#64748B]">
                            {rule.category.replace('_', ' ')}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-[11px] ${
                              isError ? 'bg-[#FEE2E2] text-[#B91C1C]' : (isWarning ? 'bg-[#FEF3C7] text-[#B45309]' : 'bg-[#ECFDF5] text-[#059669]')
                            }`}>
                              {isError && <XCircle className="w-3 h-3" />}
                              {isWarning && <AlertTriangle className="w-3 h-3" />}
                              {isApproved && <CheckCircle2 className="w-3 h-3" />}
                              <span className="uppercase">{rule.status}</span>
                            </span>
                          </td>
                          <td className="py-2.5 px-3 capitalize font-medium text-[#64748B]">
                            {rule.severity}
                          </td>
                          <td className="py-2.5 px-3 text-[#475569] leading-relaxed max-w-md">
                            {rule.evidence || 'Nenhuma inconformidade reportada.'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: PDF/X Matrix */}
          {activeTab === 'pdfx' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                  <div className="text-xs font-bold text-[#64748B] uppercase tracking-wider">Declaração PDF/X</div>
                  <div className="text-sm font-semibold text-[#0F172A]">
                    {document.pdfxInfo?.isDeclaredPdfX ? `Conforme (${document.pdfxInfo.declaredVersion || 'PDF/X-4'})` : 'Não Declarado'}
                  </div>
                  <div className="text-xs text-[#64748B]">
                    GTS_PDFXVersion: <span className="font-mono">{document.pdfxInfo?.declaredVersion || 'Ausente'}</span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                  <div className="text-xs font-bold text-[#64748B] uppercase tracking-wider">Output Intent</div>
                  <div className="text-sm font-semibold text-[#0F172A]">
                    {document.outputIntents && document.outputIntents.length > 0 ? document.outputIntents[0].outputConditionIdentifier || 'Presente' : 'Ausente'}
                  </div>
                  <div className="text-xs text-[#64748B]">
                    Subtype: <span className="font-mono">{document.outputIntents?.[0]?.subtype || '/GTS_PDFX'}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Images & Raster Objects */}
          {activeTab === 'images' && (
            <div className="space-y-3">
              {document.pages.flatMap(p => p.imageOccurrences || []).length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-[#64748B] uppercase tracking-wider font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Objeto / Path</th>
                        <th className="py-2.5 px-3">Pág</th>
                        <th className="py-2.5 px-3">Pixels</th>
                        <th className="py-2.5 px-3">DPI Efetivo</th>
                        <th className="py-2.5 px-3">ColorSpace</th>
                        <th className="py-2.5 px-3">Filtro</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-[#334155]">
                      {document.pages.flatMap(p => p.imageOccurrences || []).map((img, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/80">
                          <td className="py-2.5 px-3 font-mono text-[#0F172A]">{img.name || `Im${idx}`}</td>
                          <td className="py-2.5 px-3 font-semibold">{img.page}</td>
                          <td className="py-2.5 px-3">{img.widthPx} × {img.heightPx} px</td>
                          <td className="py-2.5 px-3 font-semibold">{Math.round(img.effectiveDpiX)} × {Math.round(img.effectiveDpiY)} DPI</td>
                          <td className="py-2.5 px-3">
                            <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                              img.colorSpace?.includes('RGB') ? 'bg-[#FEF3C7] text-[#B45309]' : 'bg-[#ECFDF5] text-[#059669]'
                            }`}>
                              {img.colorSpace || 'DeviceCMYK'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[#64748B]">{img.filter || 'None'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-slate-50 text-center text-xs text-[#64748B]">
                  Nenhuma imagem raster encontrada (documento totalmente vetorial).
                </div>
              )}
            </div>
          )}

          {/* TAB 4: Fonts & Subsets */}
          {activeTab === 'fonts' && (
            <div className="space-y-3">
              {document.fonts.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-[#64748B] uppercase tracking-wider font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Nome da Fonte</th>
                        <th className="py-2.5 px-3">Subtipo</th>
                        <th className="py-2.5 px-3">Incorporada</th>
                        <th className="py-2.5 px-3">Subset</th>
                        <th className="py-2.5 px-3">Utilizada no Conteúdo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-[#334155]">
                      {document.fonts.map((f, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/80">
                          <td className="py-2.5 px-3 font-mono font-semibold text-[#0F172A]">{f.name}</td>
                          <td className="py-2.5 px-3 text-[#64748B]">{f.subtype || 'TrueType'}</td>
                          <td className="py-2.5 px-3">
                            <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                              f.isEmbedded === true || f.isEmbedded === 'yes' ? 'bg-[#ECFDF5] text-[#059669]' : 'bg-[#FEE2E2] text-[#B91C1C]'
                            }`}>
                              {f.isEmbedded === true || f.isEmbedded === 'yes' ? 'SIM' : 'NÃO'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">{f.isSubset ? 'Sim' : 'Completa'}</td>
                          <td className="py-2.5 px-3">{f.isUsedInContent !== false ? 'Sim' : 'Não (BT/ET vazio)'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-slate-50 text-center text-xs text-[#64748B]">
                  Nenhuma fonte declarada no documento.
                </div>
              )}
            </div>
          )}

          {/* TAB 5: Colors & Separations */}
          {activeTab === 'colors' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                  <div className="text-xs font-bold text-[#64748B] uppercase tracking-wider">Espaço Predominante</div>
                  <div className="text-sm font-semibold text-[#0F172A]">
                    {document.colorSummary.hasRgb ? 'RGB Detectado' : (document.colorSummary.hasCmyk ? 'DeviceCMYK' : 'Spot / Escala de Cinza')}
                  </div>
                  <div className="text-xs text-[#64748B]">
                    Separações: Cyan, Magenta, Yellow, Black
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                  <div className="text-xs font-bold text-[#64748B] uppercase tracking-wider">Cores Especiais / Spot</div>
                  <div className="text-sm font-semibold text-[#0F172A]">
                    {document.colorSummary.spotPlates?.length || 0} Canal(is) Spot
                  </div>
                  <div className="text-xs text-[#64748B]">
                    {document.colorSummary.spotPlates?.join(', ') || 'Nenhum canal Spot adicional'}
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                  <div className="text-xs font-bold text-[#64748B] uppercase tracking-wider">Transparência (ExtGState)</div>
                  <div className="text-sm font-semibold text-[#0F172A]">
                    {document.pages.some(p => p.hasTransparency) ? 'Transparência Ativa' : 'Sem Transparência'}
                  </div>
                  <div className="text-xs text-[#64748B]">
                    Preservada nativamente via PDF/X-4
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: Technical Boxes */}
          {activeTab === 'boxes' && (
            <div className="space-y-3">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[#64748B] uppercase tracking-wider font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Pág</th>
                      <th className="py-2.5 px-3">MediaBox (mm)</th>
                      <th className="py-2.5 px-3">TrimBox (mm)</th>
                      <th className="py-2.5 px-3">BleedBox (mm)</th>
                      <th className="py-2.5 px-3">CropBox (mm)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-[#334155]">
                    {document.pages.map((p) => (
                      <tr key={p.pageNumber} className="hover:bg-slate-50/80">
                        <td className="py-2.5 px-3 font-semibold">{p.pageNumber}</td>
                        <td className="py-2.5 px-3 font-mono">{p.mediaBox ? `${p.mediaBox.widthMm.toFixed(1)} × ${p.mediaBox.heightMm.toFixed(1)}` : '-'}</td>
                        <td className="py-2.5 px-3 font-mono font-semibold text-[#0F172A]">{p.trimBox ? `${p.trimBox.widthMm.toFixed(1)} × ${p.trimBox.heightMm.toFixed(1)}` : '-'}</td>
                        <td className="py-2.5 px-3 font-mono">{p.bleedBox ? `${p.bleedBox.widthMm.toFixed(1)} × ${p.bleedBox.heightMm.toFixed(1)}` : '-'}</td>
                        <td className="py-2.5 px-3 font-mono text-[#64748B]">{p.cropBox ? `${p.cropBox.widthMm.toFixed(1)} × ${p.cropBox.heightMm.toFixed(1)}` : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 7: Structure & Layers */}
          {activeTab === 'structure' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
                <div className="text-xs font-bold text-[#64748B] uppercase tracking-wider">Camadas e Grupos de Conteúdo Opcional (OCG)</div>
                {document.layers && document.layers.length > 0 ? (
                  <div className="space-y-1.5">
                    {document.layers.map((layer, idx) => (
                      <div key={idx} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-white border border-slate-200 text-xs">
                        <span className="font-semibold text-[#0F172A]">{layer.name}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          layer.visible ? 'bg-[#ECFDF5] text-[#059669]' : 'bg-slate-100 text-[#64748B]'
                        }`}>
                          {layer.visible ? 'Visível' : 'Oculta'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-[#64748B]">Nenhuma camada OCG separada encontrada no documento PDF.</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
