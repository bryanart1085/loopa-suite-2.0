import React, { useEffect, useRef, useState } from 'react';
import { Box, ChevronDown, Scissors, Wrench } from 'lucide-react';
import type { LoopaAppId } from '../core/ecosystem/types';
import type { LeftToolbarDisplayMode } from '../core/project/storage';
import type { WorkMode } from '../core/project/types';

interface WorkspaceQuickControlsProps {
  activeAppId: LoopaAppId;
  toolbarMode: LeftToolbarDisplayMode;
  toolbarControlsId: string;
  workMode: WorkMode;
  canEdit: boolean;
  onToggleToolbar: () => void;
  onToggleWorkMode: (mode: WorkMode) => void;
}

type AppMode = 'object' | 'edit';

function getAppMode(appId: LoopaAppId, workMode: WorkMode): AppMode {
  if (appId === 'sculpt') return workMode === 'object' ? 'object' : 'edit';
  return workMode === 'edit' ? 'edit' : 'object';
}

function getWorkModeForApp(
  appId: LoopaAppId,
  mode: AppMode,
): WorkMode {
  if (appId === 'sculpt' && mode === 'edit') return 'sculpt';
  return mode;
}

export const WorkspaceQuickControls: React.FC<WorkspaceQuickControlsProps> = ({
  activeAppId,
  toolbarMode,
  toolbarControlsId,
  workMode,
  canEdit,
  onToggleToolbar,
  onToggleWorkMode,
}) => {
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const modeControlRef = useRef<HTMLDivElement | null>(null);
  const appMode = getAppMode(activeAppId, workMode);
  const toolbarVisible = toolbarMode !== 'hidden';
  const editDisabled = !canEdit;

  useEffect(() => {
    if (!modeMenuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!modeControlRef.current?.contains(event.target as Node)) {
        setModeMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setModeMenuOpen(false);
    };
    window.addEventListener('pointerdown', closeOnOutsideClick);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('pointerdown', closeOnOutsideClick);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [modeMenuOpen]);

  const selectMode = (mode: AppMode) => {
    if (mode === 'edit' && editDisabled) return;
    onToggleWorkMode(getWorkModeForApp(activeAppId, mode));
    setModeMenuOpen(false);
  };

  return (
    <>
      <button
        type="button"
        data-testid="left-toolbar-toggle"
        data-display-mode={toolbarMode}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={onToggleToolbar}
        aria-expanded={toolbarVisible}
        aria-controls={toolbarControlsId}
        aria-label={
          toolbarVisible
            ? 'Ocultar barra de herramientas'
            : 'Mostrar barra de herramientas'
        }
        title={
          toolbarVisible
            ? 'Ocultar barra de herramientas'
            : 'Mostrar barra de herramientas'
        }
        className={`fixed top-[54px] left-2 w-10 h-9 rounded-lg border flex items-center justify-center z-30 shadow-md transition-colors touch-manipulation ${
          toolbarVisible
            ? 'bg-[#16261a] hover:bg-[#1e3322] border-[#5ecd6e]/65 text-[#5ecd6e]'
            : 'bg-[#181a1f]/95 hover:bg-[#23262e] border-[#343a47] text-[#e4e6eb]'
        }`}
      >
        <Wrench className="w-4 h-4" />
      </button>

      <div
        ref={modeControlRef}
        className="fixed top-[54px] left-[54px] z-30"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          data-testid="work-mode-switcher"
          onClick={() => setModeMenuOpen((open) => !open)}
          aria-expanded={modeMenuOpen}
          aria-haspopup="menu"
          aria-label="Cambiar modo de trabajo"
          title="Cambiar entre Modo Objeto y Modo Edición"
          className={`h-9 px-2.5 rounded-lg border flex items-center gap-1.5 text-xs font-semibold shadow-md transition-colors touch-manipulation ${
            appMode === 'edit'
              ? 'bg-[#112433] hover:bg-[#173044] border-[#38bdf8]/70 text-[#7dd3fc]'
              : 'bg-[#181a1f]/95 hover:bg-[#23262e] border-[#343a47] text-[#e4e6eb]'
          }`}
        >
          {appMode === 'edit' ? (
            <Scissors className="w-3.5 h-3.5 text-[#38bdf8] shrink-0" />
          ) : (
            <Box className="w-3.5 h-3.5 text-[#5ecd6e] shrink-0" />
          )}
          <span className="whitespace-nowrap">
            {appMode === 'edit' ? 'Modo Edición' : 'Modo Objeto'}
          </span>
          <ChevronDown
            className={`w-3.5 h-3.5 opacity-75 transition-transform ${
              modeMenuOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {modeMenuOpen && (
          <div
            role="menu"
            data-testid="work-mode-menu"
            aria-label="Modo de trabajo"
            className="mt-1.5 w-56 rounded-xl bg-[#181a20]/98 border border-[#303543] shadow-2xl p-1.5 space-y-1 backdrop-blur"
          >
            <button
              type="button"
              role="menuitemradio"
              aria-checked={appMode === 'object'}
              data-testid="work-mode-option-object"
              onClick={() => selectMode('object')}
              className={`w-full px-2.5 py-2 rounded-lg border text-left flex items-start gap-2 transition-colors ${
                appMode === 'object'
                  ? 'bg-[#252b36] border-[#5ecd6e]/70 text-white'
                  : 'bg-transparent hover:bg-[#222630] border-transparent text-[#cbd5e1]'
              }`}
            >
              <Box className="mt-0.5 w-4 h-4 text-[#5ecd6e] shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold leading-tight">
                  Modo Objeto
                </span>
                <span className="block text-[10px] text-[#8e95a2] leading-tight mt-0.5">
                  Seleccionar y transformar objetos completos
                </span>
              </span>
            </button>
            <button
              type="button"
              role="menuitemradio"
              aria-checked={appMode === 'edit'}
              data-testid="work-mode-option-edit"
              disabled={editDisabled}
              onClick={() => selectMode('edit')}
              className={`w-full px-2.5 py-2 rounded-lg border text-left flex items-start gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                appMode === 'edit'
                  ? 'bg-[#252b36] border-[#5ecd6e]/70 text-white'
                  : 'bg-transparent hover:bg-[#222630] border-transparent text-[#cbd5e1]'
              }`}
            >
              <Scissors className="mt-0.5 w-4 h-4 text-[#38bdf8] shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold leading-tight">
                  Modo Edición
                </span>
                <span className="block text-[10px] text-[#8e95a2] leading-tight mt-0.5">
                  {editDisabled
                    ? 'Selecciona un objeto de malla editable'
                    : activeAppId === 'sculpt'
                      ? 'Editar la superficie con herramientas de escultura'
                      : 'Editar los elementos disponibles en esta aplicación'}
                </span>
              </span>
            </button>
          </div>
        )}
      </div>
    </>
  );
};
