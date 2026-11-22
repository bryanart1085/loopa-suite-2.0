import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Axis3d,
  Box,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  CopyPlus,
  Cpu,
  Download,
  Eye,
  FileBox,
  FilePlus2,
  FileText,
  Focus,
  FolderOpen,
  Grid,
  Grid3X3,
  Image as ImageIcon,
  Layers,
  Loader2,
  Lock,
  PanelRight,
  PanelTop,
  PanelTopClose,
  Save,
  Settings,
  Upload,
} from 'lucide-react';
import { EditSelectionMode } from '../core/mesh/operations';
import {
  CameraProjection,
  SaveStatus,
  ViewportDisplayMode,
  WorkMode,
} from '../core/project/types';
import type { CameraPreset } from '../engine/ViewportEngine';
import { LoopaSymbol } from './BrandLogo';
import { LoopaAppIcon } from './ecosystem/LoopaAppIcon';
import { LOOPA_APPS, LOOPA_APP_ORDER } from '../core/ecosystem/apps';
import type { LoopaAppId } from '../core/ecosystem/types';
import { Share2 } from 'lucide-react';
import {
  DISPLAY_MODES,
  getXrayDescriptor,
  ShadingModeIcon,
  XRAY_PRESETS,
} from './ViewportDisplaySelector';

export type WorkspaceId = 'layout' | 'uv_editing' | 'timelapse' | 'materials';

type TopMenuKey = 'file' | 'viewport' | 'suite';

export interface SceneStatsInfo {
  objectCount: number;
  selectedObjectCount: number;
  selectedComponentCount: number;
  activeObjectName: string | null;
  vertices: number;
  edges: number;
  faces: number;
  workMode: WorkMode;
  editSelectionMode: EditSelectionMode;
}

interface TopBarProps {
  projectName: string;
  hasUnsavedChanges: boolean;
  saveStatus: SaveStatus;
  lastSaveError?: string | null;
  barhomeVisible: boolean;
  onToggleBarhome: () => void;
  hasSelectedObject: boolean;
  displayMode: ViewportDisplayMode;
  xrayTransparency: number;
  showFaceOrientation: boolean;
  showGrid: boolean;
  showAxes: boolean;
  projection: CameraProjection;
  showLiner: boolean;
  sceneStats?: SceneStatsInfo;
  demoMode?: boolean;
  onReturnToGallery: () => void;
  onCreateProjectModal: () => void;
  onOpenProjectModal: () => void;
  onSaveProject: () => void;
  onSaveAsProjectModal: () => void;
  onImportNativeProject: () => void;
  onExportNativeProject: () => void;
  onImportExternal: () => void;
  onExportExternal: () => void;
  onOpenSettingsModal: () => void;
  onImportObj: () => void;
  onImportStl: () => void;
  onImportJpg: () => void;
  onImportPng: () => void;
  onExportSelected: () => void;
  onExportScene: () => void;
  onExportObj: () => void;
  onExportStl: () => void;
  onSelectDisplayMode: (mode: ViewportDisplayMode) => void;
  onChangeXrayTransparency: (value: number) => void;
  onToggleFaceOrientation: () => void;
  onToggleGrid: () => void;
  onToggleAxes: () => void;
  onChangeProjection: (projection: CameraProjection) => void;
  onSelectCameraPreset: (preset: CameraPreset) => void;
  onFocusSelected: () => void;
  onToggleLiner: () => void;
  onOpenApp: (appId: LoopaAppId) => void;
  activeAppId?: LoopaAppId;
}

const CAMERA_VIEW_PRESETS: {
  id: CameraPreset;
  label: string;
}[] = [
  { id: 'front', label: 'Frontal' },
  { id: 'back', label: 'Posterior' },
  { id: 'right', label: 'Lateral Der.' },
  { id: 'left', label: 'Lateral Izq.' },
  { id: 'top', label: 'Superior' },
  { id: 'bottom', label: 'Inferior' },
];

export const TopBar: React.FC<TopBarProps> = ({
  projectName,
  hasUnsavedChanges,
  saveStatus,
  lastSaveError = null,
  barhomeVisible,
  onToggleBarhome,
  hasSelectedObject,
  displayMode,
  xrayTransparency,
  showFaceOrientation,
  showGrid,
  showAxes,
  projection,
  showLiner,
  sceneStats,
  demoMode = false,
  onReturnToGallery,
  onCreateProjectModal,
  onOpenProjectModal,
  onSaveProject,
  onSaveAsProjectModal,
  onImportNativeProject,
  onExportNativeProject,
  onImportExternal,
  onExportExternal,
  onOpenSettingsModal,
  onImportObj,
  onImportStl,
  onImportJpg,
  onImportPng,
  onExportSelected,
  onExportScene,
  onExportObj,
  onExportStl,
  onSelectDisplayMode,
  onChangeXrayTransparency,
  onToggleFaceOrientation,
  onToggleGrid,
  onToggleAxes,
  onChangeProjection,
  onSelectCameraPreset,
  onFocusSelected,
  onToggleLiner,
  onOpenApp,
  activeAppId,
}) => {
  const [openMenu, setOpenMenu] = useState<{
    key: TopMenuKey;
    left: number;
    top: number;
  } | null>(null);

  const fileBtnRef = useRef<HTMLButtonElement | null>(null);
  const viewportBtnRef = useRef<HTMLButtonElement | null>(null);
  const suiteBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!openMenu) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenMenu(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openMenu]);

  useEffect(() => {
    if (!barhomeVisible && openMenu) {
      setOpenMenu(null);
    }
  }, [barhomeVisible, openMenu]);

  const toggleMenu = (
    key: TopMenuKey,
    btnRef: React.RefObject<HTMLButtonElement | null>,
    menuWidth: number,
  ) => {
    if (!barhomeVisible) return;
    if (openMenu?.key === key) {
      setOpenMenu(null);
      return;
    }
    const rect = btnRef.current?.getBoundingClientRect();
    const rawLeft = rect ? rect.left : 12;
    const clampedLeft = Math.max(
      8,
      Math.min(window.innerWidth - menuWidth - 8, rawLeft),
    );
    const top = rect ? rect.bottom + 6 : 50;
    setOpenMenu({ key, left: clampedLeft, top });
  };

  return (
    <>
      {/* Esquina superior izquierda: LOOPA Suite + control de BARHOME */}
      <div
        data-testid="loopa-corner-anchor"
        onPointerDown={(e) => e.stopPropagation()}
        className={`fixed top-0 left-0 h-12 px-2 flex items-center gap-1.5 z-40 transition-colors duration-200 ${
          barhomeVisible
            ? 'bg-transparent'
            : 'bg-[#181a1f]/95 border-r border-b border-[#2b2e36] rounded-br-xl shadow-lg backdrop-blur-sm'
        }`}
      >
        <button
          type="button"
          data-testid="loopa-home-logo-btn"
          onClick={() => {
            setOpenMenu(null);
            onReturnToGallery();
          }}
          aria-label="Volver a LOOPA Suite"
          title="Volver a LOOPA Suite"
          className="w-10 h-9 rounded-lg bg-[#121418] hover:bg-[#16261a] active:bg-[#1c3322] border border-[#2b2f38] hover:border-[#5ecd6e]/60 flex items-center justify-center shrink-0 transition-colors touch-manipulation"
        >
          <LoopaSymbol size={22} />
        </button>

        <button
          type="button"
          data-testid="barhome-toggle-btn"
          onClick={() => {
            if (barhomeVisible) setOpenMenu(null);
            onToggleBarhome();
          }}
          aria-expanded={barhomeVisible}
          aria-controls="loopa-barhome"
          aria-label={barhomeVisible ? 'Ocultar BARHOME' : 'Mostrar BARHOME'}
          title={barhomeVisible ? 'Ocultar BARHOME' : 'Mostrar BARHOME'}
          className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 transition-colors touch-manipulation ${
            barhomeVisible
              ? 'bg-[#22252d] hover:bg-[#2c313b] border-[#323640] text-[#cbd5e1] hover:text-[#5ecd6e]'
              : 'bg-[#16261a] hover:bg-[#1e3524] border-[#5ecd6e]/60 text-[#5ecd6e]'
          }`}
        >
          {barhomeVisible ? (
            <PanelTopClose className="w-4 h-4" />
          ) : (
            <PanelTop className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* BARHOME: Barra Superior Desplegable y Contraíble */}
      <header
        id="loopa-barhome"
        data-testid="barhome"
        aria-label="BARHOME"
        aria-hidden={!barhomeVisible}
        onPointerDown={(e) => e.stopPropagation()}
        className={`shrink-0 bg-[#181a1f] overflow-hidden transition-[height,opacity] duration-200 ease-out z-30 ${
          barhomeVisible
            ? 'h-12 opacity-100 border-b border-[#2b2e36]'
            : 'h-0 opacity-0 border-b-0 pointer-events-none'
        }`}
      >
        <div className="h-12 pl-[102px] pr-2 sm:pr-3.5 flex items-center justify-between gap-2">
          {/* Navegación principal de BARHOME */}
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <span className="hidden xl:inline text-[10px] font-bold uppercase tracking-wider text-[#6e7685] pr-1 select-none shrink-0">
              BARHOME
            </span>

            <nav
              data-testid="topbar-main-nav"
              aria-label="BARHOME"
              className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto cad-scroll"
            >
              {/* 1. ARCHIVO */}
              <button
                ref={fileBtnRef}
                type="button"
                data-testid="topbar-file-btn"
                onClick={() => toggleMenu('file', fileBtnRef, 292)}
                aria-expanded={openMenu?.key === 'file'}
                aria-haspopup="menu"
                className={`min-h-[36px] px-2.5 sm:px-3 rounded-md border text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors touch-manipulation ${
                  openMenu?.key === 'file'
                    ? 'bg-[#2c313b] border-[#5ecd6e]/65 text-[#5ecd6e]'
                    : 'bg-[#22252d] hover:bg-[#2a2e38] border-[#323640] text-[#e4e6eb]'
                }`}
              >
                <FileText className="w-4 h-4 text-[#5ecd6e] shrink-0" />
                <span>Archivo</span>
                <ChevronDown className="w-3.5 h-3.5 opacity-70 shrink-0" />
              </button>

              {/* 2. VIEWPORT */}
              <button
                ref={viewportBtnRef}
                type="button"
                data-testid="topbar-viewport-btn"
                onClick={() => toggleMenu('viewport', viewportBtnRef, 292)}
                aria-expanded={openMenu?.key === 'viewport'}
                aria-haspopup="menu"
                className={`min-h-[36px] px-2.5 sm:px-3 rounded-md border text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors touch-manipulation ${
                  openMenu?.key === 'viewport'
                    ? 'bg-[#2c313b] border-[#5ecd6e]/65 text-[#5ecd6e]'
                    : 'bg-[#22252d] hover:bg-[#2a2e38] border-[#323640] text-[#e4e6eb]'
                }`}
              >
                <Eye className="w-4 h-4 text-[#5ecd6e] shrink-0" />
                <span>Viewport</span>
                <ChevronDown className="w-3.5 h-3.5 opacity-70 shrink-0" />
              </button>

              {/* 3. SUITE */}
              <button
                ref={suiteBtnRef}
                type="button"
                data-testid="topbar-suite-btn"
                onClick={() => toggleMenu('suite', suiteBtnRef, 300)}
                aria-expanded={openMenu?.key === 'suite'}
                aria-haspopup="menu"
                className={`min-h-[36px] px-2.5 sm:px-3 rounded-md border text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors touch-manipulation ${
                  openMenu?.key === 'suite'
                    ? 'bg-[#2c313b] border-[#5ecd6e]/65 text-[#5ecd6e]'
                    : 'bg-[#22252d] hover:bg-[#2a2e38] border-[#323640] text-[#e4e6eb]'
                }`}
              >
                <LoopaSymbol size={16} />
                <span>Suite</span>
                <ChevronDown className="w-3.5 h-3.5 opacity-70 shrink-0" />
              </button>
            </nav>
          </div>

          {/* Right: Discreet Project Name + Save Status + Quick Hide */}
          <div className="flex items-center gap-1.5 shrink-0">
            {activeAppId && (
              <span
                className="hidden lg:flex items-center gap-1.5 text-xs font-semibold text-foreground shrink-0"
                title={`Aplicación activa: ${LOOPA_APPS[activeAppId].name}`}
              >
                <LoopaAppIcon appId={activeAppId} className="w-3.5 h-3.5" />
                {LOOPA_APPS[activeAppId].name}
              </span>
            )}

            <span
              className="hidden md:inline text-xs font-semibold text-[#d1d5db] truncate max-w-[160px]"
              title={projectName}
            >
              {projectName}
            </span>

            <button
              type="button"
              onClick={onSaveProject}
              title={
                saveStatus === 'error'
                  ? lastSaveError ?? 'Error al guardar'
                  : 'Guardar proyecto ahora (Ctrl+S)'
              }
              className={`hidden sm:flex min-h-[32px] px-2 rounded-md text-[11px] font-medium items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                saveStatus === 'error'
                  ? 'bg-[#331e22] text-[#fca5a5] border border-[#5c2c33]'
                  : saveStatus === 'saving'
                    ? 'text-[#cbd5e1] bg-[#22252d]'
                    : saveStatus === 'unsaved' || hasUnsavedChanges
                      ? 'text-[#5ecd6e] hover:bg-[#252932]'
                      : 'text-[#8e95a2] hover:bg-[#22252d] hover:text-[#e4e6eb]'
              }`}
            >
              {saveStatus === 'saving' ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#5ecd6e]" />
                  <span>Guardando...</span>
                </>
              ) : saveStatus === 'error' ? (
                <>
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Error</span>
                </>
              ) : saveStatus === 'unsaved' || hasUnsavedChanges ? (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Sin guardar</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#34d399]" />
                  <span>Guardado</span>
                </>
              )}
            </button>

            <button
              type="button"
              data-testid="barhome-liner-toggle-btn"
              data-liner-open={showLiner ? 'true' : 'false'}
              onClick={() => {
                setOpenMenu(null);
                onToggleLiner();
              }}
              aria-expanded={showLiner}
              aria-controls="loopa-liner-panel"
              aria-label={showLiner ? 'Cerrar Liner' : 'Abrir Liner'}
              title={
                showLiner
                  ? 'Cerrar panel Liner (Jerarquía, Modificadores)'
                  : 'Abrir panel Liner (Jerarquía, Modificadores)'
              }
              className={`min-h-[36px] px-2 sm:px-2.5 rounded-md border flex items-center justify-center gap-1 shrink-0 transition-colors touch-manipulation ${
                showLiner
                  ? 'bg-[#16261a] hover:bg-[#1e3322] border-[#5ecd6e]/65 text-[#5ecd6e]'
                  : 'bg-[#22252d] hover:bg-[#2c3039] border-[#323640] text-[#cbd5e1] hover:text-white'
              }`}
            >
              <ChevronLeft
                className={`w-4 h-4 shrink-0 transition-transform duration-200 ${
                  showLiner ? 'rotate-180' : 'rotate-0'
                }`}
              />
              <span className="hidden lg:inline text-[11px] font-semibold whitespace-nowrap">
                Liner
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Dropdown Popover Backdrop + Single Open Menu */}
      {openMenu && (
        <div
          className="fixed inset-0 z-40"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) {
              setOpenMenu(null);
            }
          }}
        >
          {/* A. ARCHIVO MENU */}
          {openMenu.key === 'file' && (
            <div
              role="menu"
              aria-label="Menú Archivo"
              style={{ left: openMenu.left, top: openMenu.top }}
              onPointerDown={(e) => e.stopPropagation()}
              className="fixed w-[292px] max-h-[78vh] overflow-y-auto cad-scroll rounded-xl bg-[#181a1f] border border-[#343a47] shadow-2xl p-1.5 space-y-1"
            >
              <button
                type="button"
                role="menuitem"
                data-testid="menu-file-new"
                onClick={() => {
                  setOpenMenu(null);
                  onCreateProjectModal();
                }}
                className="w-full min-h-[40px] px-2.5 rounded-lg hover:bg-[#252932] active:bg-[#2e333f] text-xs font-medium text-[#e4e6eb] flex items-center gap-2.5 text-left transition-colors"
              >
                <FilePlus2 className="w-4 h-4 text-[#5ecd6e] shrink-0" />
                <span>Nuevo proyecto</span>
              </button>

              {!demoMode && <button
                type="button"
                role="menuitem"
                data-testid="menu-file-open"
                onClick={() => {
                  setOpenMenu(null);
                  onOpenProjectModal();
                }}
                className="w-full min-h-[40px] px-2.5 rounded-lg hover:bg-[#252932] active:bg-[#2e333f] text-xs font-medium text-[#e4e6eb] flex items-center gap-2.5 text-left transition-colors"
              >
                <FolderOpen className="w-4 h-4 text-[#5ecd6e] shrink-0" />
                <span>Abrir proyecto</span>
              </button>}

              <button
                type="button"
                role="menuitem"
                data-testid="menu-file-save"
                onClick={() => {
                  setOpenMenu(null);
                  onSaveProject();
                }}
                className="w-full min-h-[40px] px-2.5 rounded-lg hover:bg-[#252932] active:bg-[#2e333f] text-xs font-medium text-[#e4e6eb] flex items-center justify-between gap-2 text-left transition-colors"
              >
                <span className="flex items-center gap-2.5">
                  <Save className="w-4 h-4 text-[#5ecd6e] shrink-0" />
                  <span>Guardar</span>
                </span>
                {saveStatus === 'error' ? (
                  <span className="text-[10px] font-medium text-[#fca5a5]">
                    Error
                  </span>
                ) : hasUnsavedChanges ? (
                  <span className="text-[10px] font-medium text-[#5ecd6e]">
                    Sin guardar
                  </span>
                ) : (
                  <span className="text-[10px] font-medium text-[#34d399]">
                    Guardado
                  </span>
                )}
              </button>

              {!demoMode && <button
                type="button"
                role="menuitem"
                data-testid="menu-file-save-as"
                onClick={() => {
                  setOpenMenu(null);
                  onSaveAsProjectModal();
                }}
                className="w-full min-h-[40px] px-2.5 rounded-lg hover:bg-[#252932] active:bg-[#2e333f] text-xs font-medium text-[#e4e6eb] flex items-center gap-2.5 text-left transition-colors"
              >
                <CopyPlus className="w-4 h-4 text-[#cbd5e1] shrink-0" />
                <span>Guardar como</span>
              </button>}

              <div className="my-1 border-t border-[#272b34]" />

              <div className="px-2.5 pt-1 pb-0.5 text-[11px] font-semibold text-[#8e95a2] flex items-center gap-1.5">
                <Download className="w-3.5 h-3.5 text-[#5ecd6e]" />
                <span>Archivo externo</span>
              </div>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpenMenu(null);
                  onImportExternal();
                }}
                className="w-full min-h-[38px] px-2.5 rounded-lg hover:bg-[#252932] text-xs font-medium text-[#e4e6eb] flex items-center gap-2.5 text-left transition-colors"
              >
                <Download className="w-4 h-4 text-[#5ecd6e] shrink-0" />
                <span>IMPORTAR</span>
              </button>

              {!demoMode && <>
                <div className="my-1 border-t border-[#272b34]" />
                <div className="px-2.5 pt-1 pb-0.5 text-[11px] font-semibold text-[#8e95a2] flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5 text-[#5ecd6e]" />
                  <span>Archivo externo</span>
                </div>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpenMenu(null);
                    onExportExternal();
                  }}
                  className="w-full min-h-[38px] px-2.5 rounded-lg hover:bg-[#252932] text-xs font-medium text-[#e4e6eb] flex items-center gap-2.5 text-left transition-colors"
                >
                  <Upload className="w-4 h-4 text-[#34d399] shrink-0" />
                  <span>EXPORTAR</span>
                </button>
              </>}

              <div className="my-1 border-t border-[#272b34]" />

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpenMenu(null);
                  onOpenSettingsModal();
                }}
                className="w-full min-h-[40px] px-2.5 rounded-lg hover:bg-[#252932] active:bg-[#2e333f] text-xs font-medium text-[#e4e6eb] flex items-center gap-2.5 text-left transition-colors"
              >
                <Settings className="w-4 h-4 text-[#9ca3af] shrink-0" />
                <span>Configuración</span>
              </button>

              {sceneStats && (
                <>
                  <div className="my-1 border-t border-[#272b34]" />
                  <div className="mx-1 p-2 rounded-lg bg-[#121418] border border-[#262932] space-y-1 text-[11px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[#cbd5e1] truncate">
                        {sceneStats.activeObjectName ?? 'Sin selección'}
                      </span>
                      <span className="font-mono-tabular text-[#8e95a2] shrink-0">
                        {sceneStats.objectCount} obj.
                      </span>
                    </div>
                    <div className="flex items-center justify-between font-mono-tabular text-[#9ca3af]">
                      <span>V: {sceneStats.vertices}</span>
                      <span>A: {sceneStats.edges}</span>
                      <span>C: {sceneStats.faces}</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* B. VIEWPORT MENU */}
          {openMenu.key === 'viewport' && (
            <div
              role="menu"
              aria-label="Menú Viewport"
              style={{ left: openMenu.left, top: openMenu.top }}
              onPointerDown={(e) => e.stopPropagation()}
              className="fixed w-[292px] max-h-[80vh] overflow-y-auto cad-scroll rounded-xl bg-[#181a1f] border border-[#343a47] shadow-2xl p-1.5 space-y-1"
            >
              {/* Proyección */}
              <div className="px-2.5 pt-1 pb-0.5 text-[11px] font-semibold text-[#8e95a2]">
                Proyección de cámara
              </div>
              <div className="grid grid-cols-2 gap-1">
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={projection === 'perspective'}
                  onClick={() => {
                    onChangeProjection('perspective');
                    setOpenMenu(null);
                  }}
                  className={`min-h-[38px] px-2.5 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                    projection === 'perspective'
                      ? 'bg-[#2c313b] border-[#5ecd6e]/65 text-[#5ecd6e]'
                      : 'bg-[#1e2128] hover:bg-[#272b35] border-transparent text-[#d1d5db]'
                  }`}
                >
                  <Camera className="w-3.5 h-3.5 shrink-0" />
                  <span>Perspectiva</span>
                </button>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={projection === 'orthographic'}
                  onClick={() => {
                    onChangeProjection('orthographic');
                    setOpenMenu(null);
                  }}
                  className={`min-h-[38px] px-2.5 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                    projection === 'orthographic'
                      ? 'bg-[#2c313b] border-[#60a5fa]/65 text-[#93c5fd]'
                      : 'bg-[#1e2128] hover:bg-[#272b35] border-transparent text-[#d1d5db]'
                  }`}
                >
                  <Grid3X3 className="w-3.5 h-3.5 shrink-0" />
                  <span>Ortográfica</span>
                </button>
              </div>

              {/* Vistas Estándar */}
              <div className="px-2.5 pt-1.5 pb-0.5 text-[11px] font-semibold text-[#8e95a2]">
                Vistas 3D
              </div>
              <div className="grid grid-cols-2 gap-1">
                {CAMERA_VIEW_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onSelectCameraPreset(preset.id);
                      setOpenMenu(null);
                    }}
                    className="min-h-[36px] px-2.5 rounded-lg bg-[#1e2128] hover:bg-[#272b35] text-xs font-medium text-[#e4e6eb] text-left transition-colors"
                  >
                    {preset.label}
                  </button>
                ))}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onSelectCameraPreset('iso');
                    setOpenMenu(null);
                  }}
                  className="min-h-[36px] px-2.5 rounded-lg bg-[#1e2128] hover:bg-[#272b35] text-xs font-medium text-[#cbd5e1] text-left transition-colors"
                >
                  Isométrica 3D
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onFocusSelected();
                    setOpenMenu(null);
                  }}
                  className="min-h-[36px] px-2.5 rounded-lg bg-[#1e2128] hover:bg-[#272b35] text-xs font-medium text-[#5ecd6e] flex items-center gap-1.5 transition-colors"
                >
                  <Focus className="w-3.5 h-3.5 shrink-0" />
                  <span>Encuadrar</span>
                </button>
              </div>

              <div className="my-1 border-t border-[#272b34]" />

              {/* Guías y Referencias */}
              <div className="px-2.5 pt-1 pb-0.5 text-[11px] font-semibold text-[#8e95a2]">
                Guías y escena
              </div>
              <div className="grid grid-cols-2 gap-1">
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={showGrid}
                  data-testid="viewport-toggle-grid"
                  onClick={onToggleGrid}
                  className={`min-h-[38px] px-2.5 rounded-lg border text-xs font-medium flex items-center justify-between gap-1.5 transition-colors ${
                    showGrid
                      ? 'bg-[#2c313b] border-[#5ecd6e]/65 text-[#5ecd6e]'
                      : 'bg-[#1e2128] hover:bg-[#272b35] border-transparent text-[#d1d5db]'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <Grid className="w-3.5 h-3.5 shrink-0" />
                    <span>Cuadrícula</span>
                  </span>
                  {showGrid && <Check className="w-3.5 h-3.5 shrink-0" />}
                </button>

                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={showAxes}
                  data-testid="viewport-toggle-axes"
                  onClick={onToggleAxes}
                  className={`min-h-[38px] px-2.5 rounded-lg border text-xs font-medium flex items-center justify-between gap-1.5 transition-colors ${
                    showAxes
                      ? 'bg-[#2c313b] border-[#5ecd6e]/65 text-[#5ecd6e]'
                      : 'bg-[#1e2128] hover:bg-[#272b35] border-transparent text-[#d1d5db]'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <Axis3d className="w-3.5 h-3.5 shrink-0" />
                    <span>Ejes X/Y/Z</span>
                  </span>
                  {showAxes && <Check className="w-3.5 h-3.5 shrink-0" />}
                </button>
              </div>

              <div className="my-1 border-t border-[#272b34]" />

              {/* Sombreado */}
              <div className="px-2.5 pt-1 pb-0.5 text-[11px] font-semibold text-[#8e95a2]">
                Sombreado y geometría
              </div>

              {DISPLAY_MODES.map((mode) => {
                const isActive = !mode.disabled && displayMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={isActive}
                    disabled={Boolean(mode.disabled)}
                    onClick={() => {
                      if (mode.disabled) return;
                      onSelectDisplayMode(mode.id);
                    }}
                    className={`w-full min-h-[38px] px-2.5 rounded-lg text-xs font-medium flex items-center justify-between gap-2 text-left transition-colors ${
                      mode.disabled
                        ? 'opacity-50 cursor-not-allowed text-[#7e8592]'
                        : isActive
                          ? 'bg-[#2c313b] border border-[#5ecd6e]/65 text-[#5ecd6e]'
                          : 'hover:bg-[#252932] text-[#e4e6eb] border border-transparent'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <ShadingModeIcon mode={mode.id} active={isActive} />
                      <span className="truncate">{mode.label}</span>
                    </span>
                    {mode.disabled ? (
                      <span className="flex items-center gap-1 text-[10px] text-[#8e95a2] shrink-0">
                        <Lock className="w-3 h-3" />
                        <span>Próximamente</span>
                      </span>
                    ) : isActive ? (
                      <Check className="w-4 h-4 text-[#5ecd6e] shrink-0" />
                    ) : null}
                  </button>
                );
              })}

              {displayMode === 'xray' && (
                <div className="mx-1 mt-1 p-2.5 rounded-lg bg-[#121418] border border-[#2d323d] space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="font-semibold text-[#e4e6eb]">
                      Transparencia X-Ray
                    </span>
                    <span className="font-mono-tabular font-semibold text-[#5ecd6e]">
                      {xrayTransparency}% · {getXrayDescriptor(xrayTransparency)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={90}
                    step={5}
                    value={xrayTransparency}
                    aria-label="Nivel de transparencia X-Ray"
                    onChange={(e) =>
                      onChangeXrayTransparency(parseInt(e.target.value, 10))
                    }
                    className="w-full h-5 accent-[#5ecd6e] cursor-pointer touch-pan-x"
                  />
                  <div className="grid grid-cols-5 gap-1">
                    {XRAY_PRESETS.map((preset) => {
                      const selected = xrayTransparency === preset.value;
                      return (
                        <button
                          key={preset.value}
                          type="button"
                          onClick={() => onChangeXrayTransparency(preset.value)}
                          className={`h-7 rounded text-[10px] font-mono-tabular font-semibold border transition-colors ${
                            selected
                              ? 'bg-[#2c313b] border-[#5ecd6e]/75 text-[#5ecd6e]'
                              : 'bg-[#181b21] border-[#292d37] text-[#9ca3af] hover:text-white'
                          }`}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={showFaceOrientation}
                onClick={onToggleFaceOrientation}
                className={`w-full min-h-[38px] px-2.5 rounded-lg text-xs font-medium flex items-center justify-between gap-2 text-left transition-colors ${
                  showFaceOrientation
                    ? 'bg-[#2c313b] border border-[#3b82f6]/65 text-[#93c5fd]'
                    : 'hover:bg-[#252932] text-[#e4e6eb] border border-transparent'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="inline-flex w-4 h-4 rounded-sm overflow-hidden border border-white/25 shrink-0"
                    aria-hidden="true"
                  >
                    <span className="w-1/2 h-full bg-[#2563eb]" />
                    <span className="w-1/2 h-full bg-[#e03131]" />
                  </span>
                  <span className="truncate">Face Orientation</span>
                </span>
                {showFaceOrientation && (
                  <Check className="w-4 h-4 text-[#60a5fa] shrink-0" />
                )}
              </button>

              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={showLiner}
                onClick={onToggleLiner}
                className={`w-full min-h-[38px] px-2.5 rounded-lg text-xs font-medium flex items-center justify-between gap-2 text-left transition-colors ${
                  showLiner
                    ? 'bg-[#2c313b] border border-[#5ecd6e]/65 text-[#5ecd6e]'
                    : 'hover:bg-[#252932] text-[#e4e6eb] border border-transparent'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <PanelRight className="w-4 h-4 shrink-0" />
                  <span className="truncate">LINER (Jerarquía y escena)</span>
                </span>
                {showLiner && (
                  <Check className="w-4 h-4 text-[#5ecd6e] shrink-0" />
                )}
              </button>
            </div>
          )}

          {/* C. SUITE: aplicaciones y herramientas de LOOPA */}
          {openMenu.key === 'suite' && (
            <div
              role="menu"
              aria-label="Menú Suite"
              data-testid="menu-suite"
              style={{ left: openMenu.left, top: openMenu.top }}
              onPointerDown={(e) => e.stopPropagation()}
              className="fixed w-[300px] max-h-[78vh] overflow-y-auto cad-scroll rounded-xl bg-[#181a1f] border border-[#343a47] shadow-2xl p-1.5 space-y-1"
            >
              <div className="px-2.5 pt-1 pb-1 text-[11px] font-semibold text-[#8e95a2]">
                Aplicaciones LOOPA
              </div>
              {LOOPA_APP_ORDER.map((appId) => {
                const app = LOOPA_APPS[appId];
                const isActive = activeAppId === appId;
                return (
                  <button
                    key={appId}
                    type="button"
                    role="menuitem"
                    aria-current={isActive ? 'page' : undefined}
                    data-testid={`suite-app-${appId}`}
                    onClick={() => {
                      setOpenMenu(null);
                      onOpenApp(appId);
                    }}
                    className={`w-full min-h-[46px] px-2.5 py-2 rounded-lg text-left flex items-center justify-between gap-2 transition-colors ${
                      isActive
                        ? 'bg-[#2c313b] border border-[#5ecd6e]/65 text-[#5ecd6e]'
                        : 'hover:bg-[#252932] border border-transparent text-[#e4e6eb]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <LoopaAppIcon appId={appId} className="w-4 h-4 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold truncate">{app.name}</div>
                        <div className="text-[10px] text-[#8e95a2] truncate">{app.tagline}</div>
                      </div>
                    </div>
                    {isActive && (
                      <Check className="w-4 h-4 text-[#5ecd6e] shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </>
  );
};
