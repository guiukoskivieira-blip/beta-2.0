export interface ProductionProfile {
  id: string;
  name: string;
  category: 'commercial_print' | 'large_format' | 'packaging' | 'digital' | 'custom' | 'reference';
  description: string;
  expectedWidthMm?: number;
  expectedHeightMm?: number;
  expectedBleedMm?: number;
  minEffectiveDpi: number;
  warningDpiThreshold: number;
  rgbPolicy: 'error' | 'warning' | 'allowed';
  recommendsPdfX?: boolean;
  isGeneric?: boolean;
}

// 1. Generic Commercial Profile
export const COMMERCIAL_PRINT_300DPI_PROFILE: ProductionProfile = {
  id: 'commercial_print_300dpi',
  name: 'Impressão Comercial Offset / Digital (300 DPI)',
  category: 'commercial_print',
  description: 'Padrão industrial genérico para folhetos, catálogos e cartões (formato final variável).',
  minEffectiveDpi: 300,
  warningDpiThreshold: 200,
  expectedBleedMm: 3.0,
  rgbPolicy: 'error',
  recommendsPdfX: true,
  isGeneric: true,
};

// 2. Business Cards
export const BUSINESS_CARD_90X50_PROFILE: ProductionProfile = {
  id: 'business_card_90x50',
  name: 'Cartão de Visita — 90 × 50 mm',
  category: 'commercial_print',
  description: 'Cartão de visita padrão comercial brasileiro com sangria de 3 mm.',
  expectedWidthMm: 90,
  expectedHeightMm: 50,
  expectedBleedMm: 3.0,
  minEffectiveDpi: 300,
  warningDpiThreshold: 200,
  rgbPolicy: 'error',
  recommendsPdfX: true,
};

export const BUSINESS_CARD_85X55_PROFILE: ProductionProfile = {
  id: 'business_card_85x55',
  name: 'Cartão de Visita — 85 × 55 mm',
  category: 'commercial_print',
  description: 'Cartão de visita padrão internacional/europeu com sangria de 3 mm.',
  expectedWidthMm: 85,
  expectedHeightMm: 55,
  expectedBleedMm: 3.0,
  minEffectiveDpi: 300,
  warningDpiThreshold: 200,
  rgbPolicy: 'error',
  recommendsPdfX: true,
};

export const BADGE_PVC_85X54_PROFILE: ProductionProfile = {
  id: 'badge_pvc_85x54',
  name: 'Crachá / Cartão PVC — 85,6 × 54 mm',
  category: 'commercial_print',
  description: 'Formato aproximado padrão ID-1 utilizado em crachás, cartões PVC e credenciais.',
  expectedWidthMm: 85.6,
  expectedHeightMm: 54,
  expectedBleedMm: 3.0,
  minEffectiveDpi: 300,
  warningDpiThreshold: 200,
  rgbPolicy: 'error',
  recommendsPdfX: true,
};

// 3. Flyers & Leaflets
export const FLYER_A6_PROFILE: ProductionProfile = {
  id: 'flyer_a6',
  name: 'Flyer A6 — 105 × 148 mm',
  category: 'commercial_print',
  description: 'Folhetos e filipetas formato A6 (105 × 148 mm) com sangria de 3 mm.',
  expectedWidthMm: 105,
  expectedHeightMm: 148,
  expectedBleedMm: 3.0,
  minEffectiveDpi: 300,
  warningDpiThreshold: 200,
  rgbPolicy: 'error',
  recommendsPdfX: true,
};

export const FLYER_A5_PROFILE: ProductionProfile = {
  id: 'flyer_a5',
  name: 'Flyer A5 — 148 × 210 mm',
  category: 'commercial_print',
  description: 'Folhetos e panfletos comerciais formato A5 (148 × 210 mm) com sangria de 3 mm.',
  expectedWidthMm: 148,
  expectedHeightMm: 210,
  expectedBleedMm: 3.0,
  minEffectiveDpi: 300,
  warningDpiThreshold: 200,
  rgbPolicy: 'error',
  recommendsPdfX: true,
};

export const A4_COMMERCIAL_FLYER_PROFILE: ProductionProfile = {
  id: 'commercial_flyer_a4',
  name: 'Flyer A4 — 210 × 297 mm',
  category: 'commercial_print',
  description: 'Folhetos, encartes e lâminas comerciais padrão A4 com corte e sangria de 3 mm.',
  expectedWidthMm: 210,
  expectedHeightMm: 297,
  expectedBleedMm: 3.0,
  minEffectiveDpi: 300,
  warningDpiThreshold: 200,
  rgbPolicy: 'error',
  recommendsPdfX: true,
};

// 4. Posters & Folders
export const POSTER_A3_PROFILE: ProductionProfile = {
  id: 'poster_a3',
  name: 'Cartaz A3 — 297 × 420 mm',
  category: 'commercial_print',
  description: 'Cartazes e pôsteres padrão A3 (297 × 420 mm) com sangria de 3 mm.',
  expectedWidthMm: 297,
  expectedHeightMm: 420,
  expectedBleedMm: 3.0,
  minEffectiveDpi: 300,
  warningDpiThreshold: 200,
  rgbPolicy: 'error',
  recommendsPdfX: true,
};

export const FOLDER_A4_OPEN_PROFILE: ProductionProfile = {
  id: 'folder_a4_open',
  name: 'Folder A4 Aberto — 297 × 210 mm',
  category: 'commercial_print',
  description: 'Folder horizontal aberto A4 (297 × 210 mm) para dobras de 2 ou 3 painéis (sangria 3 mm).',
  expectedWidthMm: 297,
  expectedHeightMm: 210,
  expectedBleedMm: 3.0,
  minEffectiveDpi: 300,
  warningDpiThreshold: 200,
  rgbPolicy: 'error',
  recommendsPdfX: true,
};

// 5. Menus
export const MENU_A4_PROFILE: ProductionProfile = {
  id: 'menu_a4',
  name: 'Cardápio A4 — 210 × 297 mm',
  category: 'commercial_print',
  description: 'Cardápios e menus de página única ou frente e verso em formato A4.',
  expectedWidthMm: 210,
  expectedHeightMm: 297,
  expectedBleedMm: 3.0,
  minEffectiveDpi: 300,
  warningDpiThreshold: 200,
  rgbPolicy: 'error',
  recommendsPdfX: true,
};

export const MENU_A3_PROFILE: ProductionProfile = {
  id: 'menu_a3',
  name: 'Cardápio A3 — 297 × 420 mm',
  category: 'commercial_print',
  description: 'Cardápios grandes formato A3 (297 × 420 mm) com sangria de 3 mm.',
  expectedWidthMm: 297,
  expectedHeightMm: 420,
  expectedBleedMm: 3.0,
  minEffectiveDpi: 300,
  warningDpiThreshold: 200,
  rgbPolicy: 'error',
  recommendsPdfX: true,
};

// 6. Large Format / Signage
export const LARGE_FORMAT_BANNER_PROFILE: ProductionProfile = {
  id: 'large_format_banner',
  name: 'Banner / Lona — Grande Formato (100 DPI)',
  category: 'large_format',
  description: 'Comunicação visual e lonas de tamanho variável com recomendação de 100 DPI.',
  minEffectiveDpi: 100,
  warningDpiThreshold: 72,
  expectedBleedMm: 0,
  rgbPolicy: 'warning',
  recommendsPdfX: false,
  isGeneric: true,
};

// Complete standard profile list
export const STANDARD_PROFILES: ProductionProfile[] = [
  COMMERCIAL_PRINT_300DPI_PROFILE,
  BUSINESS_CARD_90X50_PROFILE,
  BUSINESS_CARD_85X55_PROFILE,
  BADGE_PVC_85X54_PROFILE,
  FLYER_A6_PROFILE,
  FLYER_A5_PROFILE,
  A4_COMMERCIAL_FLYER_PROFILE,
  POSTER_A3_PROFILE,
  FOLDER_A4_OPEN_PROFILE,
  MENU_A4_PROFILE,
  MENU_A3_PROFILE,
  LARGE_FORMAT_BANNER_PROFILE,
];

/**
 * Finds all standard and custom production profiles matching the given dimensions
 * with a slight tolerance (default 0.5 mm) in either portrait or landscape orientation.
 */
/**
 * Finds all standard and custom production profiles matching the given dimensions
 * with a slight tolerance (default 0.5 mm), categorized by exact or inverted orientation.
 */
export function findMatchingProfilesWithOrientation(
  widthMm: number,
  heightMm: number,
  customProfiles: ProductionProfile[] = [],
  toleranceMm: number = 0.5
): {
  exactOrientationMatches: ProductionProfile[];
  inverseOrientationMatches: ProductionProfile[];
  allMatches: ProductionProfile[];
} {
  if (!widthMm || !heightMm || widthMm <= 0 || heightMm <= 0) {
    return { exactOrientationMatches: [], inverseOrientationMatches: [], allMatches: [] };
  }

  const allProfiles = [...STANDARD_PROFILES, ...customProfiles].filter(
    (p) => !p.isGeneric && Boolean(p.expectedWidthMm) && Boolean(p.expectedHeightMm)
  );

  const exactOrientationMatches: ProductionProfile[] = [];
  const inverseOrientationMatches: ProductionProfile[] = [];

  for (const p of allProfiles) {
    const expW = p.expectedWidthMm!;
    const expH = p.expectedHeightMm!;

    // Direct match (Width == expW && Height == expH) -> Exact orientation
    const directMatch =
      Math.abs(widthMm - expW) <= toleranceMm &&
      Math.abs(heightMm - expH) <= toleranceMm;

    if (directMatch) {
      exactOrientationMatches.push(p);
      continue;
    }

    // Rotated match (Width == expH && Height == expW) -> Inverse orientation
    const rotatedMatch =
      Math.abs(widthMm - expH) <= toleranceMm &&
      Math.abs(heightMm - expW) <= toleranceMm;

    if (rotatedMatch) {
      inverseOrientationMatches.push(p);
    }
  }

  return {
    exactOrientationMatches,
    inverseOrientationMatches,
    allMatches: [...exactOrientationMatches, ...inverseOrientationMatches],
  };
}

/**
 * Legacy compatibility wrapper returning all matching profiles.
 */
export function findMatchingProfiles(
  widthMm: number,
  heightMm: number,
  customProfiles: ProductionProfile[] = [],
  toleranceMm: number = 0.5
): ProductionProfile[] {
  return findMatchingProfilesWithOrientation(widthMm, heightMm, customProfiles, toleranceMm).allMatches;
}

/**
 * Detects matching profiles from a PDF page structure, testing both
 * visual page dimensions, explicit TrimBox, and potential 3mm bleed deduction,
 * categorizing matches by orientation.
 */
export function detectMatchingProfilesFromPage(
  page: { widthMm: number; heightMm: number; visualWidthMm?: number; visualHeightMm?: number; trimBox?: { widthMm: number; heightMm: number } | null },
  customProfiles: ProductionProfile[] = [],
  toleranceMm: number = 0.5
): {
  detectedWidthMm: number;
  detectedHeightMm: number;
  pageOrientation: 'portrait' | 'landscape';
  exactOrientationMatches: ProductionProfile[];
  inverseOrientationMatches: ProductionProfile[];
  matches: ProductionProfile[];
} {
  const pageW = page.visualWidthMm || page.widthMm;
  const pageH = page.visualHeightMm || page.heightMm;
  const pageOrientation: 'portrait' | 'landscape' = pageW <= pageH ? 'portrait' : 'landscape';

  // 1. If explicit TrimBox exists, prioritize its dimensions
  if (page.trimBox && page.trimBox.widthMm > 0 && page.trimBox.heightMm > 0) {
    const trimW = page.trimBox.widthMm;
    const trimH = page.trimBox.heightMm;
    const { exactOrientationMatches, inverseOrientationMatches, allMatches } = findMatchingProfilesWithOrientation(trimW, trimH, customProfiles, toleranceMm);
    if (allMatches.length > 0) {
      return {
        detectedWidthMm: trimW,
        detectedHeightMm: trimH,
        pageOrientation: trimW <= trimH ? 'portrait' : 'landscape',
        exactOrientationMatches,
        inverseOrientationMatches,
        matches: allMatches,
      };
    }
  }

  // 2. Direct visual page dimensions match
  const directMatchObj = findMatchingProfilesWithOrientation(pageW, pageH, customProfiles, toleranceMm);
  if (directMatchObj.allMatches.length > 0) {
    return {
      detectedWidthMm: pageW,
      detectedHeightMm: pageH,
      pageOrientation,
      exactOrientationMatches: directMatchObj.exactOrientationMatches,
      inverseOrientationMatches: directMatchObj.inverseOrientationMatches,
      matches: directMatchObj.allMatches,
    };
  }

  // 3. Test if visual dimensions represent page with 3mm bleed (e.g. 96x56 -> 90x50, 216x303 -> 210x297)
  const trimmedW = pageW - 6.0;
  const trimmedH = pageH - 6.0;
  if (trimmedW > 0 && trimmedH > 0) {
    const bleedMatchObj = findMatchingProfilesWithOrientation(trimmedW, trimmedH, customProfiles, toleranceMm);
    if (bleedMatchObj.allMatches.length > 0) {
      return {
        detectedWidthMm: trimmedW,
        detectedHeightMm: trimmedH,
        pageOrientation: trimmedW <= trimmedH ? 'portrait' : 'landscape',
        exactOrientationMatches: bleedMatchObj.exactOrientationMatches,
        inverseOrientationMatches: bleedMatchObj.inverseOrientationMatches,
        matches: bleedMatchObj.allMatches,
      };
    }
  }

  return {
    detectedWidthMm: pageW,
    detectedHeightMm: pageH,
    pageOrientation,
    exactOrientationMatches: [],
    inverseOrientationMatches: [],
    matches: [],
  };
}
