export const APP_NAME = 'LOOPA';
export const APP_SHORT_NAME = 'LOOPA';
export const APP_TAGLINE = 'Modelador 3D Táctil';
export const APP_GALLERY_SUBTITLE = 'Galería de proyectos y escenas 3D';
export const APP_DESCRIPTION =
  'Modelador 3D táctil para iPad y navegador con modos Objeto y Edición, topología editable real de vértices, aristas y caras, manipuladores 3D y almacenamiento local de proyectos.';
export const APP_VERSION = '1.4';

export const APP_BRAND_ASSETS = {
  /** Lockup oficial completo (símbolo Loop Tool 3D + palabra LOOPA) con transparencia */
  fullLogo: '/brand/loopa-logo-full.png',
  /** Lockup horizontal compacto (símbolo + palabra LOOPA) para cabeceras y diálogos */
  horizontalLogo: '/brand/loopa-logo-horizontal.png',
  /** Símbolo 3D Loop Tool aislado (para iconos de app, favicon y barras compactas) */
  symbol: '/brand/loopa-symbol.png',
  /** Símbolo 3D Loop Tool compacto 256px */
  symbolCompact: '/brand/loopa-symbol-256.png',
  /** Palabra LOOPA oficial con su tipografía y verde originales */
  wordmark: '/brand/loopa-wordmark.png',
  /** Recurso original oficial */
  sourceOriginal: '/assets/aistudio/IMG_7507_74be0862.png',
  /** Favicon multi-tamaño */
  favicon: '/favicon.ico',
} as const;

export const APP_BRAND_COLORS = {
  /** Verde principal monocromático del símbolo Loop Tool */
  primary: '#5ecd6e',
  /** Verde luminoso oficial de la tipografía LOOPA (alta legibilidad en modo oscuro) */
  light: '#6fe681',
  /** Highlight claro para estados hover y énfasis sobre oscuro */
  highlight: '#7def8e',
  /** Verde sólido ligeramente más profundo para interruptores y botones */
  solid: '#49b459',
  /** Verde sombra del símbolo 3D */
  deep: '#2d763a',
  /** Superficie oscura con tinte verde sutil para elementos activos */
  surfaceTint: '#16261a',
} as const;

export function getAppDocumentTitle(section?: string): string {
  return section
    ? `${APP_NAME} — ${section}`
    : `${APP_NAME} — ${APP_TAGLINE}`;
}
