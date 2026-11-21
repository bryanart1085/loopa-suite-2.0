import { Box, Grid3X3, Palette, Sparkles } from 'lucide-react';
import type { LoopaAppId } from '../../core/ecosystem/types';

/** Static class names per app so Tailwind can see them. */
export const APP_ACCENT: Record<
  LoopaAppId,
  { text: string; bg: string; border: string; hoverBorder: string }
> = {
  modeler: {
    text: 'text-app-modeler',
    bg: 'bg-app-modeler/15',
    border: 'border-app-modeler/35',
    hoverBorder: 'hover:border-app-modeler/70',
  },
  sculpt: {
    text: 'text-app-sculpt',
    bg: 'bg-app-sculpt/15',
    border: 'border-app-sculpt/35',
    hoverBorder: 'hover:border-app-sculpt/70',
  },
  uvs: {
    text: 'text-app-uvs',
    bg: 'bg-app-uvs/15',
    border: 'border-app-uvs/35',
    hoverBorder: 'hover:border-app-uvs/70',
  },
  materials: {
    text: 'text-app-materials',
    bg: 'bg-app-materials/15',
    border: 'border-app-materials/35',
    hoverBorder: 'hover:border-app-materials/70',
  },
};

const ICONS = { modeler: Box, sculpt: Sparkles, uvs: Grid3X3, materials: Palette } as const;

export function LoopaAppIcon({
  appId,
  className = 'w-5 h-5',
}: {
  appId: LoopaAppId;
  className?: string;
}) {
  const Icon = ICONS[appId];
  return <Icon className={`${className} ${APP_ACCENT[appId].text}`} aria-hidden="true" />;
}

/** Rounded square badge with the app icon. */
export function LoopaAppBadge({ appId, size = 'md' }: { appId: LoopaAppId; size?: 'sm' | 'md' }) {
  const box = size === 'sm' ? 'w-7 h-7 rounded-md' : 'w-10 h-10 rounded-lg';
  const icon = size === 'sm' ? 'w-3.5 h-3.5' : 'w-5 h-5';
  return (
    <span
      className={`${box} ${APP_ACCENT[appId].bg} border ${APP_ACCENT[appId].border} flex items-center justify-center shrink-0`}
    >
      <LoopaAppIcon appId={appId} className={icon} />
    </span>
  );
}
