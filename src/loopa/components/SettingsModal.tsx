import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Aperture,
  ArrowBigUpDash,
  Columns,
  Film,
  FlipHorizontal,
  Grid,
  Hand,
  Info,
  Maximize2,
  Minimize2,
  MousePointerClick,
  Move,
  Plus,
  RotateCcw,
  RotateCw,
  Scissors,
  ScissorsLineDashed,
  Sliders,
  Square,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import {
  ConfigurableToolKey,
  ExtrudeDefaultAxis,
  FloatingMenuCorner,
  FloatingMenuSize,
  ModelerSettings,
  MoveSubMode,
  ToolConfigurations,
  TouchControlSettings,
  TouchModifierKey,
  TouchModifierSlotConfig,
} from '../core/project/types';
import {
  clampProportionalRadius,
  PROPORTIONAL_FALLOFF_LIST,
  ProportionalEditingSettings,
} from '../core/mesh/proportionalEditing';
import {
  RADIAL_ACTION_MAP,
  RadialActionId,
  RadialLayoutScope,
} from '../core/radial/radialActions';
import { TOUCH_MODIFIER_REGISTRY } from '../engine/TouchGestureManager';
import {
  APP_DESCRIPTION,
  APP_NAME,
  APP_TAGLINE,
  APP_VERSION,
} from '../config/brand';
import type { ToolResetTarget } from '../state/useModelerStore';
import { formatTimelapseBytes } from '../core/timelapse/timelapseStorage';
import { LoopaFullLogo } from './BrandLogo';
import { ProportionalIcon } from './ProportionalIcons';
import { RadialActionIcon } from './RadialActionIcon';
import { RadialSlotEditorModal } from './RadialSlotEditorModal';
import type { SceneStatsInfo } from './TopBar';

export type SettingsTabId = 'touch' | 'viewer' | 'tools';

interface SettingsModalProps {
  settings: ModelerSettings;
  sceneStats?: SceneStatsInfo;
  initialTab?: SettingsTabId;
  timelapseProjectBytes?: number;
  timelapseTotalBytes?: number;
  timelapseStepCount?: number;
  onClearActiveTimelapse?: () => Promise<void>;
  onOpenTimelapse?: () => void;
  onUpdateSettings: (patch: Partial<ModelerSettings>) => void;
  onUpdateTouchSettings: (patch: Partial<TouchControlSettings>) => void;
  onUpdateTouchModifier: (
    key: TouchModifierKey,
    patch: Partial<TouchModifierSlotConfig>,
  ) => void;
  onUpdateRadialSlot: (
    mode: RadialLayoutScope,
    slotIndex: number,
    actionId: RadialActionId | null,
  ) => void;
  onResetRadialSlot: (mode: RadialLayoutScope, slotIndex: number) => void;
  onResetRadialLayout: (mode: RadialLayoutScope) => void;
  onResetTouchSettings: () => void;
  onUpdateToolConfig: <K extends ConfigurableToolKey>(
    toolKey: K,
    patch: Partial<ToolConfigurations[K]>,
  ) => void;
  onUpdateProportionalSettings: (
    patch: Partial<ProportionalEditingSettings>,
  ) => void;
  onResetToolConfig: (target: ToolResetTarget) => void;
  onResetAllToolConfigs: () => void;
  onClose: () => void;
}

const TOOL_CATALOG: {
  id: ToolResetTarget;
  label: string;
  subtitle: string;
  icon: React.ReactNode;
}[] = [
  {
    id: 'extrude',
    label: 'Extruir',
    subtitle: 'Distancia, dirección y caras individuales',
    icon: <FlipHorizontal className="w-4 h-4 text-[#5ecd6e]" />,
  },
  {
    id: 'bevel',
    label: 'Biselar',
    subtitle: 'Ancho, segmentos, perfil y solapamiento',
    icon: <Columns className="w-4 h-4 text-[#5ecd6e]" />,
  },
  {
    id: 'subdivide',
    label: 'Subdividir',
    subtitle: 'Cortes, suavizado y fractal',
    icon: <Grid className="w-4 h-4 text-[#5ecd6e]" />,
  },
  {
    id: 'inset',
    label: 'Insertar',
    subtitle: 'Grosor, profundidad e individual',
    icon: <Square className="w-4 h-4 text-[#5ecd6e]" />,
  },
  {
    id: 'loopCut',
    label: 'Corte Bucle',
    subtitle: 'Cortes iniciales y desplazamiento',
    icon: <Scissors className="w-4 h-4 text-[#38bdf8]" />,
  },
  {
    id: 'mergeByDistance',
    label: 'Fusionar por dist.',
    subtitle: 'Umbral de distancia predeterminado',
    icon: <Minimize2 className="w-4 h-4 text-[#5ecd6e]" />,
  },
  {
    id: 'dissolveLimited',
    label: 'Limitar disolución',
    subtitle: 'Ángulo límite y disolución de vértices',
    icon: <ScissorsLineDashed className="w-4 h-4 text-[#38bdf8]" />,
  },
  {
    id: 'move',
    label: 'Mover',
    subtitle: 'Modo inicial y paso de snap',
    icon: <Move className="w-4 h-4 text-[#5ecd6e]" />,
  },
  {
    id: 'rotate',
    label: 'Rotar',
    subtitle: 'Ángulo de snap incremental',
    icon: <RotateCw className="w-4 h-4 text-[#5ecd6e]" />,
  },
  {
    id: 'scale',
    label: 'Escalar',
    subtitle: 'Incremento de snap al escalar',
    icon: <Maximize2 className="w-4 h-4 text-[#5ecd6e]" />,
  },
  {
    id: 'proportional',
    label: 'Ed. proporcional',
    subtitle: 'Estado, conectados, curva y radio',
    icon: <ProportionalIcon className="w-4 h-4 text-[#5ecd6e]" />,
  },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  sceneStats,
  initialTab = 'touch',
  timelapseProjectBytes = 0,
  timelapseTotalBytes = 0,
  timelapseStepCount = 0,
  onClearActiveTimelapse,
  onOpenTimelapse,
  onUpdateSettings,
  onUpdateTouchSettings,
  onUpdateTouchModifier,
  onUpdateRadialSlot,
  onResetRadialSlot,
  onResetRadialLayout,
  onResetTouchSettings,
  onUpdateToolConfig,
  onUpdateProportionalSettings,
  onResetToolConfig,
  onResetAllToolConfigs,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTabId>(initialTab);
  const [selectedToolId, setSelectedToolId] =
    useState<ToolResetTarget>('extrude');
  const [radialEditorMode, setRadialEditorMode] =
    useState<RadialLayoutScope>('barhome');
  const [editingSlotIndex, setEditingSlotIndex] = useState<number | null>(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const renderSwitch = (
    active: boolean,
    onToggle: () => void,
    label: string,
    disabled = false,
  ) => (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={`w-12 h-7 rounded-full p-0.5 transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
        active ? 'bg-[#49b459]' : 'bg-[#2c3038]'
      }`}
    >
      <div
        className={`w-6 h-6 rounded-full bg-white transition-transform ${
          active ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );

  const gestureToggles: {
    key: keyof Pick<
      TouchControlSettings,
      | 'oneFingerOrbit'
      | 'oneFingerTapSelect'
      | 'doubleTapBoxSelect'
      | 'twoFingerPinchZoom'
      | 'twoFingerPan'
      | 'twoFingerUndo'
      | 'threeFingerRedo'
      | 'longPressContextMenu'
    >;
    badge: string;
    label: string;
    desc: string;
  }[] = [
    {
      key: 'oneFingerOrbit',
      badge: '1 dedo',
      label: 'Orbitar cámara',
      desc: 'Arrastrar con un dedo en el visor 3D',
    },
    {
      key: 'oneFingerTapSelect',
      badge: '1 toque',
      label: 'Seleccionar elemento',
      desc: 'Tocar objetos, vértices, aristas o caras',
    },
    {
      key: 'doubleTapBoxSelect',
      badge: '2 toques',
      label: 'Selección rectangular',
      desc: 'Doble toque rápido y arrastrar para seleccionar con caja',
    },
    {
      key: 'twoFingerPinchZoom',
      badge: '2 dedos',
      label: 'Zoom con pellizco',
      desc: 'Acercar y alejar la cámara al pellizcar',
    },
    {
      key: 'twoFingerPan',
      badge: '2 dedos',
      label: 'Desplazar cámara (Pan)',
      desc: 'Arrastrar con dos dedos para mover la vista',
    },
    {
      key: 'twoFingerUndo',
      badge: '2 toques',
      label: 'Deshacer (Undo)',
      desc: 'Toque simultáneo con dos dedos',
    },
    {
      key: 'threeFingerRedo',
      badge: '3 toques',
      label: 'Rehacer (Redo)',
      desc: 'Toque simultáneo con tres dedos',
    },
    {
      key: 'longPressContextMenu',
      badge: 'Mantener',
      label: 'Menú contextual',
      desc: 'Mantener presionado sobre objeto o componente',
    },
  ];

  const corners: { id: FloatingMenuCorner; label: string }[] = [
    { id: 'top-left', label: 'Sup. Izq.' },
    { id: 'top-right', label: 'Sup. Der.' },
    { id: 'bottom-left', label: 'Inf. Izq.' },
    { id: 'bottom-right', label: 'Inf. Der.' },
  ];

  const sizes: { id: FloatingMenuSize; label: string }[] = [
    { id: 'small', label: 'Pequeño' },
    { id: 'medium', label: 'Mediano' },
    { id: 'large', label: 'Grande' },
  ];

  const radialModes: { id: RadialLayoutScope; label: string }[] = [
    { id: 'barhome', label: 'BARHOME' },
    { id: 'object', label: 'Herr. Objeto' },
    { id: 'edit', label: 'Herr. Edición' },
    { id: 'uv_editing', label: 'Herr. Editor UV' },
    { id: 'materials', label: 'Herr. Materiales' },
    { id: 'sculpt', label: 'Escultura (futuro)' },
  ];

  const currentModeSlots =
    radialEditorMode === 'barhome'
      ? settings.touch.barhomeRadialLayout
      : radialEditorMode === 'uv_editing'
        ? settings.touch.workspaceToolRadialLayouts.uv_editing
        : radialEditorMode === 'materials'
          ? settings.touch.workspaceToolRadialLayouts.materials
          : settings.touch.radialLayouts[radialEditorMode];
  const selectedToolMeta =
    TOOL_CATALOG.find((t) => t.id === selectedToolId) ?? TOOL_CATALOG[0];

  return (
    <div
      data-testid="settings-modal"
      className="fixed inset-0 z-50 pointer-events-auto bg-black/65 flex items-center justify-center p-4 touch-manipulation"
    >
      <div className="w-full max-w-2xl max-h-[90vh] bg-[#1c1e24] border border-[#323640] rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="px-4 py-3 border-b border-[#2b2e36] flex items-center justify-between shrink-0">
          <h2 className="text-sm font-semibold text-[#f3f4f6]">
            Configuración de {APP_NAME}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-md hover:bg-[#2a2e38] text-[#9ca3af] hover:text-white flex items-center justify-center"
            aria-label="Cerrar configuración"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Section Tabs */}
        <div className="px-4 pt-3 shrink-0">
          <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-[#13151a] border border-[#2b2e36]">
            <button
              type="button"
              data-testid="settings-tab-tools"
              onClick={() => setActiveTab('tools')}
              className={`h-9 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
                activeTab === 'tools'
                  ? 'bg-[#2c313b] text-[#5ecd6e]'
                  : 'text-[#9ca3af] hover:text-white'
              }`}
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>Herramientas</span>
            </button>
            <button
              type="button"
              data-testid="settings-tab-touch"
              onClick={() => setActiveTab('touch')}
              className={`h-9 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
                activeTab === 'touch'
                  ? 'bg-[#2c313b] text-[#5ecd6e]'
                  : 'text-[#9ca3af] hover:text-white'
              }`}
            >
              <Hand className="w-3.5 h-3.5" />
              <span>Controles táctiles</span>
            </button>
            <button
              type="button"
              data-testid="settings-tab-viewer"
              onClick={() => setActiveTab('viewer')}
              className={`h-9 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
                activeTab === 'viewer'
                  ? 'bg-[#2c313b] text-[#5ecd6e]'
                  : 'text-[#9ca3af] hover:text-white'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Visor y Precisión</span>
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="min-h-0 flex-1 p-4 overflow-y-auto cad-scroll space-y-4 touch-pan-y overscroll-contain">
          {activeTab === 'tools' ? (
            <div
              data-testid="tool-settings-section"
              className="flex flex-col sm:flex-row gap-3"
            >
              {/* Master List: Tool Selector */}
              <div className="sm:w-48 shrink-0 flex sm:flex-col gap-1 overflow-x-auto sm:overflow-visible pb-1 sm:pb-0 cad-scroll">
                {TOOL_CATALOG.map((tool) => {
                  const active = selectedToolId === tool.id;
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      data-testid={`tool-config-item-${tool.id}`}
                      onClick={() => setSelectedToolId(tool.id)}
                      className={`min-h-[40px] px-2.5 py-2 rounded-lg border text-left flex items-center gap-2 shrink-0 transition-colors whitespace-nowrap sm:whitespace-normal ${
                        active
                          ? 'bg-[#2a2f3a] border-[#5ecd6e]/75 text-[#f3f4f6]'
                          : 'bg-[#15171c] hover:bg-[#1f222a] border-[#292d38] text-[#b4bac4]'
                      }`}
                    >
                      <span className="shrink-0">{tool.icon}</span>
                      <span className="text-xs font-semibold leading-tight">
                        {tool.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Detail Panel: Selected Tool Configuration Only */}
              <div className="flex-1 min-w-0 rounded-lg bg-[#15171c] border border-[#2b2e36] p-3.5 flex flex-col justify-between gap-4">
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-[#262a33]">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-8 h-8 rounded-md bg-[#1f222a] border border-[#303542] flex items-center justify-center shrink-0">
                        {selectedToolMeta.icon}
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-[#f3f4f6]">
                          {selectedToolMeta.label}
                        </h3>
                        <p className="text-[11px] text-[#8e95a2]">
                          {selectedToolMeta.subtitle}
                        </p>
                      </div>
                    </div>
                  </div>

                  {selectedToolId === 'extrude' && (
                    <div className="space-y-3">
                      <label className="block space-y-1">
                        <span className="text-xs font-medium text-[#eceef2]">
                          Distancia predeterminada
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          data-testid="config-extrude-distance"
                          value={settings.toolConfigs.extrude.defaultDistance}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (Number.isFinite(v)) {
                              onUpdateToolConfig('extrude', {
                                defaultDistance: v,
                              });
                            }
                          }}
                          className="w-full h-10 px-2.5 rounded-md bg-[#111317] border border-[#2f333d] text-xs font-mono-tabular text-[#f3f4f6] focus:outline-none focus:border-[#5ecd6e]"
                        />
                        <span className="block text-[10px] text-[#8e95a2]">
                          Acepta valores positivos o negativos sin límite artificial (por defecto: 0.01).
                        </span>
                      </label>

                      <div className="space-y-1.5">
                        <span className="block text-xs font-medium text-[#eceef2]">
                          Dirección predeterminada
                        </span>
                        <div className="grid grid-cols-4 gap-1.5">
                          {(
                            [
                              { id: 'normal', label: 'Normal' },
                              { id: 'x', label: 'X' },
                              { id: 'y', label: 'Y' },
                              { id: 'z', label: 'Z' },
                            ] as { id: ExtrudeDefaultAxis; label: string }[]
                          ).map((ax) => (
                            <button
                              key={ax.id}
                              type="button"
                              onClick={() =>
                                onUpdateToolConfig('extrude', {
                                  defaultAxis: ax.id,
                                })
                              }
                              className={`h-9 rounded-md border text-xs font-semibold transition-colors ${
                                settings.toolConfigs.extrude.defaultAxis === ax.id
                                  ? 'bg-[#2c313b] border-[#5ecd6e] text-[#5ecd6e]'
                                  : 'bg-[#1c1f26] border-[#2e333e] text-[#b4bac4] hover:text-white'
                              }`}
                            >
                              {ax.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3 pt-1">
                        <div>
                          <div className="text-xs font-medium text-[#eceef2]">
                            Caras individuales por defecto
                          </div>
                          <div className="text-[11px] text-[#8e95a2]">
                            Extruye cada cara seleccionada de forma independiente
                          </div>
                        </div>
                        {renderSwitch(
                          settings.toolConfigs.extrude.defaultIndividual,
                          () =>
                            onUpdateToolConfig('extrude', {
                              defaultIndividual:
                                !settings.toolConfigs.extrude.defaultIndividual,
                            }),
                          'Caras individuales en Extruir',
                        )}
                      </div>
                    </div>
                  )}

                  {selectedToolId === 'bevel' && (
                    <div className="space-y-3">
                      <label className="block space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-[#eceef2]">
                            Ancho predeterminado
                          </span>
                          <span className="font-mono-tabular text-[#5ecd6e]">
                            {settings.toolConfigs.bevel.defaultWidth.toFixed(2)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0.02}
                          max={1.5}
                          step={0.02}
                          value={settings.toolConfigs.bevel.defaultWidth}
                          onChange={(e) =>
                            onUpdateToolConfig('bevel', {
                              defaultWidth: parseFloat(e.target.value),
                            })
                          }
                          className="w-full accent-[#5ecd6e] cursor-pointer"
                        />
                      </label>

                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-medium text-[#eceef2]">
                          Segmentos
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateToolConfig('bevel', {
                                defaultSegments: Math.max(
                                  1,
                                  settings.toolConfigs.bevel.defaultSegments - 1,
                                ),
                              })
                            }
                            className="w-9 h-9 rounded-md bg-[#22252e] hover:bg-[#2c313b] border border-[#343947] text-sm font-bold text-[#e4e6eb]"
                          >
                            −
                          </button>
                          <span className="w-8 text-center text-xs font-mono-tabular font-semibold text-[#f3f4f6]">
                            {settings.toolConfigs.bevel.defaultSegments}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateToolConfig('bevel', {
                                defaultSegments: Math.min(
                                  5,
                                  settings.toolConfigs.bevel.defaultSegments + 1,
                                ),
                              })
                            }
                            className="w-9 h-9 rounded-md bg-[#22252e] hover:bg-[#2c313b] border border-[#343947] text-sm font-bold text-[#e4e6eb]"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <label className="block space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-[#eceef2]">
                            Perfil predeterminado
                          </span>
                          <span className="font-mono-tabular text-[#5ecd6e]">
                            {settings.toolConfigs.bevel.defaultProfile.toFixed(2)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0.1}
                          max={1}
                          step={0.05}
                          value={settings.toolConfigs.bevel.defaultProfile}
                          onChange={(e) =>
                            onUpdateToolConfig('bevel', {
                              defaultProfile: parseFloat(e.target.value),
                            })
                          }
                          className="w-full accent-[#5ecd6e] cursor-pointer"
                        />
                      </label>

                      <div className="flex items-center justify-between gap-3 pt-1">
                        <div>
                          <div className="text-xs font-medium text-[#eceef2]">
                            Limitar solapamiento
                          </div>
                          <div className="text-[11px] text-[#8e95a2]">
                            Evita que el bisel cruce caras vecinas
                          </div>
                        </div>
                        {renderSwitch(
                          settings.toolConfigs.bevel.defaultClampOverlap,
                          () =>
                            onUpdateToolConfig('bevel', {
                              defaultClampOverlap:
                                !settings.toolConfigs.bevel.defaultClampOverlap,
                            }),
                          'Limitar solapamiento en Biselar',
                        )}
                      </div>
                    </div>
                  )}

                  {selectedToolId === 'subdivide' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-medium text-[#eceef2]">
                          Cortes predeterminados
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateToolConfig('subdivide', {
                                defaultCuts: Math.max(
                                  1,
                                  settings.toolConfigs.subdivide.defaultCuts - 1,
                                ),
                              })
                            }
                            className="w-9 h-9 rounded-md bg-[#22252e] hover:bg-[#2c313b] border border-[#343947] text-sm font-bold text-[#e4e6eb]"
                          >
                            −
                          </button>
                          <span className="w-8 text-center text-xs font-mono-tabular font-semibold text-[#f3f4f6]">
                            {settings.toolConfigs.subdivide.defaultCuts}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateToolConfig('subdivide', {
                                defaultCuts: Math.min(
                                  6,
                                  settings.toolConfigs.subdivide.defaultCuts + 1,
                                ),
                              })
                            }
                            className="w-9 h-9 rounded-md bg-[#22252e] hover:bg-[#2c313b] border border-[#343947] text-sm font-bold text-[#e4e6eb]"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <label className="block space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-[#eceef2]">
                            Suavizado predeterminado
                          </span>
                          <span className="font-mono-tabular text-[#5ecd6e]">
                            {settings.toolConfigs.subdivide.defaultSmoothness.toFixed(
                              2,
                            )}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={settings.toolConfigs.subdivide.defaultSmoothness}
                          onChange={(e) =>
                            onUpdateToolConfig('subdivide', {
                              defaultSmoothness: parseFloat(e.target.value),
                            })
                          }
                          className="w-full accent-[#5ecd6e] cursor-pointer"
                        />
                      </label>

                      <label className="block space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-[#eceef2]">
                            Fractal predeterminado
                          </span>
                          <span className="font-mono-tabular text-[#5ecd6e]">
                            {settings.toolConfigs.subdivide.defaultFractal.toFixed(
                              2,
                            )}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={0.5}
                          step={0.02}
                          value={settings.toolConfigs.subdivide.defaultFractal}
                          onChange={(e) =>
                            onUpdateToolConfig('subdivide', {
                              defaultFractal: parseFloat(e.target.value),
                            })
                          }
                          className="w-full accent-[#5ecd6e] cursor-pointer"
                        />
                      </label>
                    </div>
                  )}

                  {selectedToolId === 'inset' && (
                    <div className="space-y-3">
                      <label className="block space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-[#eceef2]">
                            Grosor predeterminado
                          </span>
                          <span className="font-mono-tabular text-[#5ecd6e]">
                            {settings.toolConfigs.inset.defaultThickness.toFixed(
                              2,
                            )}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0.02}
                          max={0.9}
                          step={0.02}
                          value={settings.toolConfigs.inset.defaultThickness}
                          onChange={(e) =>
                            onUpdateToolConfig('inset', {
                              defaultThickness: parseFloat(e.target.value),
                            })
                          }
                          className="w-full accent-[#5ecd6e] cursor-pointer"
                        />
                      </label>

                      <label className="block space-y-1">
                        <span className="text-xs font-medium text-[#eceef2]">
                          Profundidad predeterminada
                        </span>
                        <input
                          type="number"
                          step="0.05"
                          value={settings.toolConfigs.inset.defaultDepth}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (Number.isFinite(v)) {
                              onUpdateToolConfig('inset', { defaultDepth: v });
                            }
                          }}
                          className="w-full h-10 px-2.5 rounded-md bg-[#111317] border border-[#2f333d] text-xs font-mono-tabular text-[#f3f4f6] focus:outline-none focus:border-[#5ecd6e]"
                        />
                      </label>

                      <div className="flex items-center justify-between gap-3 pt-1">
                        <div>
                          <div className="text-xs font-medium text-[#eceef2]">
                            Caras individuales por defecto
                          </div>
                          <div className="text-[11px] text-[#8e95a2]">
                            Inserta cada cara por separado en lugar de la región
                          </div>
                        </div>
                        {renderSwitch(
                          settings.toolConfigs.inset.defaultIndividual,
                          () =>
                            onUpdateToolConfig('inset', {
                              defaultIndividual:
                                !settings.toolConfigs.inset.defaultIndividual,
                            }),
                          'Individual en Insertar',
                        )}
                      </div>
                    </div>
                  )}

                  {selectedToolId === 'loopCut' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-medium text-[#eceef2]">
                          Cortes predeterminados
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateToolConfig('loopCut', {
                                defaultCuts: Math.max(
                                  1,
                                  settings.toolConfigs.loopCut.defaultCuts - 1,
                                ),
                              })
                            }
                            className="w-9 h-9 rounded-md bg-[#22252e] hover:bg-[#2c313b] border border-[#343947] text-sm font-bold text-[#e4e6eb]"
                          >
                            −
                          </button>
                          <span className="w-8 text-center text-xs font-mono-tabular font-semibold text-[#f3f4f6]">
                            {settings.toolConfigs.loopCut.defaultCuts}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateToolConfig('loopCut', {
                                defaultCuts: Math.min(
                                  24,
                                  settings.toolConfigs.loopCut.defaultCuts + 1,
                                ),
                              })
                            }
                            className="w-9 h-9 rounded-md bg-[#22252e] hover:bg-[#2c313b] border border-[#343947] text-sm font-bold text-[#e4e6eb]"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <label className="block space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-[#eceef2]">
                            Desplazamiento inicial (Slide)
                          </span>
                          <span className="font-mono-tabular text-[#38bdf8]">
                            {settings.toolConfigs.loopCut.defaultSlide.toFixed(
                              2,
                            )}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={-1}
                          max={1}
                          step={0.05}
                          value={settings.toolConfigs.loopCut.defaultSlide}
                          onChange={(e) =>
                            onUpdateToolConfig('loopCut', {
                              defaultSlide: parseFloat(e.target.value),
                            })
                          }
                          className="w-full accent-[#38bdf8] cursor-pointer"
                        />
                      </label>
                    </div>
                  )}

                  {selectedToolId === 'mergeByDistance' && (
                    <div className="space-y-3">
                      <label className="block space-y-1">
                        <span className="text-xs font-medium text-[#eceef2]">
                          Umbral de distancia predeterminado
                        </span>
                        <input
                          type="number"
                          min={0.0001}
                          step={0.001}
                          value={
                            settings.toolConfigs.mergeByDistance.defaultDistance
                          }
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (Number.isFinite(v) && v >= 0.0001) {
                              onUpdateToolConfig('mergeByDistance', {
                                defaultDistance: v,
                              });
                            }
                          }}
                          className="w-full h-10 px-2.5 rounded-md bg-[#111317] border border-[#2f333d] text-xs font-mono-tabular text-[#f3f4f6] focus:outline-none focus:border-[#5ecd6e]"
                        />
                        <span className="block text-[10px] text-[#8e95a2]">
                          Une automáticamente vértices separados por una distancia menor o igual a este valor.
                        </span>
                      </label>
                    </div>
                  )}

                  {selectedToolId === 'dissolveLimited' && (
                    <div className="space-y-3">
                      <label className="block space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-[#eceef2]">
                            Ángulo máximo predeterminado
                          </span>
                          <span className="font-mono-tabular text-[#38bdf8]">
                            {settings.toolConfigs.dissolveLimited.defaultMaxAngleDeg.toFixed(
                              1,
                            )}
                            °
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0.5}
                          max={90}
                          step={0.5}
                          value={
                            settings.toolConfigs.dissolveLimited
                              .defaultMaxAngleDeg
                          }
                          onChange={(e) =>
                            onUpdateToolConfig('dissolveLimited', {
                              defaultMaxAngleDeg: parseFloat(e.target.value),
                            })
                          }
                          className="w-full accent-[#38bdf8] cursor-pointer"
                        />
                      </label>

                      <div className="flex items-center justify-between gap-3 pt-1">
                        <div>
                          <div className="text-xs font-medium text-[#eceef2]">
                            Disolver vértices colineales
                          </div>
                          <div className="text-[11px] text-[#8e95a2]">
                            Limpia vértices sobrantes en bordes rectos
                          </div>
                        </div>
                        {renderSwitch(
                          settings.toolConfigs.dissolveLimited
                            .defaultDissolveVertices,
                          () =>
                            onUpdateToolConfig('dissolveLimited', {
                              defaultDissolveVertices:
                                !settings.toolConfigs.dissolveLimited
                                  .defaultDissolveVertices,
                            }),
                          'Disolver vértices en Limitar disolución',
                        )}
                      </div>
                    </div>
                  )}

                  {selectedToolId === 'move' && (
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <span className="block text-xs font-medium text-[#eceef2]">
                          Modalidad inicial al seleccionar Mover
                        </span>
                        <div className="grid grid-cols-3 gap-1.5">
                          {(
                            [
                              { id: 'free', label: 'Free' },
                              { id: 'axis', label: 'Axis' },
                              { id: 'slide', label: 'Slide' },
                            ] as { id: MoveSubMode; label: string }[]
                          ).map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() =>
                                onUpdateToolConfig('move', {
                                  defaultSubMode: m.id,
                                })
                              }
                              className={`h-9 rounded-md border text-xs font-semibold transition-colors ${
                                settings.toolConfigs.move.defaultSubMode === m.id
                                  ? 'bg-[#2c313b] border-[#5ecd6e] text-[#5ecd6e]'
                                  : 'bg-[#1c1f26] border-[#2e333e] text-[#b4bac4] hover:text-white'
                              }`}
                            >
                              {m.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3 pt-1">
                        <div>
                          <div className="text-xs font-medium text-[#eceef2]">
                            Ajuste incremental (Snap)
                          </div>
                          <div className="text-[11px] text-[#8e95a2]">
                            Activa pasos discretos al arrastrar el gizmo
                          </div>
                        </div>
                        {renderSwitch(
                          settings.snapEnabled,
                          () =>
                            onUpdateSettings({
                              snapEnabled: !settings.snapEnabled,
                            }),
                          'Snap al mover',
                        )}
                      </div>

                      <label className="block space-y-1">
                        <span className="text-xs font-medium text-[#eceef2]">
                          Paso de desplazamiento (Snap)
                        </span>
                        <input
                          type="number"
                          min={0.01}
                          step={0.05}
                          value={settings.snapTranslateStep}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (Number.isFinite(v) && v > 0) {
                              onUpdateSettings({ snapTranslateStep: v });
                            }
                          }}
                          className="w-full h-10 px-2.5 rounded-md bg-[#111317] border border-[#2f333d] text-xs font-mono-tabular text-[#f3f4f6] focus:outline-none focus:border-[#5ecd6e]"
                        />
                      </label>
                    </div>
                  )}

                  {selectedToolId === 'rotate' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-xs font-medium text-[#eceef2]">
                            Ajuste incremental (Snap)
                          </div>
                          <div className="text-[11px] text-[#8e95a2]">
                            Restringe la rotación del gizmo por ángulos exactos
                          </div>
                        </div>
                        {renderSwitch(
                          settings.snapEnabled,
                          () =>
                            onUpdateSettings({
                              snapEnabled: !settings.snapEnabled,
                            }),
                          'Snap al rotar',
                        )}
                      </div>

                      <label className="block space-y-1">
                        <span className="text-xs font-medium text-[#eceef2]">
                          Ángulo de paso (°)
                        </span>
                        <input
                          type="number"
                          min={1}
                          step={5}
                          value={settings.snapRotateDeg}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (Number.isFinite(v) && v > 0) {
                              onUpdateSettings({ snapRotateDeg: v });
                            }
                          }}
                          className="w-full h-10 px-2.5 rounded-md bg-[#111317] border border-[#2f333d] text-xs font-mono-tabular text-[#f3f4f6] focus:outline-none focus:border-[#5ecd6e]"
                        />
                      </label>
                    </div>
                  )}

                  {selectedToolId === 'scale' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-xs font-medium text-[#eceef2]">
                            Ajuste incremental (Snap)
                          </div>
                          <div className="text-[11px] text-[#8e95a2]">
                            Escala en múltiplos fijos con el manipulador
                          </div>
                        </div>
                        {renderSwitch(
                          settings.snapEnabled,
                          () =>
                            onUpdateSettings({
                              snapEnabled: !settings.snapEnabled,
                            }),
                          'Snap al escalar',
                        )}
                      </div>

                      <label className="block space-y-1">
                        <span className="text-xs font-medium text-[#eceef2]">
                          Paso de escala (Snap)
                        </span>
                        <input
                          type="number"
                          min={0.01}
                          step={0.05}
                          value={settings.snapScaleStep}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (Number.isFinite(v) && v > 0) {
                              onUpdateSettings({ snapScaleStep: v });
                            }
                          }}
                          className="w-full h-10 px-2.5 rounded-md bg-[#111317] border border-[#2f333d] text-xs font-mono-tabular text-[#f3f4f6] focus:outline-none focus:border-[#5ecd6e]"
                        />
                      </label>
                    </div>
                  )}

                  {selectedToolId === 'proportional' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-xs font-medium text-[#eceef2]">
                            Edición proporcional activa
                          </div>
                          <div className="text-[11px] text-[#8e95a2]">
                            Deforma suavemente los vértices cercanos al arrastrar
                          </div>
                        </div>
                        {renderSwitch(
                          settings.proportionalEditing.enabled,
                          () =>
                            onUpdateProportionalSettings({
                              enabled: !settings.proportionalEditing.enabled,
                            }),
                          'Edición proporcional activa',
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-xs font-medium text-[#eceef2]">
                            Solo vértices conectados
                          </div>
                          <div className="text-[11px] text-[#8e95a2]">
                            Usa distancia topológica sobre aristas conectadas
                          </div>
                        </div>
                        {renderSwitch(
                          settings.proportionalEditing.connectedOnly,
                          () =>
                            onUpdateProportionalSettings({
                              connectedOnly:
                                !settings.proportionalEditing.connectedOnly,
                            }),
                          'Solo conectados',
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <span className="block text-xs font-medium text-[#eceef2]">
                          Curva de caída
                        </span>
                        <div className="grid grid-cols-2 gap-1.5">
                          {PROPORTIONAL_FALLOFF_LIST.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() =>
                                onUpdateProportionalSettings({
                                  falloff: item.id,
                                })
                              }
                              className={`h-9 px-2 rounded-md border text-xs font-semibold text-left transition-colors ${
                                settings.proportionalEditing.falloff === item.id
                                  ? 'bg-[#2c313b] border-[#5ecd6e] text-[#5ecd6e]'
                                  : 'bg-[#1c1f26] border-[#2e333e] text-[#b4bac4] hover:text-white'
                              }`}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <label className="block space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-[#eceef2]">
                            Radio de influencia
                          </span>
                          <span className="font-mono-tabular text-[#5ecd6e]">
                            {settings.proportionalEditing.radius.toFixed(2)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0.05}
                          max={6}
                          step={0.05}
                          value={Math.min(
                            6,
                            settings.proportionalEditing.radius,
                          )}
                          onChange={(e) =>
                            onUpdateProportionalSettings({
                              radius: clampProportionalRadius(
                                parseFloat(e.target.value),
                              ),
                            })
                          }
                          className="w-full accent-[#5ecd6e] cursor-pointer"
                        />
                      </label>
                    </div>
                  )}
                </div>

                {/* Per-tool & Global Reset Actions */}
                <div className="pt-3 border-t border-[#262a33] flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    data-testid="reset-single-tool-config"
                    onClick={() => onResetToolConfig(selectedToolId)}
                    className="h-9 px-3 rounded-md bg-[#22252e] hover:bg-[#2c313b] border border-[#353a46] text-xs font-semibold text-[#e5e7eb] flex items-center gap-1.5 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-[#5ecd6e]" />
                    <span>Restaurar herramienta</span>
                  </button>
                  <button
                    type="button"
                    data-testid="reset-all-tools-config"
                    onClick={onResetAllToolConfigs}
                    className="h-9 px-3 rounded-md bg-[#271b1e] hover:bg-[#362227] border border-[#4d2d33] text-xs font-semibold text-[#fca5a5] flex items-center gap-1.5 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Restaurar todas</span>
                  </button>
                </div>
              </div>
            </div>
          ) : activeTab === 'viewer' ? (
            <>
              {(
                [
                  {
                    key: 'showGrid',
                    label: 'Mostrar cuadrícula 3D',
                    desc: 'Plano de referencia en el origen',
                  },
                  {
                    key: 'showAxes',
                    label: 'Mostrar ejes X, Y, Z',
                    desc: 'Líneas de coordenadas rojo, verde y azul',
                  },
                  {
                    key: 'xrayEditMode',
                    label: 'Modo Rayos X (X-Ray)',
                    desc: 'Vista translúcida que permite seleccionar vértices y aristas posteriores',
                  },
                  {
                    key: 'multiSelectTouch',
                    label: 'Selección múltiple por toque',
                    desc: 'Acumula componentes seleccionados sin tecla Shift',
                  },
                  {
                    key: 'snapEnabled',
                    label: 'Ajuste incremental (Snap)',
                    desc: 'Limita las transformaciones a pasos discretos',
                  },
                ] as const
              ).map((item) => {
                const active =
                  item.key === 'xrayEditMode'
                    ? settings.displayMode === 'xray'
                    : settings[item.key];
                return (
                  <div
                    key={item.key}
                    className="flex items-center justify-between gap-3 py-1"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-[#eceef2]">
                        {item.label}
                      </div>
                      <div className="text-[11px] text-[#8e95a2]">
                        {item.desc}
                      </div>
                    </div>
                    {renderSwitch(
                      active,
                      () => onUpdateSettings({ [item.key]: !active }),
                      item.label,
                    )}
                  </div>
                );
              })}

              <div className="h-px bg-[#2b2e36]" />

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-[#eceef2]">
                    Tamaño del manipulador 3D
                  </span>
                  <span className="font-mono-tabular text-[#5ecd6e]">
                    {settings.gizmoSize.toFixed(2)}x
                  </span>
                </div>
                <input
                  type="range"
                  min="0.8"
                  max="1.8"
                  step="0.05"
                  value={settings.gizmoSize}
                  onChange={(e) =>
                    onUpdateSettings({ gizmoSize: parseFloat(e.target.value) })
                  }
                  className="w-full accent-[#5ecd6e] h-2 cursor-pointer"
                />
              </div>

              {settings.snapEnabled && (
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <label className="space-y-1">
                    <span className="block text-[11px] text-[#9ca3af]">
                      Paso Mover
                    </span>
                    <input
                      type="number"
                      step="0.05"
                      min="0.05"
                      value={settings.snapTranslateStep}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (!Number.isNaN(v) && v > 0) {
                          onUpdateSettings({ snapTranslateStep: v });
                        }
                      }}
                      className="w-full h-9 px-2 rounded bg-[#111317] border border-[#2f333d] text-xs font-mono-tabular text-[#e4e6eb] outline-none"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="block text-[11px] text-[#9ca3af]">
                      Ángulo (°)
                    </span>
                    <input
                      type="number"
                      step="5"
                      min="1"
                      value={settings.snapRotateDeg}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (!Number.isNaN(v) && v > 0) {
                          onUpdateSettings({ snapRotateDeg: v });
                        }
                      }}
                      className="w-full h-9 px-2 rounded bg-[#111317] border border-[#2f333d] text-xs font-mono-tabular text-[#e4e6eb] outline-none"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="block text-[11px] text-[#9ca3af]">
                      Paso Escala
                    </span>
                    <input
                      type="number"
                      step="0.05"
                      min="0.05"
                      value={settings.snapScaleStep}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (!Number.isNaN(v) && v > 0) {
                          onUpdateSettings({ snapScaleStep: v });
                        }
                      }}
                      className="w-full h-9 px-2 rounded bg-[#111317] border border-[#2f333d] text-xs font-mono-tabular text-[#e4e6eb] outline-none"
                    />
                  </label>
                </div>
              )}

              <div className="h-px bg-[#2b2e36]" />

              <div className="rounded-lg bg-[#15171c] border border-[#2b2e36] p-3 space-y-3">
                <div className="text-xs font-semibold text-[#eceef2]">
                  Guardado automático y recuperación
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-[#eceef2]">
                      Guardado automático
                    </div>
                    <div className="text-[11px] text-[#8e95a2]">
                      Guarda cambios y actualiza la miniatura automáticamente
                    </div>
                  </div>
                  {renderSwitch(
                    settings.autosaveEnabled,
                    () =>
                      onUpdateSettings({
                        autosaveEnabled: !settings.autosaveEnabled,
                      }),
                    'Activar guardado automático',
                  )}
                </div>

                {settings.autosaveEnabled && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-[#cbd5e1]">
                      Intervalo de autoguardado
                    </span>
                    <select
                      value={settings.autosaveIntervalSec}
                      onChange={(e) =>
                        onUpdateSettings({
                          autosaveIntervalSec: Number(e.target.value),
                        })
                      }
                      className="h-9 px-2.5 rounded-md bg-[#111317] border border-[#2f333d] text-xs font-mono-tabular text-[#f3f4f6] outline-none"
                    >
                      <option value={15}>Cada 15 s</option>
                      <option value={30}>Cada 30 s</option>
                      <option value={60}>Cada 1 min</option>
                      <option value={120}>Cada 2 min</option>
                      <option value={300}>Cada 5 min</option>
                    </select>
                  </div>
                )}

                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-[#eceef2]">
                      Copia de seguridad previa
                    </div>
                    <div className="text-[11px] text-[#8e95a2]">
                      Conserva un respaldo antes de cada sobrescritura manual
                    </div>
                  </div>
                  {renderSwitch(
                    settings.createRecoveryBackups,
                    () =>
                      onUpdateSettings({
                        createRecoveryBackups: !settings.createRecoveryBackups,
                      }),
                    'Copia de seguridad previa',
                  )}
                </div>
              </div>

              <div className="rounded-lg bg-[#15171c] border border-[#2b2e36] p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#eceef2]">
                    <Film className="w-4 h-4 text-[#5ecd6e]" />
                    <span>Grabación Timelapse</span>
                  </div>
                  {onOpenTimelapse && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenTimelapse();
                      }}
                      className="h-7 px-2.5 rounded bg-[#22252d] hover:bg-[#2b303a] border border-[#343a47] text-[11px] font-semibold text-[#5ecd6e] transition-colors"
                    >
                      Abrir Timelapse
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-[#eceef2]">
                      Grabación automática al modelar
                    </div>
                    <div className="text-[11px] text-[#8e95a2]">
                      Registra cada paso de modelado automáticamente sin afectar el rendimiento
                    </div>
                  </div>
                  {renderSwitch(
                    settings.timelapseAutoRecord,
                    () =>
                      onUpdateSettings({
                        timelapseAutoRecord: !settings.timelapseAutoRecord,
                      }),
                    'Activar grabación automática de Timelapse',
                  )}
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-[#eceef2]">
                      Registrar movimientos de cámara
                    </div>
                    <div className="text-[11px] text-[#8e95a2]">
                      Guarda rotaciones, acercamientos, desplazamientos y cambios de vista
                    </div>
                  </div>
                  {renderSwitch(
                    settings.timelapseRecordCamera,
                    () =>
                      onUpdateSettings({
                        timelapseRecordCamera: !settings.timelapseRecordCamera,
                      }),
                    'Registrar movimientos de cámara en Timelapse',
                  )}
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-[#eceef2]">
                      Incluir cámara en reproducción y exportación
                    </div>
                    <div className="text-[11px] text-[#8e95a2]">
                      Desactívalo por defecto para obtener videos con cámara fija y estable
                    </div>
                  </div>
                  {renderSwitch(
                    settings.timelapseIncludeCameraInPlayback,
                    () =>
                      onUpdateSettings({
                        timelapseIncludeCameraInPlayback:
                          !settings.timelapseIncludeCameraInPlayback,
                      }),
                    'Incluir movimientos de cámara al reproducir Timelapse',
                  )}
                </div>

                <div className="pt-2 border-t border-[#252831] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="text-[11px] text-[#9ca3af] space-y-0.5">
                    <div>
                      Proyecto actual:{' '}
                      <strong className="text-[#e5e7eb] font-mono-tabular">
                        {formatTimelapseBytes(timelapseProjectBytes ?? 0)}
                      </strong>{' '}
                      ({timelapseStepCount ?? 0} pasos)
                    </div>
                    <div>
                      Total almacenado en LOOPA:{' '}
                      <strong className="text-[#cbd5e1] font-mono-tabular">
                        {formatTimelapseBytes(timelapseTotalBytes ?? 0)}
                      </strong>
                    </div>
                  </div>

                  {onClearActiveTimelapse && (
                    <TimelapseClearButton
                      disabled={(timelapseStepCount ?? 0) === 0}
                      onClear={onClearActiveTimelapse}
                    />
                  )}
                </div>
              </div>

              {sceneStats && (
                <div className="rounded-lg bg-[#15171c] border border-[#2b2e36] p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#eceef2]">
                      Información de escena
                    </span>
                    <span className="font-mono-tabular text-[#9ca3af]">
                      {sceneStats.objectCount} objeto
                      {sceneStats.objectCount === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#b4bac4] flex items-center justify-between gap-2">
                    <span className="truncate">
                      Activo: {sceneStats.activeObjectName ?? 'Ninguno'}
                    </span>
                    <span className="font-mono-tabular text-[#5ecd6e] shrink-0">
                      {sceneStats.workMode === 'edit'
                        ? `Edición (${sceneStats.selectedComponentCount} sel.)`
                        : `Objeto (${sceneStats.selectedObjectCount} sel.)`}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-1 border-t border-[#252831] text-center font-mono-tabular">
                    <div className="rounded bg-[#1b1e25] py-1.5">
                      <div className="text-[10px] text-[#8e95a2]">Vértices</div>
                      <div className="text-xs font-semibold text-[#f3f4f6]">
                        {sceneStats.vertices}
                      </div>
                    </div>
                    <div className="rounded bg-[#1b1e25] py-1.5">
                      <div className="text-[10px] text-[#8e95a2]">Aristas</div>
                      <div className="text-xs font-semibold text-[#f3f4f6]">
                        {sceneStats.edges}
                      </div>
                    </div>
                    <div className="rounded bg-[#1b1e25] py-1.5">
                      <div className="text-[10px] text-[#8e95a2]">Caras</div>
                      <div className="text-xs font-semibold text-[#f3f4f6]">
                        {sceneStats.faces}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Floating Radial Menu & Per-Mode Customization */}
              <div className="rounded-lg bg-[#15171c] border border-[#2b2e36] p-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Aperture className="w-4 h-4 text-[#5ecd6e] shrink-0" />
                    <div>
                      <div className="text-xs font-semibold text-[#eceef2]">
                        Botones flotantes y Menús radiales
                      </div>
                      <div className="text-[11px] text-[#8e95a2]">
                        Personaliza los 8 botones de BARHOME y Herramientas manteniendo pulsado o aquí
                      </div>
                    </div>
                  </div>
                  {renderSwitch(
                    settings.touch.floatingMenuEnabled,
                    () =>
                      onUpdateTouchSettings({
                        floatingMenuEnabled: !settings.touch.floatingMenuEnabled,
                      }),
                    'Activar botones flotantes',
                  )}
                </div>

                {settings.touch.floatingMenuEnabled && (
                  <>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="block text-[11px] font-medium text-[#a1a7b3]">
                          Posición inicial (también puedes arrastrar cada botón)
                        </span>
                        {(settings.touch.floatingMenuCustomPos ||
                          settings.touch.barhomeFloatingMenuCustomPos) && (
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateTouchSettings({
                                floatingMenuCustomPos: null,
                                barhomeFloatingMenuCustomPos: null,
                              })
                            }
                            className="text-[11px] font-medium text-[#5ecd6e] hover:underline shrink-0"
                          >
                            Alinear a esquina
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {corners.map((c) => {
                          const selected =
                            !settings.touch.floatingMenuCustomPos &&
                            !settings.touch.barhomeFloatingMenuCustomPos &&
                            settings.touch.floatingMenuCorner === c.id;
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() =>
                                onUpdateTouchSettings({
                                  floatingMenuCorner: c.id,
                                  floatingMenuCustomPos: null,
                                  barhomeFloatingMenuCustomPos: null,
                                })
                              }
                              className={`h-9 rounded-md text-[11px] font-medium border transition-colors ${
                                selected
                                  ? 'bg-[#2c313b] border-[#5ecd6e]/60 text-[#5ecd6e]'
                                  : 'bg-[#1c1f26] border-[#2e323d] text-[#b4bac4] hover:text-white'
                              }`}
                            >
                              {c.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <span className="block text-[11px] font-medium text-[#a1a7b3]">
                        Tamaño de los botones
                      </span>
                      <div className="grid grid-cols-3 gap-1.5">
                        {sizes.map((s) => {
                          const selected = settings.touch.floatingMenuSize === s.id;
                          return (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() =>
                                onUpdateTouchSettings({ floatingMenuSize: s.id })
                              }
                              className={`h-9 rounded-md text-xs font-medium border transition-colors ${
                                selected
                                  ? 'bg-[#2c313b] border-[#5ecd6e]/60 text-[#5ecd6e]'
                                  : 'bg-[#1c1f26] border-[#2e323d] text-[#b4bac4] hover:text-white'
                              }`}
                            >
                              {s.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Per-Mode Radial Slot Configurator */}
                    <div className="pt-2 border-t border-[#252831] space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-medium text-[#a1a7b3]">
                          Distribución independiente por menú y modo
                        </span>
                        <button
                          type="button"
                          onClick={() => onResetRadialLayout(radialEditorMode)}
                          className="text-[11px] font-medium text-[#5ecd6e] hover:underline flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Restaurar menú</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                        {radialModes.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            data-testid={`settings-radial-tab-${m.id}`}
                            onClick={() => setRadialEditorMode(m.id)}
                            className={`h-8 px-2 rounded-md text-[11px] font-semibold border transition-colors truncate ${
                              radialEditorMode === m.id
                                ? 'bg-[#2c313b] border-[#5ecd6e]/70 text-[#5ecd6e]'
                                : 'bg-[#1c1f26] border-[#2e323d] text-[#a1a7b3] hover:text-white'
                            }`}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>

                      <div className="grid grid-cols-4 gap-1.5">
                        {currentModeSlots.map((actionId, idx) => {
                          const def = actionId ? RADIAL_ACTION_MAP[actionId] : null;
                          return (
                            <button
                              key={`${radialEditorMode}-slot-${idx}`}
                              type="button"
                              data-testid={`settings-radial-slot-${idx}`}
                              onClick={() => setEditingSlotIndex(idx)}
                              className={`h-14 px-1.5 rounded-lg border flex flex-col items-center justify-center gap-1 transition-colors ${
                                def
                                  ? 'bg-[#1c1f26] hover:bg-[#252933] border-[#323744] text-[#e5e7eb]'
                                  : 'bg-[#16181e] hover:bg-[#20232b] border-dashed border-[#383e4c] text-[#7c8496]'
                              }`}
                            >
                              {def ? (
                                <RadialActionIcon
                                  icon={def.icon}
                                  className="w-3.5 h-3.5 text-[#5ecd6e]"
                                />
                              ) : (
                                <Plus className="w-3.5 h-3.5" />
                              )}
                              <span className="text-[10px] font-medium truncate max-w-full">
                                {def ? def.shortLabel : `Vacío ${idx + 1}`}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Modular Touch Modifiers Section */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#eceef2]">
                  <ArrowBigUpDash className="w-4 h-4 text-[#5ecd6e]" />
                  <span>Modificadores táctiles (SHIFT / CTRL / ALT)</span>
                </div>

                <div className="rounded-lg bg-[#15171c] border border-[#2b2e36] divide-y divide-[#252831]">
                  {/* Floating Modifier Panel Visibility & Behavior Mode */}
                  <div className="p-3 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-[#eceef2]">
                          Botón radial de modificadores en viewport
                        </div>
                        <div className="text-[11px] text-[#8e95a2] leading-tight">
                          Habilita el control flotante de SHIFT, CTRL y ALT en el viewport.
                        </div>
                      </div>
                      {renderSwitch(
                        settings.touch.modifierPanelEnabled,
                        () =>
                          onUpdateTouchSettings({
                            modifierPanelEnabled:
                              !settings.touch.modifierPanelEnabled,
                          }),
                        'Modificadores en viewport',
                      )}
                    </div>

                    {settings.touch.modifierPanelEnabled && (
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div className="min-w-0">
                          <div className="text-[11px] font-medium text-[#cbd5e1]">
                            Comportamiento de los botones
                          </div>
                          <div className="text-[10px] text-[#8e95a2]">
                            {settings.touch.modifierPanelMode === 'hold'
                              ? 'Mantén presionado el botón mientras usas el modificador.'
                              : 'Toca para activar y vuelve a tocar para desactivar.'}
                          </div>
                        </div>
                        <div className="inline-flex rounded-md bg-[#1d2027] border border-[#2e333e] p-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateTouchSettings({
                                modifierPanelMode: 'toggle',
                              })
                            }
                            className={`h-7 px-2.5 rounded text-[11px] font-semibold transition-colors ${
                              settings.touch.modifierPanelMode !== 'hold'
                                ? 'bg-[#16261a] text-[#7def8e] border border-[#5ecd6e]/70'
                                : 'text-[#9ca3af] hover:text-white border border-transparent'
                            }`}
                          >
                            Interruptor
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateTouchSettings({
                                modifierPanelMode: 'hold',
                              })
                            }
                            className={`h-7 px-2.5 rounded text-[11px] font-semibold transition-colors ${
                              settings.touch.modifierPanelMode === 'hold'
                                ? 'bg-[#16261a] text-[#7def8e] border border-[#5ecd6e]/70'
                                : 'text-[#9ca3af] hover:text-white border border-transparent'
                            }`}
                          >
                            Pulsación
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {TOUCH_MODIFIER_REGISTRY.map((mod) => {
                    const cfg = settings.touch.modifiers[mod.key];
                    return (
                      <div key={mod.key} className="p-3 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-14 shrink-0 py-1 rounded bg-[#22252e] border border-[#323746] text-[10px] font-bold text-center text-[#5ecd6e]">
                              {mod.badgeText}
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-medium text-[#eceef2]">
                                  {mod.label}
                                </span>
                              </div>
                              <div className="text-[11px] text-[#8e95a2] leading-tight">
                                {mod.description}
                              </div>
                            </div>
                          </div>
                          {renderSwitch(
                            cfg.enabled,
                            () =>
                              onUpdateTouchModifier(mod.key, {
                                enabled: !cfg.enabled,
                              }),
                            mod.label,
                          )}
                        </div>

                        {cfg.enabled && (
                          <div className="pl-16 space-y-2 pt-1">
                            {mod.key === 'shift' && (
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] text-[#cbd5e1]">
                                  Gesto de 2 dedos (mantener dedo 1 + tocar con dedo 2)
                                </span>
                                {renderSwitch(
                                  cfg.twoFingerHold,
                                  () =>
                                    onUpdateTouchModifier('shift', {
                                      twoFingerHold: !cfg.twoFingerHold,
                                    }),
                                  'Gesto SHIFT con 2 dedos',
                                )}
                              </div>
                            )}
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] text-[#cbd5e1]">
                                Botón {mod.badgeText} visible en el viewport
                              </span>
                              {renderSwitch(
                                cfg.showScreenButton,
                                () =>
                                  onUpdateTouchModifier(mod.key, {
                                    showScreenButton: !cfg.showScreenButton,
                                  }),
                                `Botón ${mod.badgeText} en pantalla`,
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Individual Gesture Toggles & Visual Guide */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#eceef2]">
                  <MousePointerClick className="w-4 h-4 text-[#5ecd6e]" />
                  <span>Guía visual y activación de gestos</span>
                </div>

                <div className="rounded-lg bg-[#15171c] border border-[#2b2e36] divide-y divide-[#252831]">
                  {gestureToggles.map((g) => {
                    const active = settings.touch[g.key];
                    return (
                      <div key={g.key} className="px-3 py-2.5 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-16 shrink-0 py-1 rounded bg-[#22252e] border border-[#323746] text-[10px] font-semibold text-center text-[#5ecd6e]">
                              {g.badge}
                            </span>
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-[#eceef2]">
                                {g.label}
                              </div>
                              <div className="text-[11px] text-[#8e95a2] leading-tight">
                                {g.desc}
                              </div>
                            </div>
                          </div>
                          {renderSwitch(
                            active,
                            () => onUpdateTouchSettings({ [g.key]: !active }),
                            g.label,
                          )}
                        </div>
                        {g.key === 'doubleTapBoxSelect' && active && (
                          <div className="pl-[74px] flex items-center justify-between gap-3">
                            <span className="text-[11px] text-[#a1a7b3] whitespace-nowrap">
                              Intervalo doble toque
                            </span>
                            <div className="flex items-center gap-2 flex-1 max-w-[200px]">
                              <input
                                type="range"
                                min={180}
                                max={550}
                                step={10}
                                value={settings.touch.doubleTapIntervalMs}
                                onChange={(e) =>
                                  onUpdateTouchSettings({
                                    doubleTapIntervalMs: parseInt(
                                      e.target.value,
                                      10,
                                    ),
                                  })
                                }
                                className="w-full accent-[#5ecd6e] cursor-pointer"
                              />
                              <span className="text-[11px] font-mono-tabular text-[#5ecd6e] w-12 text-right shrink-0">
                                {settings.touch.doubleTapIntervalMs} ms
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* iPadOS Compatibility Info */}
              <div className="rounded-lg bg-[#171c24] border border-[#2d3b4e] p-3 flex items-start gap-2.5">
                <Info className="w-4 h-4 text-[#60a5fa] shrink-0 mt-0.5" />
                <div className="text-[11px] text-[#b4c3d8] leading-relaxed">
                  <strong className="text-[#e2e8f0]">Compatibilidad con iPadOS / Safari:</strong>{' '}
                  El sistema operativo puede interceptar ciertos gestos de 3 dedos para funciones de edición de texto o multitarea. Si notas interferencia, puedes desactivar el gesto aquí y usar los botones de <strong>Deshacer / Rehacer</strong> en la barra superior o en el menú radial.
                </div>
              </div>

              {/* Restore Defaults */}
              <button
                type="button"
                onClick={onResetTouchSettings}
                className="w-full h-10 rounded-lg bg-[#23262e] hover:bg-[#2c313b] border border-[#353a46] text-xs font-semibold text-[#e5e7eb] flex items-center justify-center gap-2 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5 text-[#5ecd6e]" />
                <span>Restaurar configuración predeterminada</span>
              </button>
            </>
          )}

          {/* Application Info Footer */}
          <div className="pt-2 border-t border-[#262a33]">
            <div className="rounded-lg bg-[#14161b] border border-[#282c36] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <LoopaFullLogo variant="horizontal" className="h-7 w-auto" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[#e4e6eb] truncate">
                    {APP_NAME} · {APP_TAGLINE}
                  </div>
                  <div className="text-[11px] text-[#8e95a2] line-clamp-2">
                    {APP_DESCRIPTION}
                  </div>
                </div>
              </div>
              <span className="self-start sm:self-center shrink-0 text-[11px] font-mono-tabular px-2 py-0.5 rounded bg-[#16261a] border border-[#5ecd6e]/40 text-[#7def8e]">
                v{APP_VERSION}
              </span>
            </div>
          </div>
        </div>
      </div>

      {editingSlotIndex !== null && (
        <RadialSlotEditorModal
          mode={radialEditorMode}
          slotIndex={editingSlotIndex}
          currentActionId={currentModeSlots[editingSlotIndex] ?? null}
          onAssignAction={(actionId) =>
            onUpdateRadialSlot(radialEditorMode, editingSlotIndex, actionId)
          }
          onRestoreDefaultSlot={() =>
            onResetRadialSlot(radialEditorMode, editingSlotIndex)
          }
          onRestoreEntireLayout={() => onResetRadialLayout(radialEditorMode)}
          onClose={() => setEditingSlotIndex(null)}
        />
      )}
    </div>
  );
};

const TimelapseClearButton: React.FC<{
  disabled: boolean;
  onClear: () => Promise<void>;
}> = ({ disabled, onClear }) => {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (confirming) {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[11px] text-[#fca5a5] flex items-center gap-1">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          ¿Eliminar historial?
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onClear();
              setConfirming(false);
            } finally {
              setBusy(false);
            }
          }}
          className="h-8 px-2.5 rounded bg-[#b91c1c] hover:bg-[#dc2626] text-[11px] font-semibold text-white transition-colors"
        >
          {busy ? 'Eliminando...' : 'Confirmar'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirming(false)}
          className="h-8 px-2 rounded bg-[#23262e] hover:bg-[#2c313b] border border-[#353a46] text-[11px] text-[#cbd5e1]"
        >
          Cancelar
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setConfirming(true)}
      className="h-8 px-2.5 rounded bg-[#271b1e] hover:bg-[#362227] disabled:opacity-40 disabled:pointer-events-none border border-[#4d2d33] text-[11px] font-semibold text-[#fca5a5] flex items-center gap-1.5 transition-colors self-start sm:self-auto"
    >
      <Trash2 className="w-3.5 h-3.5" />
      <span>Eliminar historial</span>
    </button>
  );
};
