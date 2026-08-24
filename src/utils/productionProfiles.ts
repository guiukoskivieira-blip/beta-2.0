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
