import React, { useState } from 'react';
import { 
  X, 
  HelpCircle, 
  BookOpen, 
  LifeBuoy, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Crop, 
  Droplet, 
  Sliders, 
  Type, 
  Layers, 
  ShieldCheck, 
  History, 
  Download, 
  FileText, 
  ExternalLink,
  Copy,
  Check,
  Info
} from 'lucide-react';
import { useModalAccessibility } from '../hooks/useModalAccessibility';
import { getPrexyonPortalUrl } from '../config/prexyon';
import type { PreflightAnalysis } from '../types';

export interface HelpCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentAnalysis?: PreflightAnalysis | null;
  initialTab?: 'manual' | 'support';
}

export const HelpCenterModal: React.FC<HelpCenterModalProps> = ({
  isOpen,
  onClose,
  currentAnalysis,
  initialTab = 'manual',
}) => {
  const { closeButtonRef, handleBackdropClick, handleContentClick } = useModalAccessibility({
    isOpen,
    onClose,
  });

  const [activeTab, setActiveTab] = useState<'manual' | 'support'>(initialTab);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const portalUrl = getPrexyonPortalUrl();

  if (!isOpen) return null;

  const handleCopyDiagnostics = () => {
    if (!currentAnalysis) return;
    const summary = [
      `ArteCheck — Diagnóstico Técnico`,
      `Arquivo: ${currentAnalysis.fileName}`,
      `Score: ${currentAnalysis.ruleResults.scoreSummary.score}/100 (${currentAnalysis.ruleResults.scoreSummary.label})`,
      `Páginas: ${currentAnalysis.document.pageCount}`,
      `Aprovados: ${currentAnalysis.ruleResults.approvedCount} | Alertas: ${currentAnalysis.ruleResults.warningCount} | Erros: ${currentAnalysis.ruleResults.errorCount}`,
      `Perfil: ${currentAnalysis.ruleResults.profileUsed.name}`,
    ].join('\n');

    if (navigator?.clipboard) {
      navigator.clipboard.writeText(summary);
      setCopiedSummary(true);
      setTimeout(() => setCopiedSummary(false), 3000);
    }
  };

  const manualSections = [
    {
      id: 'upload-flow',
      title: '1. Como Enviar e Iniciar Análise',
      icon: FileText,
      content: (
        <div className="space-y-2 text-xs text-slate-600">
          <p>
            O ArteCheck é compatível com documentos em formato <strong>PDF</strong>. Para iniciar:
          </p>
          <ul className="list-disc pl-4 space-y-1 text-slate-600">
            <li>No Dashboard principal ou em "Nova análise", arraste seu PDF ou clique para selecionar.</li>
            <li>Escolha o <strong>Perfil de Produção</strong> adequado ao seu impresso (ex: Comercial 300 DPI, Cartão de Visita, Folder, Catálogo).</li>
            <li>Clique em <strong>Iniciar Análise</strong>. A inspeção geométrica e estrutural é executada em milissegundos.</li>
          </ul>
        </div>
      ),
    },
    {
      id: 'verdicts',
      title: '2. Significado dos Status & Classificações',
      icon: CheckCircle2,
      content: (
        <div className="space-y-2 text-xs text-slate-600">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
            <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1">
              <span className="font-bold text-emerald-800 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Aprovado
              </span>
              <p className="text-[11px] text-emerald-700">Arquivo em 100% de conformidade com o perfil gráfico selecionado. Pronto para impressão.</p>
            </div>
            <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 space-y-1">
              <span className="font-bold text-amber-800 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Alerta
              </span>
              <p className="text-[11px] text-amber-700">Requer atenção operacional. Existem avisos técnicos que não inviabilizam a gravação, mas devem ser conferidos.</p>
            </div>
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 space-y-1">
              <span className="font-bold text-rose-800 flex items-center gap-1">
                <XCircle className="w-3.5 h-3.5 text-rose-600" /> Bloqueado / Erro
              </span>
              <p className="text-[11px] text-rose-700">Erros críticos detectados (ex: baixa resolução, falta de sangria ou senha). Requer correção antes da produção.</p>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'dimensions-bleed',
      title: '3. Dimensões, Sangria e Caixas Técnicas',
      icon: Crop,
      content: (
        <div className="space-y-2 text-xs text-slate-600">
          <p>
            O ArteCheck mede as caixas canônicas do PDF:
          </p>
          <ul className="list-disc pl-4 space-y-1 text-slate-600">
            <li><strong>MediaBox:</strong> Tamanho total do papel ou página física.</li>
            <li><strong>TrimBox:</strong> Dimensão final do produto após o refile (corte).</li>
            <li><strong>BleedBox:</strong> Área estendida de sangria (geralmente 3 mm de cada lado) para evitar bordas brancas no refile.</li>
            <li>Se o PDF tiver espaço no MediaBox mas faltar TrimBox/BleedBox, o botão de correção automática pode configurá-las.</li>
          </ul>
        </div>
      ),
    },
    {
      id: 'dpi-resolution',
      title: '4. DPI e Resolução Efetiva das Imagens',
      icon: Sliders,
      content: (
        <div className="space-y-2 text-xs text-slate-600">
          <p>
            A resolução é calculada com base nos pixels reais da imagem divididos pelo tamanho físico aplicado na página:
          </p>
          <ul className="list-disc pl-4 space-y-1 text-slate-600">
            <li><strong>Recomendado:</strong> 300 DPI para impressos comerciais de alta qualidade.</li>
            <li><strong>Alerta:</strong> Entre 200 e 299 DPI.</li>
            <li><strong>Crítico / Erro:</strong> Abaixo de 150 ou 200 DPI (conforme o perfil). Exige substituição da imagem em alta resolução no software de origem.</li>
          </ul>
        </div>
      ),
    },
    {
      id: 'colors-spaces',
      title: '5. Espaços de Cor (CMYK, RGB e Spot)',
      icon: Droplet,
      content: (
        <div className="space-y-2 text-xs text-slate-600">
          <p>
            Impressão offset e digital profissional utilizam tintas <strong>CMYK</strong> (ou cores especiais Pantone/Spot):
          </p>
          <ul className="list-disc pl-4 space-y-1 text-slate-600">
            <li><strong>Imagens Raster RGB:</strong> Podem ser convertidas para CMYK pelo motor de cores LittleCMS integrado no ArteCheck.</li>
            <li><strong>Vetores e Textos RGB:</strong> Exigem conversão manual no software de diagramação (Illustrator, InDesign, CorelDraw) para evitar variações de preto e saturação.</li>
          </ul>
        </div>
      ),
    },
    {
      id: 'fonts-typography',
      title: '6. Fontes e Tipografia',
      icon: Type,
      content: (
        <div className="space-y-2 text-xs text-slate-600">
          <p>
            Todas as fontes devem estar <strong>incorporadas</strong> no arquivo PDF. Fontes não incorporadas correm o risco de serem substituídas por fontes genéricas durante a rasterização no RIP da gráfica.
          </p>
        </div>
      ),
    },
    {
      id: 'transparency-pdfx',
      title: '7. Transparências e Norma PDF/X',
      icon: ShieldCheck,
      content: (
        <div className="space-y-2 text-xs text-slate-600">
          <p>
            O ArteCheck faz distinção estrita entre PDF apenas declarado e conformidade normativa verificada:
          </p>
          <ul className="list-disc pl-4 space-y-1 text-slate-600">
            <li><strong>Transparências:</strong> Transparências vivas são suportadas em fluxos PDF/X-4 modernos ou podem ser achatadas quando necessário.</li>
            <li><strong>PDF/X-4 Verificado:</strong> O documento cumpre os requisitos da ISO 15930-7 com OutputIntent e perfil ICC incorporados.</li>
          </ul>
        </div>
      ),
    },
    {
      id: 'analysis-vs-fix',
      title: '8. Diferença entre Analisar e Corrigir',
      icon: Layers,
      content: (
        <div className="space-y-2 text-xs text-slate-600">
          <p>
            <strong>Análise:</strong> Processo 100% de leitura e diagnóstico, sem modificar nenhum byte do arquivo original.
          </p>
          <p>
            <strong>Correções Automáticas:</strong> Ajustam caixas, cores ou cabeçalho PDF/X sobre um arquivo de trabalho (working PDF), permitindo download do PDF corrigido e preservando a integridade do original.
          </p>
        </div>
      ),
    },
    {
      id: 'history-reports',
      title: '9. Histórico, Visualização e Relatórios PDF',
      icon: History,
      content: (
        <div className="space-y-2 text-xs text-slate-600">
          <ul className="list-disc pl-4 space-y-1 text-slate-600">
            <li><strong>Histórico:</strong> Registros de arquivos anteriores salvos no navegador.</li>
            <li><strong>Visualizar:</strong> Permite inspecionar todas as métricas, regras e evidências salvas sem refazer a análise e sem debitar cota.</li>
            <li><strong>Relatório Técnico:</strong> Gera um laudo em PDF para envio ao cliente ou setor de pré-impressão.</li>
          </ul>
        </div>
      ),
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs select-none"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-center-title"
    >
      <div
        className="bg-white rounded-3xl border border-slate-200 w-full max-w-3xl p-5 sm:p-6 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={handleContentClick}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-violet-50 text-violet-700 border border-violet-100">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 id="help-center-title" className="text-base sm:text-lg font-black text-[#0F172A] tracking-tight">
                Central de Ajuda & Guia de Pré-impressão
              </h2>
              <p className="text-xs text-[#64748B] font-medium">
                Consulte orientações práticas de pré-impressão ou entre em contato com a equipe.
              </p>
            </div>
          </div>
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

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 mt-4 border-b border-slate-100 pb-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('manual')}
            className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'manual'
                ? 'bg-violet-700 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Mini Manual de Pré-impressão</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('support')}
            className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'support'
                ? 'bg-violet-700 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <LifeBuoy className="w-3.5 h-3.5" />
            <span>Suporte & Contato</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="py-4 overflow-y-auto flex-1 space-y-4 pr-1">
          {activeTab === 'manual' ? (
            <div className="space-y-3">
              {manualSections.map((sec) => {
                const Icon = sec.icon;
                return (
                  <div
                    key={sec.id}
                    className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/80 space-y-2 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4 text-violet-700 shrink-0" />
                      <h3 className="text-xs font-bold text-slate-900">
                        {sec.title}
                      </h3>
                    </div>
                    {sec.content}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-violet-50/50 border border-violet-100 space-y-2">
                <h3 className="text-xs font-black text-violet-900 uppercase tracking-wider flex items-center gap-2">
                  <LifeBuoy className="w-4 h-4 text-violet-700" />
                  Atendimento Prexyon
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Para dúvidas operacionais, homologação de contas ou suporte sobre o ArteCheck, acesse o Portal Prexyon ou entre em contato com os administradores da sua organização.
                </p>
              </div>

              {/* Portal Redirect Card */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">Portal Prexyon</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Gerencie sua organização, usuários, permissões e consulte as novidades dos produtos.
                    </p>
                  </div>
                  <a
                    href={portalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-violet-700 hover:bg-violet-800 text-white text-xs font-bold transition-colors shrink-0 shadow-xs cursor-pointer"
                  >
                    <span>Abrir Portal</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              {/* Session Diagnostics for Support Reference */}
              {currentAnalysis && (
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs font-bold text-slate-900">Resumo da Análise Ativa para Suporte</h4>
                    <button
                      type="button"
                      onClick={handleCopyDiagnostics}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-[11px] font-semibold transition-colors cursor-pointer"
                      title="Copiar resumo para atendimento"
                    >
                      {copiedSummary ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span className="text-emerald-700">Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 text-slate-500" />
                          <span>Copiar Resumo</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white border border-slate-100 font-mono text-[11px] text-slate-600 space-y-0.5 select-text">
                    <p>Arquivo: {currentAnalysis.fileName}</p>
                    <p>Score: {currentAnalysis.ruleResults.scoreSummary.score}/100 ({currentAnalysis.ruleResults.scoreSummary.label})</p>
                    <p>Páginas: {currentAnalysis.document.pageCount} • Perfil: {currentAnalysis.ruleResults.profileUsed.name}</p>
                  </div>
                  <p className="text-[10px] text-slate-400 italic">
                    Nenhum dado sensível ou conteúdo do PDF é transmitido. Apenas metadados de diagnóstico.
                  </p>
                </div>
              )}

              {/* Notice about dedicated support email */}
              <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200 text-xs text-amber-800 flex items-start gap-2.5">
                <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Canal de Atendimento:</span> O suporte centralizado do ArteCheck é realizado através do Portal Prexyon. Endereços diretos de e-mail e helpdesk dedicado serão disponibilizados nos próximos ciclos de lançamento.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3 shrink-0">
          <span className="text-[11px] text-slate-400 font-medium">
            ArteCheck IA • Central de Ajuda
          </span>
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
};
