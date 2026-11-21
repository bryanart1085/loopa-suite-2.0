import { ProjectTemplateId } from './types';

function encodeSvgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export const PROJECT_TEMPLATE_META: Record<
  ProjectTemplateId,
  {
    id: ProjectTemplateId;
    label: string;
    subtitle: string;
    defaultObjectName: string;
  }
> = {
  empty: {
    id: 'empty',
    label: 'Proyecto vacío',
    subtitle: 'Escena limpia lista para modelar desde cero',
    defaultObjectName: 'Sin objetos',
  },
  cube: {
    id: 'cube',
    label: 'Cubo',
    subtitle: 'Malla base cúbica de 2×2×2 m',
    defaultObjectName: 'Cubo',
  },
  uv_sphere: {
    id: 'uv_sphere',
    label: 'Esfera',
    subtitle: 'Esfera UV subdividida lista para esculpir',
    defaultObjectName: 'Esfera',
  },
  plane: {
    id: 'plane',
    label: 'Plano',
    subtitle: 'Superficie base horizontal para arquitectura o terreno',
    defaultObjectName: 'Plano',
  },
};

export function generateTemplateThumbnailDataUrl(
  templateId: ProjectTemplateId = 'empty',
): string {
  const baseBackdrop = `
    <defs>
      <radialGradient id="bg" cx="50%" cy="42%" r="70%">
        <stop offset="0%" stop-color="#252932" />
        <stop offset="100%" stop-color="#15171c" />
      </radialGradient>
      <linearGradient id="amberFace" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#7def8e" stop-opacity="0.92" />
        <stop offset="100%" stop-color="#49b459" stop-opacity="0.88" />
      </linearGradient>
      <linearGradient id="slateTop" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#cbd5e1" />
        <stop offset="100%" stop-color="#94a3b8" />
      </linearGradient>
      <linearGradient id="slateRight" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#7a8494" />
        <stop offset="100%" stop-color="#515866" />
      </linearGradient>
      <linearGradient id="slateLeft" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#9aa3b2" />
        <stop offset="100%" stop-color="#697180" />
      </linearGradient>
    </defs>
    <rect width="480" height="320" fill="url(#bg)" />
    <g stroke="#2c313b" stroke-width="1" opacity="0.72">
      <line x1="60" y1="210" x2="420" y2="210" />
      <line x1="90" y1="184" x2="390" y2="184" />
      <line x1="120" y1="162" x2="360" y2="162" />
      <line x1="36" y1="242" x2="444" y2="242" />
      <line x1="180" y1="144" x2="88" y2="274" />
      <line x1="240" y1="144" x2="240" y2="274" />
      <line x1="300" y1="144" x2="392" y2="274" />
    </g>
    <g stroke-width="1.5" opacity="0.6">
      <line x1="90" y1="210" x2="390" y2="210" stroke="#e05252" />
      <line x1="240" y1="150" x2="240" y2="262" stroke="#52b852" />
    </g>
  `;

  let subject = '';
  if (templateId === 'cube') {
    subject = `
      <ellipse cx="240" cy="222" rx="76" ry="18" fill="#0d0e12" opacity="0.55" />
      <polygon points="240,76 312,116 240,156 168,116" fill="url(#slateTop)" stroke="#1f232b" stroke-width="1.5" />
      <polygon points="168,116 240,156 240,224 168,184" fill="url(#slateLeft)" stroke="#1f232b" stroke-width="1.5" />
      <polygon points="312,116 240,156 240,224 312,184" fill="url(#slateRight)" stroke="#1f232b" stroke-width="1.5" />
      <polygon points="240,76 312,116 312,184 240,224 168,184 168,116" fill="none" stroke="#5ecd6e" stroke-width="1.75" opacity="0.85" />
    `;
  } else if (templateId === 'uv_sphere') {
    subject = `
      <ellipse cx="240" cy="226" rx="70" ry="16" fill="#0d0e12" opacity="0.55" />
      <defs>
        <radialGradient id="sphereGrad" cx="38%" cy="32%" r="65%">
          <stop offset="0%" stop-color="#dce2ec" />
          <stop offset="55%" stop-color="#8b94a4" />
          <stop offset="100%" stop-color="#3c424f" />
        </radialGradient>
      </defs>
      <circle cx="240" cy="148" r="68" fill="url(#sphereGrad)" stroke="#5ecd6e" stroke-width="1.6" />
      <ellipse cx="240" cy="148" rx="68" ry="22" fill="none" stroke="#1e222a" stroke-width="1.2" opacity="0.65" />
      <ellipse cx="240" cy="148" rx="28" ry="68" fill="none" stroke="#1e222a" stroke-width="1.2" opacity="0.65" />
      <ellipse cx="240" cy="120" rx="58" ry="15" fill="none" stroke="#1e222a" stroke-width="1" opacity="0.45" />
      <ellipse cx="240" cy="176" rx="58" ry="15" fill="none" stroke="#1e222a" stroke-width="1" opacity="0.45" />
    `;
  } else if (templateId === 'plane') {
    subject = `
      <polygon points="240,136 356,184 240,236 124,184" fill="#0d0e12" opacity="0.42" transform="translate(0, 12)" />
      <polygon points="240,128 356,176 240,228 124,176" fill="url(#slateTop)" stroke="#5ecd6e" stroke-width="1.8" />
      <line x1="182" y1="152" x2="298" y2="202" stroke="#1e222a" stroke-width="1.1" opacity="0.45" />
      <line x1="298" y1="152" x2="182" y2="202" stroke="#1e222a" stroke-width="1.1" opacity="0.45" />
    `;
  } else {
    subject = `
      <circle cx="240" cy="164" r="24" fill="none" stroke="#5ecd6e" stroke-width="1.5" stroke-dasharray="4 4" opacity="0.7" />
      <line x1="240" y1="164" x2="292" y2="164" stroke="#e05252" stroke-width="2.5" stroke-linecap="round" />
      <line x1="240" y1="164" x2="240" y2="112" stroke="#48bce8" stroke-width="2.5" stroke-linecap="round" />
      <line x1="240" y1="164" x2="208" y2="190" stroke="#52b852" stroke-width="2.5" stroke-linecap="round" />
      <circle cx="240" cy="164" r="4" fill="#5ecd6e" />
    `;
  }

  return encodeSvgDataUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320" width="480" height="320">${baseBackdrop}${subject}</svg>`,
  );
}

export function encodeProjectThumbnailFromCanvas(
  sourceCanvas: HTMLCanvasElement,
  targetWidth = 480,
  targetHeight = 320,
): string | null {
  if (typeof document === 'undefined') return null;
  const sw = sourceCanvas.width;
  const sh = sourceCanvas.height;
  if (sw <= 0 || sh <= 0) return null;

  try {
    const out = document.createElement('canvas');
    out.width = targetWidth;
    out.height = targetHeight;
    const ctx = out.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#18191c';
    ctx.fillRect(0, 0, targetWidth, targetHeight);

    const srcAspect = sw / sh;
    const dstAspect = targetWidth / targetHeight;
    let sx = 0;
    let sy = 0;
    let cropW = sw;
    let cropH = sh;

    if (srcAspect > dstAspect) {
      cropW = Math.round(sh * dstAspect);
      sx = Math.max(0, Math.floor((sw - cropW) / 2));
    } else if (srcAspect < dstAspect) {
      cropH = Math.round(sw / dstAspect);
      sy = Math.max(0, Math.floor((sh - cropH) / 2));
    }

    ctx.drawImage(
      sourceCanvas,
      sx,
      sy,
      cropW,
      cropH,
      0,
      0,
      targetWidth,
      targetHeight,
    );

    const webp = out.toDataURL('image/webp', 0.84);
    if (webp.startsWith('data:image/webp')) {
      return webp;
    }
    return out.toDataURL('image/png');
  } catch {
    return null;
  }
}
