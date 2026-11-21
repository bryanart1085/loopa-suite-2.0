import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, Loader2, Share2, X } from 'lucide-react';
import { LOOPA_APP_ORDER, LOOPA_APPS } from '../../core/ecosystem/apps';
import type { LoopaAppId } from '../../core/ecosystem/types';
import { APP_ACCENT, LoopaAppBadge } from './LoopaAppIcon';

interface ShareWithEcosystemModalProps {
  isOpen: boolean;
  currentAppId: LoopaAppId;
  projectName: string;
  /** Objects whose geometry changed after their UVs were edited. */
  staleUvObjectNames: string[];
  onClose: () => void;
  /** Save and open the same project in another app. Resolves false if it failed. */
  onShare: (appId: LoopaAppId) => Promise<boolean>;
}

export function ShareWithEcosystemModal({
  isOpen,
  currentAppId,
  projectName,
  staleUvObjectNames,
  onClose,
  onShare,
}: ShareWithEcosystemModalProps) {
  const [busyApp, setBusyApp] = useState<LoopaAppId | null>(null);

  useEffect(() => {
    if (!isOpen) setBusyApp(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busyApp) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busyApp, isOpen, onClose]);

  if (!isOpen) return null;
  const targets = LOOPA_APP_ORDER.filter((id) => id !== currentAppId);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-scrim backdrop-blur-sm p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="loopa-share-title"
      onClick={() => !busyApp && onClose()}
    >
      <div
        className="w-full max-w-lg bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-lg bg-primary/15 border border-primary/35 flex items-center justify-center shrink-0">
              <Share2 className="w-4 h-4 text-primary" />
            </span>
            <div className="min-w-0">
              <h2 id="loopa-share-title" className="text-sm font-bold text-foreground">
                Compartir con LOOPA Ecosystem
              </h2>
              <p className="text-xs text-muted-foreground truncate">
                {projectName} · desde {LOOPA_APPS[currentAppId].name}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={Boolean(busyApp)}
            className="p-2 -m-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-40"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Se guardarán los cambios y se abrirá este mismo proyecto en la aplicación que elijas. No se crea ninguna
            copia.
          </p>

          {staleUvObjectNames.length > 0 && (
            <div className="flex gap-2.5 rounded-xl border border-warning/40 bg-warning/10 p-3">
              <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
              <p className="text-xs text-foreground">
                La geometría de <strong>{staleUvObjectNames.slice(0, 3).join(', ')}</strong>
                {staleUvObjectNames.length > 3 ? ` y ${staleUvObjectNames.length - 3} más` : ''} cambió después de
                editar sus UVs. Las UVs podrían necesitar actualización en LOOPA UVs.
              </p>
            </div>
          )}

          <div className="grid gap-2">
            {targets.map((id) => {
              const app = LOOPA_APPS[id];
              const busy = busyApp === id;
              return (
                <button
                  key={id}
                  type="button"
                  disabled={Boolean(busyApp)}
                  onClick={async () => {
                    setBusyApp(id);
                    const ok = await onShare(id);
                    if (!ok) setBusyApp(null);
                  }}
                  className={`group w-full flex items-center gap-3 rounded-xl border border-border ${APP_ACCENT[id].hoverBorder} bg-surface-raised hover:bg-accent p-3 text-left transition-colors disabled:opacity-60`}
                >
                  <LoopaAppBadge appId={id} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-foreground">{app.name}</span>
                    <span className="block text-xs text-muted-foreground leading-snug">{app.description}</span>
                  </span>
                  {busy ? (
                    <Loader2 className={`w-4 h-4 animate-spin ${APP_ACCENT[id].text}`} />
                  ) : (
                    <ArrowRight
                      className={`w-4 h-4 ${APP_ACCENT[id].text} transition-transform group-hover:translate-x-0.5`}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
