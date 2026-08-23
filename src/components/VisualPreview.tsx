import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Eye, TriangleAlert as AlertTriangle, Circle as XCircle, Info, ChevronLeft, ChevronRight, Ruler, Crop, RefreshCw, Layers } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PreflightAnalysis, PdfPageStructure } from '../types';
import type { ProductionProfile } from '../utils/productionProfiles';
import {
  buildAllVisualData,
  pdfCoordsToPreview,
  mmToPreviewPct,
  type VisualIssueMarker,
  type PageVisualData,
  type IssueCategory,
} from '../services/visualMarkers';

// Initialize PDF.js worker securely in the browser
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

interface VisualPreviewProps {
  analysis: PreflightAnalysis;
  profile: ProductionProfile;
  file?: File | Blob | Uint8Array | ArrayBuffer | null;
}

const CATEGORY_META: Record<IssueCategory, { label: string; icon: typeof Eye }> = {
  dpi: { label: 'DPI', icon: Eye },
  dimension: { label: 'Dimensão', icon: Ruler },
  bleed: { label: 'Sangria', icon: Crop },
};

export const VisualPreview: React.FC<VisualPreviewProps> = ({ analysis, profile, file }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentIssueIdx, setCurrentIssueIdx] = useState(0);
  const [selectedPageNum, setSelectedPageNum] = useState<number>(1);
  const [isRendering, setIsRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<any>(null);

  const { allMarkers, pageData } = useMemo(
    () => buildAllVisualData(analysis.document, profile),
    [analysis, profile]
  );

  const totalPages = analysis.document.pages.length || 1;
  const hasIssues = allMarkers.length > 0;

  // Sort markers by page then by category for stable navigation
  const sortedMarkers = useMemo(() => {
    return [...allMarkers].sort((a, b) => {
      if (a.page !== b.page) return a.page - b.page;
      const catOrder: Record<IssueCategory, number> = { dpi: 0, dimension: 1, bleed: 2 };
      return catOrder[a.category] - catOrder[b.category];
    });
  }, [allMarkers]);

  const currentMarker = sortedMarkers[currentIssueIdx] || null;

  // Identify document-level issues that do not have spatial coordinates
  const documentLevelIssues = useMemo(() => {
    const issues: { ruleId: string; title: string; detail: string; severity: 'error' | 'warning' }[] = [];
    for (const rule of analysis.ruleResults.results) {
      if (rule.status === 'error' || rule.status === 'warning') {
        if (rule.ruleId === 'RULE-PROF-CLR-001') {
          issues.push({
            ruleId: rule.ruleId,
            title: 'Espaço de Cor (RGB Detectado)',
            detail: 'O documento contém elementos RGB em um perfil CMYK. A localização é global no documento.',
            severity: rule.status,
          });
        } else if (rule.ruleId === 'RULE-PDFX-001') {
          issues.push({
            ruleId: rule.ruleId,
            title: 'Ausência de Declaração PDF/X',
            detail: 'O arquivo não declara conformidade PDF/X (metadado global do documento).',
            severity: rule.status,
          });
        } else if (rule.ruleId === 'RULE-FONT-001') {
          issues.push({
            ruleId: rule.ruleId,
            title: 'Fontes Não Incorporadas',
            detail: 'Fontes não incorporadas afetam o arquivo em nível de documento.',
            severity: rule.status,
          });
        }
      }
    }
    return issues;
  }, [analysis]);

  // Sync selected page when user navigates issues
  useEffect(() => {
    if (currentMarker) {
      setSelectedPageNum(currentMarker.page);
    }
  }, [currentMarker]);

  const currentPage = useMemo(() => {
    return (
      analysis.document.pages.find((p) => p.page === selectedPageNum) ||
      analysis.document.pages[0] || {
        page: 1,
        widthPt: 595.28,
        heightPt: 841.89,
        widthMm: 210,
        heightMm: 297,
      }
    );
  }, [analysis.document.pages, selectedPageNum]);

  const currentPageData: PageVisualData | undefined = pageData.get(currentPage.page);

  // Load PDF Document into memory
  useEffect(() => {
    let isCancelled = false;

    async function loadPdf() {
      if (!isOpen || !file) {
        if (pdfDocRef.current) {
          try {
            (pdfDocRef.current as any).destroy?.();
            (pdfDocRef.current as any).cleanup?.();
          } catch {
            // ignore cleanup errors
          }
          pdfDocRef.current = null;
        }
        return;
      }

      try {
        setIsRendering(true);
        setRenderError(null);

        let data: ArrayBuffer | Uint8Array;
        if (file instanceof Uint8Array) {
          data = file;
        } else if (file instanceof ArrayBuffer) {
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
        if (isCancelled) {
          (doc as any).destroy?.();
          return;
        }

        if (pdfDocRef.current) {
          try {
            (pdfDocRef.current as any).destroy?.();
            (pdfDocRef.current as any).cleanup?.();
          } catch {
            // ignore
          }
        }

        pdfDocRef.current = doc;
        renderPage(doc, selectedPageNum);
      } catch (err: any) {
        if (!isCancelled) {
          console.warn('Não foi possível carregar o preview do PDF via PDF.js:', err);
          setRenderError('Prévia gráfica não pôde ser renderizada. As marcações geométricas continuam ativas.');
          setIsRendering(false);
        }
      }
    }

    loadPdf();

    return () => {
      isCancelled = true;
    };
  }, [isOpen, file]);

  // Render a specific page onto the Canvas
  const renderPage = useCallback(
    async (doc: pdfjsLib.PDFDocumentProxy, pageNumber: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Cancel any ongoing rendering task
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // ignore
        }
        renderTaskRef.current = null;
      }

      setIsRendering(true);
      setRenderError(null);

      try {
        const page = await doc.getPage(Math.min(Math.max(1, pageNumber), doc.numPages));
        const unscaledViewport = page.getViewport({ scale: 1 });

        // Calculate responsive scale for crisp display on high-dpi screens
        const targetWidth = 600;
        const scale = Math.max(1.5, Math.min(3, targetWidth / unscaledViewport.width));
        const viewport = page.getViewport({ scale });

        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) {
          setIsRendering(false);
          return;
        }

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const renderContext: any = {
          canvasContext: ctx,
          viewport: viewport,
          canvas: canvas,
        };

        const renderTask = page.render(renderContext);
        renderTaskRef.current = renderTask;

        await renderTask.promise;
        renderTaskRef.current = null;
        setIsRendering(false);
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.warn('Erro ao renderizar página no canvas:', err);
          setRenderError('Erro na renderização da página.');
        }
        setIsRendering(false);
      }
    },
    []
  );

  // Trigger page re-render when selected page changes
  useEffect(() => {
    if (pdfDocRef.current && isOpen) {
      renderPage(pdfDocRef.current, selectedPageNum);
    }
  }, [selectedPageNum, isOpen, renderPage]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // ignore
        }
      }
      if (pdfDocRef.current) {
        try {
          (pdfDocRef.current as any).destroy?.();
          (pdfDocRef.current as any).cleanup?.();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const navigateIssue = useCallback(
    (direction: 'prev' | 'next') => {
      setCurrentIssueIdx((prev) => {
        if (direction === 'prev') return Math.max(0, prev - 1);
        return Math.min(sortedMarkers.length - 1, prev + 1);
      });
    },
    [sortedMarkers.length]
  );

  const navigatePage = useCallback(
    (direction: 'prev' | 'next') => {
      setSelectedPageNum((prev) => {
        if (direction === 'prev') return Math.max(1, prev - 1);
        return Math.min(totalPages, prev + 1);
      });
    },
    [totalPages]
  );

  const openAtRule = useCallback(
    (ruleId: string) => {
      const idx = sortedMarkers.findIndex((m) => m.ruleId === ruleId);
      if (idx >= 0) {
        setCurrentIssueIdx(idx);
        setSelectedPageNum(sortedMarkers[idx].page);
      } else {
        setCurrentIssueIdx(0);
      }
      setIsOpen(true);
    },
    [sortedMarkers]
  );

  if (!isOpen) {
    return (
      <div className="mb-8">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          disabled={!hasIssues && documentLevelIssues.length === 0}
          className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl border transition-all ${
            hasIssues || documentLevelIssues.length > 0
              ? 'bg-[#101722] border-[#243244] hover:bg-[#16202E] text-white cursor-pointer shadow-xl'
              : 'bg-[#101722]/50 border-[#243244]/50 text-[#6B778C] cursor-not-allowed'
          }`}
        >
          <div className="flex items-center space-x-3">
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                hasIssues
                  ? 'bg-[#007BFF]/15 border border-[#007BFF]/40 text-[#007BFF]'
                  : 'bg-[#1A2332] border border-[#243244] text-[#6B778C]'
              }`}
            >
              <Eye className="w-5 h-5" />
            </div>
            <div className="text-left">
              <h3 className="text-sm font-semibold">Ver no arquivo / Mapa Visual</h3>
              <p className="text-xs text-[#8E98A7] mt-0.5">
                {hasIssues
                  ? `${sortedMarkers.length} problema(s) visual(is) com coordenadas determinísticas`
                  : documentLevelIssues.length > 0
                  ? `${documentLevelIssues.length} observação(ões) de nível de documento`
                  : 'Nenhum problema visual detectado'}
              </p>
            </div>
          </div>
          {hasIssues && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-[#FF4D4D]/10 text-[#FF4D4D] border border-[#FF4D4D]/30">
              {sortedMarkers.length} ponto(s)
            </span>
          )}
        </button>

        {/* Quick links to jump to specific categories */}
        {hasIssues && (
          <div className="flex flex-wrap gap-2 mt-3">
            {(['dpi', 'dimension', 'bleed'] as IssueCategory[]).map((cat) => {
              const catMarkers = sortedMarkers.filter((m) => m.category === cat);
              if (catMarkers.length === 0) return null;
              const Meta = CATEGORY_META[cat];
              const Icon = Meta.icon;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => openAtRule(catMarkers[0].ruleId)}
                  className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium bg-[#0B1018] border border-[#243244] text-[#A6B4C9] hover:bg-[#16202E] hover:text-white transition-all cursor-pointer"
                >
                  <Icon className="w-3.5 h-3.5 mr-1.5" />
                  {Meta.label} ({catMarkers.length})
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const pageAspect = currentPage.widthMm / (currentPage.heightMm || 1);
  const pageMarkers = currentPageData?.markers || [];
  const unavailableImageIds = currentPageData?.unavailableImageIds || [];
  const boxOverlays = currentPageData?.boxOverlays || [];
  const insufficientEvidence = currentPageData?.insufficientEvidence || false;

  // DPI markers with valid spatial coordinates
  const dpiMarkers = pageMarkers.filter((m) => m.category === 'dpi' && typeof m.x === 'number');

  return (
    <div className="bg-[#101722] border border-[#243244] rounded-2xl p-6 shadow-xl mb-8">
      {/* Header */}
      <div className="flex items-center justify-between pb-5 border-b border-[#243244]">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-lg bg-[#007BFF]/15 border border-[#007BFF]/40 flex items-center justify-center text-[#007BFF]">
            <Eye className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Mapa Visual do Arquivo</h3>
            <p className="text-xs text-[#8E98A7] mt-0.5">
              Renderização real do PDF com sobreposições geométricas do Motor 1
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="px-3 py-1.5 rounded-lg text-xs text-[#8E98A7] hover:text-white hover:bg-[#16202E] transition-colors cursor-pointer"
        >
          Fechar
        </button>
      </div>

      {/* Navigation Controls: Issues & Pages */}
      <div className="flex flex-wrap items-center justify-between gap-4 mt-4 py-2 border-b border-[#1A2533]">
        {/* Issue navigation */}
        {sortedMarkers.length > 0 ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#8E98A7] font-medium mr-1">Problema:</span>
            <button
              type="button"
              onClick={() => navigateIssue('prev')}
              disabled={currentIssueIdx === 0}
              className="p-1.5 rounded-lg text-[#8E98A7] hover:text-white hover:bg-[#16202E] disabled:opacity-30 transition-colors cursor-pointer"
              title="Problema anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs text-white font-medium px-2 py-0.5 rounded bg-[#0B1018] border border-[#243244]">
              {currentIssueIdx + 1} / {sortedMarkers.length}
            </span>
            <button
              type="button"
              onClick={() => navigateIssue('next')}
              disabled={currentIssueIdx === sortedMarkers.length - 1}
              className="p-1.5 rounded-lg text-[#8E98A7] hover:text-white hover:bg-[#16202E] disabled:opacity-30 transition-colors cursor-pointer"
              title="Próximo problema"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <span className="text-xs text-[#8E98A7]">Sem marcadores pontuais</span>
        )}

        {/* Page navigation */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#8E98A7] font-medium mr-1">Página:</span>
          <button
            type="button"
            onClick={() => navigatePage('prev')}
            disabled={selectedPageNum === 1}
            className="p-1.5 rounded-lg text-[#8E98A7] hover:text-white hover:bg-[#16202E] disabled:opacity-30 transition-colors cursor-pointer"
            title="Página anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <select
            value={selectedPageNum}
            onChange={(e) => setSelectedPageNum(Number(e.target.value))}
            className="text-xs text-white bg-[#0B1018] border border-[#243244] rounded px-2 py-1 focus:outline-none focus:border-[#007BFF]"
          >
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <option key={p} value={p}>
                Página {p} de {totalPages}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => navigatePage('next')}
            disabled={selectedPageNum === totalPages}
            className="p-1.5 rounded-lg text-[#8E98A7] hover:text-white hover:bg-[#16202E] disabled:opacity-30 transition-colors cursor-pointer"
            title="Próxima página"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Preview Area */}
      <div className="mt-4 flex flex-col lg:flex-row gap-6">
        {/* PDF Page Canvas + Overlay Container */}
        <div className="flex-1 flex flex-col items-center justify-center min-h-[420px] bg-[#070B10] p-4 rounded-xl border border-[#1A2533] relative overflow-hidden">
          <div
            className="relative bg-white rounded shadow-2xl overflow-hidden"
            style={{
              width: '100%',
              maxWidth: pageAspect > 1 ? '620px' : '440px',
              aspectRatio: `${currentPage.widthMm} / ${currentPage.heightMm || 1}`,
            }}
          >
            {/* HTML5 Canvas for real PDF.js page rasterization */}
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full object-contain pointer-events-none"
            />

            {/* Fallback info when canvas is loading or without file buffer */}
            {isRendering && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px] text-white z-20">
                <div className="flex items-center gap-2 text-xs">
                  <RefreshCw className="w-4 h-4 animate-spin text-[#007BFF]" />
                  <span>Renderizando página {selectedPageNum}...</span>
                </div>
              </div>
            )}

            {!file && !isRendering && (
              <div className="absolute inset-0 flex items-center justify-center text-[#8E98A7] text-xs p-4 text-center">
                <div>
                  <Layers className="w-8 h-8 mx-auto mb-2 opacity-30 text-[#007BFF]" />
                  <p className="font-semibold text-white">Visualização Geométrica</p>
                  <p className="text-[11px] mt-1 text-[#8E98A7]">
                    Página {currentPage.page} ({currentPage.widthMm.toFixed(0)} × {currentPage.heightMm.toFixed(0)} mm)
                  </p>
                </div>
              </div>
            )}

            {renderError && !isRendering && (
              <div className="absolute top-2 left-2 right-2 p-2 rounded bg-[#FF4D4D]/10 border border-[#FF4D4D]/30 text-[#FF4D4D] text-[10px] z-20">
                {renderError}
              </div>
            )}

            {/* Box Overlays (MediaBox, TrimBox, BleedBox, expectedTrim, expectedBleed) */}
            {boxOverlays.map((overlay, idx) => {
              const coords = mmToPreviewPct(overlay, currentPage);
              if (!coords) return null;

              const styles: Record<string, { border: string; bg: string; labelColor: string }> = {
                mediaBox: { border: '#4A5568', bg: 'rgba(74, 85, 104, 0.05)', labelColor: '#4A5568' },
                trimBox: { border: '#007BFF', bg: 'rgba(0, 123, 255, 0.06)', labelColor: '#007BFF' },
                bleedBox: { border: '#FFB800', bg: 'rgba(255, 184, 0, 0.06)', labelColor: '#FFB800' },
                expectedTrim: { border: '#007BFF', bg: 'rgba(0, 123, 255, 0.03)', labelColor: '#007BFF' },
                expectedBleed: { border: '#FFB800', bg: 'rgba(255, 184, 0, 0.03)', labelColor: '#FFB800' },
              };

              const isExpected = overlay.type === 'expectedTrim' || overlay.type === 'expectedBleed';
              const style = styles[overlay.type] || styles.trimBox;

              return (
                <div
                  key={`overlay-${idx}`}
                  className={`absolute ${isExpected ? 'border-dashed' : 'border-solid'} border-2 transition-all pointer-events-none`}
                  style={{
                    left: `${coords.leftPct}%`,
                    top: `${coords.topPct}%`,
                    width: `${coords.widthPct}%`,
                    height: `${coords.heightPct}%`,
                    borderColor: style.border,
                    backgroundColor: style.bg,
                    zIndex: isExpected ? 5 : 6,
                  }}
                >
                  <span
                    className="absolute -top-3.5 left-1 text-[8px] font-bold px-1 rounded bg-[#0B1018]/80 whitespace-nowrap"
                    style={{ color: style.labelColor }}
                  >
                    {overlay.label}
                  </span>
                </div>
              );
            })}

            {/* DPI Image Markers (Positioned accurately with PDF coordinate conversion) */}
            {dpiMarkers.map((marker, idx) => {
              const coords = pdfCoordsToPreview(marker, currentPage);
              if (!coords) return null;

              const isCritical = marker.severity === 'error';
              const color = isCritical ? '#FF4D4D' : '#FFB800';
              const isCurrent = currentMarker?.imageId === marker.imageId && currentMarker?.page === marker.page;

              return (
                <div
                  key={`dpi-${marker.imageId}-${idx}`}
                  className={`absolute border-2 rounded-sm transition-all pointer-events-none ${
                    isCurrent ? 'z-30 ring-2 ring-white/80' : 'z-10'
                  }`}
                  style={{
                    left: `${coords.leftPct}%`,
                    top: `${coords.topPct}%`,
                    width: `${coords.widthPct}%`,
                    height: `${coords.heightPct}%`,
                    borderColor: color,
                    backgroundColor: `${color}25`,
                    boxShadow: isCurrent ? `0 0 0 2px ${color}80` : `0 0 0 1px ${color}40`,
                  }}
                >
                  <div
                    className="absolute -top-2.5 -left-2.5 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shadow-md"
                    style={{ backgroundColor: color }}
                  >
                    {idx + 1}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex items-center gap-4 text-[11px] text-[#8E98A7]">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm border border-[#007BFF] bg-[#007BFF]/20" />
              TrimBox (Corte)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm border border-[#FFB800] bg-[#FFB800]/20" />
              BleedBox (Sangria)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm border border-[#FF4D4D] bg-[#FF4D4D]/20" />
              DPI Baixo
            </span>
          </div>
        </div>

        {/* Issue Details & Diagnostic Sidebar */}
        <div className="lg:w-80 space-y-4">
          {/* Active selected issue detail */}
          {currentMarker && currentMarker.page === selectedPageNum && (
            <div className="p-4 rounded-xl border border-[#007BFF]/40 bg-[#007BFF]/5 shadow-sm">
              <div className="flex items-start space-x-2.5">
                {currentMarker.severity === 'error' ? (
                  <XCircle className="w-4 h-4 text-[#FF4D4D] shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-[#FFB800] shrink-0 mt-0.5" />
                )}
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-semibold text-white block">
                    {currentMarker.title}
                  </span>
                  <span className="text-[10px] text-[#6B778C]">
                    {CATEGORY_META[currentMarker.category].label} · Página {currentMarker.page}
                  </span>
                  <div className="mt-2 space-y-1 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-[#8E98A7]">Encontrado:</span>
                      <span className="text-white font-semibold">{currentMarker.measuredValue}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#8E98A7]">Esperado:</span>
                      <span className="text-[#00D18F] font-medium">{currentMarker.expectedValue}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* All Issues on this Page */}
          <div>
            <h4 className="text-xs font-semibold text-[#8E98A7] uppercase tracking-wider mb-2">
              Problemas nesta Página ({pageMarkers.length})
            </h4>

            {pageMarkers.length === 0 && unavailableImageIds.length === 0 && !insufficientEvidence && (
              <div className="text-xs text-[#8E98A7] italic p-3 rounded-xl border border-[#243244] bg-[#0B1018]">
                Nenhum problema dimensional ou de imagem nesta página.
              </div>
            )}

            <div className="space-y-2">
              {pageMarkers.map((marker, idx) => {
                const isCritical = marker.severity === 'error';
                const isUndetermined = marker.severity === 'undetermined';
                const color = isCritical ? '#FF4D4D' : isUndetermined ? '#FFB800' : '#FFB800';
                const isCurrent = currentMarker === marker;
                const CatIcon = CATEGORY_META[marker.category].icon;

                return (
                  <button
                    key={`${marker.category}-${marker.ruleId}-${idx}`}
                    type="button"
                    onClick={() => {
                      const globalIdx = sortedMarkers.indexOf(marker);
                      if (globalIdx >= 0) setCurrentIssueIdx(globalIdx);
                    }}
                    className={`w-full text-left p-3 rounded-xl border bg-[#0B1018] transition-all cursor-pointer ${
                      isCurrent
                        ? 'border-[#007BFF]/60 ring-1 ring-[#007BFF]/40 bg-[#007BFF]/10'
                        : 'border-[#243244] hover:border-[#243244]/80'
                    }`}
                  >
                    <div className="flex items-start space-x-2">
                      <CatIcon className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color }} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-white">
                            {marker.title}
                          </span>
                        </div>
                        <div className="mt-1 space-y-0.5 text-[11px]">
                          <div className="flex justify-between">
                            <span className="text-[#8E98A7]">Encontrado:</span>
                            <span style={{ color }} className="font-semibold">
                              {marker.measuredValue}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#8E98A7]">Esperado:</span>
                            <span className="text-white font-medium">{marker.expectedValue}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Non-localizable issues on this page */}
          {unavailableImageIds.length > 0 && (
            <div className="p-3 rounded-xl border border-[#243244] bg-[#0B1018]/70">
              <div className="flex items-start space-x-2">
                <Info className="w-4 h-4 text-[#8E98A7] shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-[#8E98A7] font-medium">
                    Localização espacial não disponível
                  </p>
                  <p className="text-[11px] text-[#6B778C] mt-1">
                    {unavailableImageIds.length} imagem(ns) possuem DPI insuficiente, porém suas coordenadas não puderam ser extraídas com precisão do fluxo de conteúdo.
                  </p>
                </div>
              </div>
            </div>
          )}

          {insufficientEvidence && (
            <div className="p-3 rounded-xl border border-[#243244] bg-[#0B1018]/70">
              <div className="flex items-start space-x-2">
                <Info className="w-4 h-4 text-[#8E98A7] shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-[#8E98A7] font-medium">
                    Caixas técnicas indefinidas
                  </p>
                  <p className="text-[11px] text-[#6B778C] mt-1">
                    Esta página não possui TrimBox ou BleedBox explícitos no PDF para representação vetorial sobreposta.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Document-level issues without spatial coordinates */}
          {documentLevelIssues.length > 0 && (
            <div className="pt-2 border-t border-[#1A2533]">
              <h4 className="text-xs font-semibold text-[#8E98A7] uppercase tracking-wider mb-2">
                Problemas Globais do Documento
              </h4>
              <div className="space-y-2">
                {documentLevelIssues.map((docIssue, idx) => (
                  <div
                    key={`doc-issue-${idx}`}
                    className="p-3 rounded-xl border border-[#243244] bg-[#0B1018]"
                  >
                    <div className="flex items-start space-x-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-[#FFB800] shrink-0 mt-0.5" />
                      <div>
                        <span className="text-xs font-semibold text-white block">
                          {docIssue.title}
                        </span>
                        <p className="text-[10px] text-[#8E98A7] mt-0.5">{docIssue.detail}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
