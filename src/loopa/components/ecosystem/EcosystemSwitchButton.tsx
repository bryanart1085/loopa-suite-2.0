import { Share2 } from 'lucide-react';
import { LOOPA_APPS } from '../../core/ecosystem/apps';
import type { LoopaAppId } from '../../core/ecosystem/types';
import { LoopaAppIcon } from './LoopaAppIcon';

/** Opens "Compartir con LOOPA Ecosystem" to move the open project to another app. */
export function EcosystemSwitchButton({
  activeAppId,
  onClick,
}: {
  activeAppId: LoopaAppId;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid="ecosystem-switch-btn"
      onClick={onClick}
      aria-label={`Compartir con LOOPA Ecosystem (ahora en ${LOOPA_APPS[activeAppId].name})`}
      title={`Compartir con LOOPA Ecosystem · ahora en ${LOOPA_APPS[activeAppId].name}`}
      className="h-9 px-2.5 rounded-lg border border-primary/45 bg-surface/95 hover:bg-surface-raised text-foreground flex items-center gap-1.5 text-xs font-semibold shadow-md transition-colors touch-manipulation"
    >
      <LoopaAppIcon appId={activeAppId} className="w-3.5 h-3.5 shrink-0" />
      <span className="whitespace-nowrap">Ecosystem</span>
      <Share2 className="w-3.5 h-3.5 text-primary shrink-0" />
    </button>
  );
}
