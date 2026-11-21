import { isLoopaAppId } from '../ecosystem/apps';
import {
  cloneProjectForDuplicate,
  createDefaultScene,
  createDefaultSceneObject as createDefaultHierarchyObject,
  createHierarchyId,
  createProjectFromTemplate,
  normalizeProjectHierarchy,
} from './hierarchy';
import {
  cloneDefaultRadialLayouts,
  cloneDefaultWorkspaceToolLayouts,
  DEFAULT_BARHOME_RADIAL_LAYOUT,
  DEFAULT_RADIAL_LAYOUTS,
  DEFAULT_WORKSPACE_TOOL_RADIAL_LAYOUTS,
  normalizeRadialSlotList,
} from '../radial/radialActions';
import {
  DEFAULT_PROPORTIONAL_EDITING_SETTINGS,
  normalizeProportionalSettings,
} from '../mesh/proportionalEditing';
import {
  DeleteFolderResolution,
  ExtrudeDefaultAxis,
  GizmoTransformMode,
  ModelerSettings,
  MoveSubMode,
  ProjectData,
  ProjectFolder,
  ProjectRecoveryRecord,
  ProjectStorageAdapter,
  ProjectSummary,
  ProjectTemplateId,
  SaveOperationResult,
  SceneObjectData,
  ToolConfigurations,
  TouchControlSettings,
  TouchModifierSettings,
  ViewportDisplayMode,
} from './types';

const INDEX_KEY = 'forma3d_projects_index_v1';
const FOLDERS_KEY = 'forma3d_folders_v1';
const PROJECT_PREFIX = 'forma3d_project_v1_';
const RECOVERY_PREFIX = 'forma3d_recovery_v1_';
const ACTIVE_PROJECT_KEY = 'forma3d_active_project_v1';
const SETTINGS_KEY = 'forma3d_settings_v1';
const LAST_GIZMO_MODE_KEY = 'forma3d_last_gizmo_mode_v1';
const LEFT_TOOLBAR_COLLAPSED_KEY = 'forma3d_left_toolbar_collapsed_v1';

const IDB_NAME = 'forma3d_projects_db_v1';
const IDB_VERSION = 3;
const STORE_PROJECTS = 'projects';
const STORE_FOLDERS = 'folders';
const STORE_THUMBNAILS = 'thumbnails';
const STORE_RECOVERY = 'recovery';
const STORE_BACKUPS = 'backups';
export const STORE_TIMELAPSE_META = 'timelapse_meta';
export const STORE_TIMELAPSE_STEPS = 'timelapse_steps';
export const STORE_TIMELAPSE_BLOBS = 'timelapse_blobs';

interface ThumbnailRecord {
  projectId: string;
  dataUrl: string;
  updatedAt: number;
}

function safeStorageGet(key: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key: string, value: string): { ok: boolean; quotaExceeded: boolean; error?: string } {
  try {
    if (typeof localStorage === 'undefined') {
      return { ok: false, quotaExceeded: false, error: 'Almacenamiento local no disponible' };
    }
    localStorage.setItem(key, value);
    return { ok: true, quotaExceeded: false };
  } catch (err) {
    const isQuota =
      err instanceof DOMException &&
      (err.name === 'QuotaExceededError' ||
        err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        err.code === 22 ||
        err.code === 1014);
    return {
      ok: false,
      quotaExceeded: isQuota,
      error: isQuota
        ? 'Límite de almacenamiento local alcanzado.'
        : err instanceof Error
          ? err.message
          : 'Error al escribir en almacenamiento local.',
    };
  }
}

function safeStorageRemove(key: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(key);
  } catch {
    // Ignore storage removal errors
  }
}

export function loadLastGizmoMode(): GizmoTransformMode {
  const raw = safeStorageGet(LAST_GIZMO_MODE_KEY);
  if (raw === 'move' || raw === 'rotate' || raw === 'scale' || raw === 'all') {
    return raw;
  }
  return 'move';
}

export function saveLastGizmoMode(mode: GizmoTransformMode): void {
  safeStorageSet(LAST_GIZMO_MODE_KEY, mode);
}

export function loadLeftToolbarCollapsed(): boolean {
  const raw = safeStorageGet(LEFT_TOOLBAR_COLLAPSED_KEY);
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (typeof window !== 'undefined') {
    return window.innerWidth < 720;
  }
  return false;
}

export function saveLeftToolbarCollapsed(collapsed: boolean): void {
  safeStorageSet(LEFT_TOOLBAR_COLLAPSED_KEY, String(collapsed));
}

export type LeftToolbarDisplayMode = 'expanded' | 'compact' | 'hidden';

export function getNextLeftToolbarDisplayMode(
  current: LeftToolbarDisplayMode,
): LeftToolbarDisplayMode {
  switch (current) {
    case 'hidden':
      return 'expanded';
    case 'expanded':
      return 'compact';
    case 'compact':
      return 'hidden';
  }
}

export type SidebarModuleId =
  | 'selection'
  | 'transform'
  | 'selectionModes'
  | 'sculptBrushes'
  | 'modeling'
  | 'geometryEdit'
  | 'uvSeams'
  | 'normalsDisplay'
  | 'proportional'
  | 'additional';

export interface ToolbarLayoutPreferences {
  barhomeVisible: boolean;
  leftToolbarMode: LeftToolbarDisplayMode;
  linerVisible: boolean;
  moduleOrder: SidebarModuleId[];
  expandedModules: Record<SidebarModuleId, boolean>;
}

const TOOLBAR_LAYOUT_PREFS_KEY = 'loopa_toolbar_layout_prefs_v1';

export const DEFAULT_SIDEBAR_MODULE_ORDER: SidebarModuleId[] = [
  'selection',
  'transform',
  'selectionModes',
  'sculptBrushes',
  'modeling',
  'geometryEdit',
  'uvSeams',
  'normalsDisplay',
  'proportional',
  'additional',
];

export const DEFAULT_SIDEBAR_EXPANDED_MODULES: Record<SidebarModuleId, boolean> = {
  selection: true,
  transform: true,
  selectionModes: true,
  sculptBrushes: true,
  modeling: true,
  geometryEdit: true,
  uvSeams: true,
  normalsDisplay: false,
  proportional: false,
  additional: false,
};

const VALID_MODULE_ID_SET = new Set<string>(DEFAULT_SIDEBAR_MODULE_ORDER);

function isValidLeftToolbarMode(val: unknown): val is LeftToolbarDisplayMode {
  return val === 'expanded' || val === 'compact' || val === 'hidden';
}

function getDefaultLinerVisible(): boolean {
  if (typeof window !== 'undefined') {
    return window.innerWidth >= 1024;
  }
  return true;
}

export function createDefaultToolbarLayoutPreferences(): ToolbarLayoutPreferences {
  return {
    barhomeVisible: true,
    leftToolbarMode: 'hidden',
    linerVisible: getDefaultLinerVisible(),
    moduleOrder: [...DEFAULT_SIDEBAR_MODULE_ORDER],
    expandedModules: { ...DEFAULT_SIDEBAR_EXPANDED_MODULES },
  };
}

export function normalizeToolbarLayoutPreferences(
  raw?: (Partial<ToolbarLayoutPreferences> & { leftToolbarVisible?: boolean }) | null,
): ToolbarLayoutPreferences {
  const defaults = createDefaultToolbarLayoutPreferences();
  if (!raw || typeof raw !== 'object') {
    return defaults;
  }

  const seen = new Set<SidebarModuleId>();
  const normalizedOrder: SidebarModuleId[] = [];
  if (Array.isArray(raw.moduleOrder)) {
    for (const id of raw.moduleOrder) {
      if (typeof id === 'string' && VALID_MODULE_ID_SET.has(id)) {
        const typedId = id as SidebarModuleId;
        if (!seen.has(typedId)) {
          seen.add(typedId);
          normalizedOrder.push(typedId);
        }
      }
    }
  }
  for (const fallbackId of DEFAULT_SIDEBAR_MODULE_ORDER) {
    if (!seen.has(fallbackId)) {
      seen.add(fallbackId);
      normalizedOrder.push(fallbackId);
    }
  }

  const expandedModules: Record<SidebarModuleId, boolean> = {
    ...DEFAULT_SIDEBAR_EXPANDED_MODULES,
  };
  if (raw.expandedModules && typeof raw.expandedModules === 'object') {
    for (const id of DEFAULT_SIDEBAR_MODULE_ORDER) {
      const val = (raw.expandedModules as Record<string, unknown>)[id];
      if (typeof val === 'boolean') {
        expandedModules[id] = val;
      }
    }
  }

  const leftToolbarMode: LeftToolbarDisplayMode = isValidLeftToolbarMode(
    raw.leftToolbarMode,
  )
    ? raw.leftToolbarMode
    : defaults.leftToolbarMode;

  return {
    barhomeVisible:
      typeof raw.barhomeVisible === 'boolean'
        ? raw.barhomeVisible
        : defaults.barhomeVisible,
    leftToolbarMode,
    linerVisible:
      typeof raw.linerVisible === 'boolean'
        ? raw.linerVisible
        : defaults.linerVisible,
    moduleOrder: normalizedOrder,
    expandedModules,
  };
}

export function loadToolbarLayoutPreferences(): ToolbarLayoutPreferences {
  const raw = safeStorageGet(TOOLBAR_LAYOUT_PREFS_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<ToolbarLayoutPreferences>;
      return normalizeToolbarLayoutPreferences(parsed);
    } catch {
      return createDefaultToolbarLayoutPreferences();
    }
  }
  return createDefaultToolbarLayoutPreferences();
}

export function saveToolbarLayoutPreferences(
  prefs: ToolbarLayoutPreferences,
): void {
  const normalized = normalizeToolbarLayoutPreferences(prefs);
  safeStorageSet(TOOLBAR_LAYOUT_PREFS_KEY, JSON.stringify(normalized));
  safeStorageSet(
    LEFT_TOOLBAR_COLLAPSED_KEY,
    String(normalized.leftToolbarMode === 'hidden'),
  );
}

export function resetModuleOrganizationInPrefs(
  current: ToolbarLayoutPreferences,
): ToolbarLayoutPreferences {
  return {
    ...current,
    moduleOrder: [...DEFAULT_SIDEBAR_MODULE_ORDER],
    expandedModules: { ...DEFAULT_SIDEBAR_EXPANDED_MODULES },
  };
}

export function reorderSidebarModules(
  currentOrder: SidebarModuleId[],
  visibleIds: SidebarModuleId[],
  draggedId: SidebarModuleId,
  insertVisibleIndex: number,
): SidebarModuleId[] {
  if (!visibleIds.includes(draggedId) || visibleIds.length < 2) {
    return currentOrder;
  }
  const clampedSlot = Math.max(
    0,
    Math.min(visibleIds.length, insertVisibleIndex),
  );
  const without = currentOrder.filter((id) => id !== draggedId);

  if (clampedSlot < visibleIds.length) {
    const targetId = visibleIds[clampedSlot];
    if (
      targetId === draggedId ||
      (clampedSlot > 0 && visibleIds[clampedSlot - 1] === draggedId)
    ) {
      return currentOrder;
    }
    const targetIdx = without.indexOf(targetId);
    if (targetIdx === -1) return currentOrder;
    const next = [...without];
    next.splice(targetIdx, 0, draggedId);
    return next;
  }

  const lastVisibleId = visibleIds[visibleIds.length - 1];
  if (lastVisibleId === draggedId) {
    return currentOrder;
  }
  const lastIdx = without.indexOf(lastVisibleId);
  if (lastIdx === -1) return currentOrder;
  const next = [...without];
  next.splice(lastIdx + 1, 0, draggedId);
  return next;
}

export const DEFAULT_TOUCH_MODIFIERS: TouchModifierSettings = {
  shift: {
    enabled: true,
    twoFingerHold: true,
    showScreenButton: true,
  },
  ctrl: {
    enabled: true,
    twoFingerHold: false,
    showScreenButton: true,
  },
  alt: {
    enabled: true,
    twoFingerHold: false,
    showScreenButton: true,
  },
};

export function createDefaultTouchSettings(): TouchControlSettings {
  return {
    oneFingerOrbit: true,
    oneFingerTapSelect: true,
    doubleTapBoxSelect: true,
    doubleTapIntervalMs: 320,
    twoFingerPinchZoom: true,
    twoFingerPan: true,
    twoFingerUndo: true,
    threeFingerRedo: true,
    longPressContextMenu: true,
    floatingMenuEnabled: true,
    floatingMenuCorner: 'bottom-right',
    floatingMenuSize: 'medium',
    floatingMenuCustomPos: null,
    barhomeFloatingMenuCustomPos: null,
    modifierPanelEnabled: true,
    modifierPanelMode: 'toggle',
    modifiers: {
      shift: { ...DEFAULT_TOUCH_MODIFIERS.shift },
      ctrl: { ...DEFAULT_TOUCH_MODIFIERS.ctrl },
      alt: { ...DEFAULT_TOUCH_MODIFIERS.alt },
    },
    radialLayouts: cloneDefaultRadialLayouts(),
    barhomeRadialLayout: [...DEFAULT_BARHOME_RADIAL_LAYOUT],
    workspaceToolRadialLayouts: cloneDefaultWorkspaceToolLayouts(),
  };
}

export const DEFAULT_TOUCH_SETTINGS: TouchControlSettings =
  createDefaultTouchSettings();

export function createDefaultToolConfigs(): ToolConfigurations {
  return {
    extrude: {
      defaultDistance: 0.01,
      defaultAxis: 'normal',
      defaultIndividual: false,
    },
    bevel: {
      defaultWidth: 0.2,
      defaultSegments: 1,
      defaultProfile: 0.5,
      defaultClampOverlap: true,
    },
    subdivide: {
      defaultCuts: 1,
      defaultSmoothness: 0,
      defaultFractal: 0,
    },
    inset: {
      defaultThickness: 0.25,
      defaultDepth: 0,
      defaultIndividual: false,
    },
    loopCut: {
      defaultCuts: 1,
      defaultSlide: 0,
    },
    mergeByDistance: {
      defaultDistance: 0.005,
    },
    dissolveLimited: {
      defaultMaxAngleDeg: 5,
      defaultDissolveVertices: true,
    },
    move: {
      defaultSubMode: 'free',
    },
  };
}

export const DEFAULT_TOOL_CONFIGS: ToolConfigurations =
  createDefaultToolConfigs();

export function normalizeToolConfigs(
  raw?: Partial<ToolConfigurations> | null,
): ToolConfigurations {
  const base = createDefaultToolConfigs();
  if (!raw) return base;

  const num = (v: unknown, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  const clamp = (v: number, min: number, max: number): number =>
    Math.max(min, Math.min(max, v));
  const extrudeAxis = (v: unknown): ExtrudeDefaultAxis =>
    v === 'normal' || v === 'x' || v === 'y' || v === 'z'
      ? v
      : base.extrude.defaultAxis;
  const moveSubMode = (v: unknown): MoveSubMode =>
    v === 'free' || v === 'axis' || v === 'slide' ? v : base.move.defaultSubMode;

  return {
    extrude: {
      defaultDistance: num(raw.extrude?.defaultDistance, base.extrude.defaultDistance),
      defaultAxis: extrudeAxis(raw.extrude?.defaultAxis),
      defaultIndividual:
        typeof raw.extrude?.defaultIndividual === 'boolean'
          ? raw.extrude.defaultIndividual
          : base.extrude.defaultIndividual,
    },
    bevel: {
      defaultWidth: clamp(num(raw.bevel?.defaultWidth, base.bevel.defaultWidth), 0.001, 5),
      defaultSegments: Math.round(
        clamp(num(raw.bevel?.defaultSegments, base.bevel.defaultSegments), 1, 5),
      ),
      defaultProfile: clamp(num(raw.bevel?.defaultProfile, base.bevel.defaultProfile), 0.1, 1),
      defaultClampOverlap:
        typeof raw.bevel?.defaultClampOverlap === 'boolean'
          ? raw.bevel.defaultClampOverlap
          : base.bevel.defaultClampOverlap,
    },
    subdivide: {
      defaultCuts: Math.round(
        clamp(num(raw.subdivide?.defaultCuts, base.subdivide.defaultCuts), 1, 6),
      ),
      defaultSmoothness: clamp(
        num(raw.subdivide?.defaultSmoothness, base.subdivide.defaultSmoothness),
        0,
        1,
      ),
      defaultFractal: clamp(
        num(raw.subdivide?.defaultFractal, base.subdivide.defaultFractal),
        0,
        0.5,
      ),
    },
    inset: {
      defaultThickness: clamp(
        num(raw.inset?.defaultThickness, base.inset.defaultThickness),
        0.01,
        0.95,
      ),
      defaultDepth: num(raw.inset?.defaultDepth, base.inset.defaultDepth),
      defaultIndividual:
        typeof raw.inset?.defaultIndividual === 'boolean'
          ? raw.inset.defaultIndividual
          : base.inset.defaultIndividual,
    },
    loopCut: {
      defaultCuts: Math.round(
        clamp(num(raw.loopCut?.defaultCuts, base.loopCut.defaultCuts), 1, 24),
      ),
      defaultSlide: clamp(num(raw.loopCut?.defaultSlide, base.loopCut.defaultSlide), -1, 1),
    },
    mergeByDistance: {
      defaultDistance: Math.max(
        0.0001,
        num(raw.mergeByDistance?.defaultDistance, base.mergeByDistance.defaultDistance),
      ),
    },
    dissolveLimited: {
      defaultMaxAngleDeg: clamp(
        num(raw.dissolveLimited?.defaultMaxAngleDeg, base.dissolveLimited.defaultMaxAngleDeg),
        0.1,
        180,
      ),
      defaultDissolveVertices:
        typeof raw.dissolveLimited?.defaultDissolveVertices === 'boolean'
          ? raw.dissolveLimited.defaultDissolveVertices
          : base.dissolveLimited.defaultDissolveVertices,
    },
    move: {
      defaultSubMode: moveSubMode(raw.move?.defaultSubMode),
    },
  };
}

export const DEFAULT_MODELER_SETTINGS: ModelerSettings = {
  displayMode: 'solid',
  xrayTransparency: 50,
  showFaceOrientation: false,
  showGrid: true,
  showAxes: true,
  xrayEditMode: false,
  gizmoSize: 1.25,
  snapEnabled: false,
  snapTranslateStep: 0.25,
  snapRotateDeg: 15,
  snapScaleStep: 0.1,
  multiSelectTouch: false,
  autosaveEnabled: true,
  autosaveIntervalSec: 30,
  createRecoveryBackups: true,
  proportionalEditing: { ...DEFAULT_PROPORTIONAL_EDITING_SETTINGS },
  touch: createDefaultTouchSettings(),
  toolConfigs: createDefaultToolConfigs(),
  timelapseAutoRecord: true,
  timelapseRecordCamera: true,
  timelapseIncludeCameraInPlayback: true,
};

export function normalizeTouchSettings(
  rawTouch?: Partial<TouchControlSettings> | null,
): TouchControlSettings {
  const base = createDefaultTouchSettings();
  if (!rawTouch) return base;
  const rawInterval =
    typeof rawTouch.doubleTapIntervalMs === 'number' &&
    !Number.isNaN(rawTouch.doubleTapIntervalMs)
      ? Math.max(180, Math.min(600, Math.round(rawTouch.doubleTapIntervalMs)))
      : base.doubleTapIntervalMs;
  const isLegacyModifierSchema = rawTouch.modifierPanelEnabled === undefined;
  return {
    ...base,
    ...rawTouch,
    doubleTapBoxSelect: rawTouch.doubleTapBoxSelect !== false,
    doubleTapIntervalMs: rawInterval,
    modifierPanelEnabled: rawTouch.modifierPanelEnabled !== false,
    modifierPanelMode: rawTouch.modifierPanelMode === 'hold' ? 'hold' : 'toggle',
    modifiers: {
      shift: {
        ...base.modifiers.shift,
        ...(rawTouch.modifiers?.shift ?? {}),
      },
      ctrl: isLegacyModifierSchema
        ? { ...base.modifiers.ctrl }
        : {
            ...base.modifiers.ctrl,
            ...(rawTouch.modifiers?.ctrl ?? {}),
          },
      alt: isLegacyModifierSchema
        ? { ...base.modifiers.alt }
        : {
            ...base.modifiers.alt,
            ...(rawTouch.modifiers?.alt ?? {}),
          },
    },
    barhomeFloatingMenuCustomPos: rawTouch.barhomeFloatingMenuCustomPos ?? null,
    radialLayouts: {
      object: normalizeRadialSlotList(
        rawTouch.radialLayouts?.object,
        DEFAULT_RADIAL_LAYOUTS.object,
      ),
      edit: normalizeRadialSlotList(
        rawTouch.radialLayouts?.edit,
        DEFAULT_RADIAL_LAYOUTS.edit,
      ),
      sculpt: normalizeRadialSlotList(
        rawTouch.radialLayouts?.sculpt,
        DEFAULT_RADIAL_LAYOUTS.sculpt,
      ),
    },
    barhomeRadialLayout: normalizeRadialSlotList(
      rawTouch.barhomeRadialLayout,
      DEFAULT_BARHOME_RADIAL_LAYOUT,
    ),
    workspaceToolRadialLayouts: {
      uv_editing: normalizeRadialSlotList(
        rawTouch.workspaceToolRadialLayouts?.uv_editing,
        DEFAULT_WORKSPACE_TOOL_RADIAL_LAYOUTS.uv_editing,
      ),
      materials: normalizeRadialSlotList(
        rawTouch.workspaceToolRadialLayouts?.materials,
        DEFAULT_WORKSPACE_TOOL_RADIAL_LAYOUTS.materials,
      ),
    },
  };
}

function normalizeDisplayMode(
  mode: unknown,
  legacyXray?: boolean,
): ViewportDisplayMode {
  if (
    mode === 'wireframe' ||
    mode === 'solid' ||
    mode === 'xray' ||
    mode === 'material'
  ) {
    return mode;
  }
  return legacyXray ? 'xray' : 'solid';
}

function normalizeXrayTransparency(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return DEFAULT_MODELER_SETTINGS.xrayTransparency;
  }
  return Math.max(10, Math.min(90, Math.round(value)));
}

function normalizeAutosaveInterval(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_MODELER_SETTINGS.autosaveIntervalSec;
  }
  return Math.max(10, Math.min(300, Math.round(value)));
}

export function loadSettingsLocally(): ModelerSettings {
  try {
    const raw = safeStorageGet(SETTINGS_KEY);
    if (!raw) {
      return {
        ...DEFAULT_MODELER_SETTINGS,
        touch: createDefaultTouchSettings(),
        toolConfigs: createDefaultToolConfigs(),
      };
    }
    const parsed = JSON.parse(raw) as Partial<ModelerSettings>;
    const displayMode = normalizeDisplayMode(
      parsed.displayMode,
      parsed.xrayEditMode,
    );
    return {
      ...DEFAULT_MODELER_SETTINGS,
      ...parsed,
      displayMode,
      xrayEditMode: displayMode === 'xray',
      xrayTransparency: normalizeXrayTransparency(parsed.xrayTransparency),
      showFaceOrientation: Boolean(parsed.showFaceOrientation),
      autosaveEnabled:
        typeof parsed.autosaveEnabled === 'boolean'
          ? parsed.autosaveEnabled
          : DEFAULT_MODELER_SETTINGS.autosaveEnabled,
      autosaveIntervalSec: normalizeAutosaveInterval(parsed.autosaveIntervalSec),
      createRecoveryBackups:
        typeof parsed.createRecoveryBackups === 'boolean'
          ? parsed.createRecoveryBackups
          : DEFAULT_MODELER_SETTINGS.createRecoveryBackups,
      proportionalEditing: normalizeProportionalSettings(
        parsed.proportionalEditing,
      ),
      touch: normalizeTouchSettings(parsed.touch),
      toolConfigs: normalizeToolConfigs(parsed.toolConfigs),
      timelapseAutoRecord:
        typeof parsed.timelapseAutoRecord === 'boolean'
          ? parsed.timelapseAutoRecord
          : DEFAULT_MODELER_SETTINGS.timelapseAutoRecord,
      timelapseRecordCamera:
        typeof parsed.timelapseRecordCamera === 'boolean'
          ? parsed.timelapseRecordCamera
          : DEFAULT_MODELER_SETTINGS.timelapseRecordCamera,
      timelapseIncludeCameraInPlayback:
        typeof parsed.timelapseIncludeCameraInPlayback === 'boolean'
          ? parsed.timelapseIncludeCameraInPlayback
          : DEFAULT_MODELER_SETTINGS.timelapseIncludeCameraInPlayback,
    };
  } catch {
    return {
      ...DEFAULT_MODELER_SETTINGS,
      proportionalEditing: { ...DEFAULT_PROPORTIONAL_EDITING_SETTINGS },
      touch: createDefaultTouchSettings(),
      toolConfigs: createDefaultToolConfigs(),
    };
  }
}

export function saveSettingsLocally(settings: ModelerSettings): void {
  safeStorageSet(SETTINGS_KEY, JSON.stringify(settings));
}

export interface MeshExporter {
  readonly format: 'obj' | 'stl' | 'glb';
  readonly extension: string;
  readonly mimeType: string;
  exportScene(project: ProjectData): Promise<Blob>;
}

export function generateId(prefix: string): string {
  return createHierarchyId(prefix);
}

export function createDefaultSceneObject(
  collectionId = 'col_default',
): SceneObjectData {
  return createDefaultHierarchyObject(collectionId);
}

export function createNewProject(
  name = 'Proyecto Sin Título',
  templateId: ProjectTemplateId = 'cube',
  folderId: string | null = null,
): ProjectData {
  return createProjectFromTemplate({ name, templateId, folderId });
}

function summarizeProject(
  project: ProjectData,
  hasRecoveryDraft = false,
): ProjectSummary {
  const objectCount = project.scenes.reduce(
    (sum, scene) => sum + scene.objects.length,
    0,
  );
  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    ...(project.lastOpenedAt !== undefined
      ? { lastOpenedAt: project.lastOpenedAt }
      : {}),
    objectCount,
    folderId: project.folderId ?? null,
    thumbnailDataUrl: project.thumbnailDataUrl ?? null,
    ...(hasRecoveryDraft ? { hasRecoveryDraft: true } : {}),
    ...(project.templateId ? { templateId: project.templateId } : {}),
    ...(project.ecosystem?.lastAppId ? { lastAppId: project.ecosystem.lastAppId } : {}),
  };
}

function normalizeSummary(raw: Partial<ProjectSummary>): ProjectSummary | null {
  if (!raw || typeof raw.id !== 'string' || !raw.id) return null;
  const updatedAt = typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now();
  const createdAt = typeof raw.createdAt === 'number' ? raw.createdAt : updatedAt;
  return {
    id: raw.id,
    name:
      typeof raw.name === 'string' && raw.name.trim()
        ? raw.name
        : 'Proyecto Sin Título',
    createdAt,
    updatedAt,
    ...(typeof raw.lastOpenedAt === 'number'
      ? { lastOpenedAt: raw.lastOpenedAt }
      : {}),
    objectCount: typeof raw.objectCount === 'number' ? raw.objectCount : 0,
    folderId: typeof raw.folderId === 'string' && raw.folderId ? raw.folderId : null,
    thumbnailDataUrl:
      typeof raw.thumbnailDataUrl === 'string' &&
      raw.thumbnailDataUrl.startsWith('data:image/')
        ? raw.thumbnailDataUrl
        : null,
    ...(raw.hasRecoveryDraft ? { hasRecoveryDraft: true } : {}),
    ...(typeof raw.templateId === 'string' ? { templateId: raw.templateId } : {}),
    ...(isLoopaAppId(raw.lastAppId) ? { lastAppId: raw.lastAppId } : {}),
  };
}

export function listSavedProjects(): ProjectSummary[] {
  try {
    const raw = safeStorageGet(INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<ProjectSummary>[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeSummary)
      .filter((s): s is ProjectSummary => s !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

function writeSummaryIndex(summaries: ProjectSummary[]): {
  ok: boolean;
  quotaExceeded: boolean;
  error?: string;
} {
  const sorted = [...summaries].sort((a, b) => b.updatedAt - a.updatedAt);
  const fullAttempt = safeStorageSet(INDEX_KEY, JSON.stringify(sorted));
  if (fullAttempt.ok) return fullAttempt;
  // Retry without inline dataUrl thumbnails so index metadata still persists
  const compact = sorted.map((s) => ({ ...s, thumbnailDataUrl: null }));
  return safeStorageSet(INDEX_KEY, JSON.stringify(compact));
}

function listFoldersLocally(): ProjectFolder[] {
  try {
    const raw = safeStorageGet(FOLDERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ProjectFolder[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((f) => f && typeof f.id === 'string' && typeof f.name === 'string')
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  } catch {
    return [];
  }
}

function writeFoldersLocally(folders: ProjectFolder[]): void {
  safeStorageSet(FOLDERS_KEY, JSON.stringify(folders));
}

/* ============================================================================
 * IndexedDB v2 Persistence Backend (Projects, Folders, Thumbnails, Recovery, Backups)
 * ========================================================================== */

let cachedDbPromise: Promise<IDBDatabase | null> | null = null;

export function openProjectsDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (cachedDbPromise) return cachedDbPromise;

  cachedDbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
          db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_FOLDERS)) {
          db.createObjectStore(STORE_FOLDERS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_THUMBNAILS)) {
          db.createObjectStore(STORE_THUMBNAILS, { keyPath: 'projectId' });
        }
        if (!db.objectStoreNames.contains(STORE_RECOVERY)) {
          db.createObjectStore(STORE_RECOVERY, { keyPath: 'projectId' });
        }
        if (!db.objectStoreNames.contains(STORE_BACKUPS)) {
          db.createObjectStore(STORE_BACKUPS, { keyPath: 'projectId' });
        }
        if (!db.objectStoreNames.contains(STORE_TIMELAPSE_META)) {
          db.createObjectStore(STORE_TIMELAPSE_META, { keyPath: 'projectId' });
        }
        if (!db.objectStoreNames.contains(STORE_TIMELAPSE_STEPS)) {
          const stepsStore = db.createObjectStore(STORE_TIMELAPSE_STEPS, {
            keyPath: 'id',
          });
          stepsStore.createIndex('by_projectId', 'projectId', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_TIMELAPSE_BLOBS)) {
          const blobsStore = db.createObjectStore(STORE_TIMELAPSE_BLOBS, {
            keyPath: 'id',
          });
          blobsStore.createIndex('by_projectId', 'projectId', { unique: false });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onclose = () => {
          cachedDbPromise = null;
        };
        db.onversionchange = () => {
          db.close();
          cachedDbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => {
        cachedDbPromise = null;
        resolve(null);
      };
    } catch {
      cachedDbPromise = null;
      resolve(null);
    }
  });

  return cachedDbPromise;
}

function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = (err as { name?: string }).name;
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED';
}

async function idbGet<T>(storeName: string, key: string): Promise<T | null> {
  const db = await openProjectsDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbGetAll<T>(storeName: string): Promise<T[]> {
  const db = await openProjectsDb();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () =>
        resolve(Array.isArray(req.result) ? (req.result as T[]) : []);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

async function idbPut(
  storeName: string,
  value: unknown,
): Promise<{ ok: boolean; quotaExceeded: boolean; error?: string }> {
  const db = await openProjectsDb();
  if (!db) {
    return {
      ok: false,
      quotaExceeded: false,
      error: 'IndexedDB no disponible',
    };
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(value);
      tx.oncomplete = () => resolve({ ok: true, quotaExceeded: false });
      tx.onerror = () => {
        const err = tx.error;
        const quota = isQuotaError(err);
        resolve({
          ok: false,
          quotaExceeded: quota,
          error: quota
            ? 'Espacio de almacenamiento insuficiente en el dispositivo.'
            : err?.message ?? 'Error al guardar en la base de datos local.',
        });
      };
      tx.onabort = () => {
        const err = tx.error;
        const quota = isQuotaError(err);
        resolve({
          ok: false,
          quotaExceeded: quota,
          error: quota
            ? 'Espacio de almacenamiento insuficiente en el dispositivo.'
            : err?.message ?? 'Operación de guardado cancelada.',
        });
      };
    } catch (err) {
      const quota = isQuotaError(err);
      resolve({
        ok: false,
        quotaExceeded: quota,
        error: err instanceof Error ? err.message : 'Error al escribir en IndexedDB.',
      });
    }
  });
}

async function idbDelete(
  storeName: string,
  key: string,
): Promise<{ ok: boolean; error?: string }> {
  const db = await openProjectsDb();
  if (!db) return { ok: true };
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(key);
      tx.oncomplete = () => resolve({ ok: true });
      tx.onerror = () =>
        resolve({
          ok: false,
          error: tx.error?.message ?? 'Error al eliminar registro en IndexedDB.',
        });
    } catch (err) {
      resolve({
        ok: false,
        error: err instanceof Error ? err.message : 'Error al eliminar en IndexedDB.',
      });
    }
  });
}

async function idbGetAllKeys(storeName: string): Promise<string[]> {
  const db = await openProjectsDb();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAllKeys();
      req.onsuccess = () =>
        resolve(
          Array.isArray(req.result)
            ? req.result.map((k) => String(k))
            : [],
        );
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

async function idbGetByProjectIndex<T>(
  storeName: string,
  projectId: string,
): Promise<T[]> {
  const db = await openProjectsDb();
  if (!db || !db.objectStoreNames.contains(storeName)) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readonly');
      const idx = tx.objectStore(storeName).index('by_projectId');
      const req = idx.getAll(projectId);
      req.onsuccess = () =>
        resolve(Array.isArray(req.result) ? (req.result as T[]) : []);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

async function idbDeleteByProjectIndex(
  storeName: string,
  projectId: string,
): Promise<void> {
  const db = await openProjectsDb();
  if (!db || !db.objectStoreNames.contains(storeName)) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const idx = store.index('by_projectId');
      const req = idx.getAllKeys(projectId);
      req.onsuccess = () => {
        const keys = Array.isArray(req.result) ? req.result : [];
        for (const k of keys) {
          store.delete(k);
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function deleteTimelapseStoresForProject(
  projectId: string,
): Promise<void> {
  await Promise.all([
    idbDelete(STORE_TIMELAPSE_META, projectId),
    idbDeleteByProjectIndex(STORE_TIMELAPSE_STEPS, projectId),
    idbDeleteByProjectIndex(STORE_TIMELAPSE_BLOBS, projectId),
  ]);
}

export async function copyTimelapseStoresForProject(
  sourceProjectId: string,
  targetProjectId: string,
): Promise<void> {
  if (!sourceProjectId || !targetProjectId || sourceProjectId === targetProjectId) {
    return;
  }
  const db = await openProjectsDb();
  if (!db) return;

  const [meta, steps, blobs] = await Promise.all([
    idbGet<Record<string, unknown>>(STORE_TIMELAPSE_META, sourceProjectId),
    idbGetByProjectIndex<Record<string, unknown>>(
      STORE_TIMELAPSE_STEPS,
      sourceProjectId,
    ),
    idbGetByProjectIndex<Record<string, unknown>>(
      STORE_TIMELAPSE_BLOBS,
      sourceProjectId,
    ),
  ]);

  if (!meta && steps.length === 0 && blobs.length === 0) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(
        [STORE_TIMELAPSE_META, STORE_TIMELAPSE_STEPS, STORE_TIMELAPSE_BLOBS],
        'readwrite',
      );
      if (meta) {
        tx.objectStore(STORE_TIMELAPSE_META).put({
          ...meta,
          projectId: targetProjectId,
          updatedAt: Date.now(),
        });
      }
      const stepsStore = tx.objectStore(STORE_TIMELAPSE_STEPS);
      const sourcePrefix = `${sourceProjectId}::`;
      for (const s of steps) {
        const oldId = typeof s.id === 'string' ? s.id : '';
        const suffix = oldId.startsWith(sourcePrefix)
          ? oldId.slice(sourcePrefix.length)
          : String(s.seq ?? Date.now());
        stepsStore.put({
          ...s,
          id: `${targetProjectId}::${suffix}`,
          projectId: targetProjectId,
        });
      }
      const blobsStore = tx.objectStore(STORE_TIMELAPSE_BLOBS);
      for (const b of blobs) {
        const oldId = typeof b.id === 'string' ? b.id : '';
        const suffix = oldId.startsWith(sourcePrefix)
          ? oldId.slice(sourcePrefix.length)
          : typeof b.hash === 'string'
            ? b.hash
            : oldId;
        blobsStore.put({
          ...b,
          id: `${targetProjectId}::${suffix}`,
          projectId: targetProjectId,
        });
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

/* ============================================================================
 * Cross-Platform Storage Adapter (Web IndexedDB + LocalStorage Mirror)
 * ========================================================================== */

class WebProjectStorageAdapter implements ProjectStorageAdapter {
  async listProjects(): Promise<ProjectSummary[]> {
    const [idbProjects, idbThumbs, recoveryIds] = await Promise.all([
      idbGetAll<ProjectData>(STORE_PROJECTS),
      idbGetAll<ThumbnailRecord>(STORE_THUMBNAILS),
      idbGetAllKeys(STORE_RECOVERY),
    ]);

    const thumbMap = new Map<string, string>();
    for (const t of idbThumbs) {
      if (t?.projectId && t?.dataUrl) {
        thumbMap.set(t.projectId, t.dataUrl);
      }
    }

    const recoverySet = new Set<string>(recoveryIds);
    const localList = listSavedProjects();
    const byId = new Map<string, ProjectSummary>();

    for (const ls of localList) {
      byId.set(ls.id, {
        ...ls,
        thumbnailDataUrl: thumbMap.get(ls.id) ?? ls.thumbnailDataUrl ?? null,
        hasRecoveryDraft: recoverySet.has(ls.id),
      });
    }

    for (const rawProj of idbProjects) {
      const normalized = normalizeProjectHierarchy(rawProj);
      if (!normalized) continue;
      const summary = summarizeProject(normalized, recoverySet.has(normalized.id));
      const hydratedThumb =
        thumbMap.get(normalized.id) ?? normalized.thumbnailDataUrl ?? null;
      const existing = byId.get(normalized.id);
      if (!existing || summary.updatedAt >= existing.updatedAt) {
        byId.set(normalized.id, {
          ...summary,
          thumbnailDataUrl: hydratedThumb ?? existing?.thumbnailDataUrl ?? null,
        });
      }
    }

    const merged = Array.from(byId.values()).sort(
      (a, b) => b.updatedAt - a.updatedAt,
    );
    writeSummaryIndex(merged);
    return merged;
  }

  async saveProject(
    project: ProjectData,
    options?: {
      thumbnailDataUrl?: string | null;
      createBackup?: boolean;
    },
  ): Promise<SaveOperationResult> {
    const now = Date.now();
    const nextThumb =
      options?.thumbnailDataUrl !== undefined
        ? options.thumbnailDataUrl
        : project.thumbnailDataUrl ?? null;

    const updated: ProjectData = {
      ...project,
      version: 2,
      coordinateSystem: 'z-up',
      updatedAt: now,
      ...(nextThumb !== null
        ? {
            thumbnailDataUrl: nextThumb,
            thumbnailUpdatedAt: now,
          }
        : {}),
    };

    const db = await openProjectsDb();

    if (db && options?.createBackup !== false) {
      const existing = await idbGet<ProjectData>(STORE_PROJECTS, updated.id);
      if (existing) {
        const backupRecord: ProjectRecoveryRecord = {
          projectId: updated.id,
          savedAt: existing.updatedAt ?? now,
          reason: 'backup',
          project: existing,
          thumbnailDataUrl: existing.thumbnailDataUrl ?? null,
        };
        await idbPut(STORE_BACKUPS, backupRecord);
      }
    }

    let idbSaved = false;
    let idbFailure: SaveOperationResult | null = null;

    if (db) {
      const putRes = await idbPut(STORE_PROJECTS, updated);
      if (!putRes.ok) {
        idbFailure = {
          ok: false,
          error: putRes.error ?? 'Error al guardar el proyecto en IndexedDB.',
          quotaExceeded: putRes.quotaExceeded,
        };
      } else {
        idbSaved = true;
        if (nextThumb) {
          await idbPut(STORE_THUMBNAILS, {
            projectId: updated.id,
            dataUrl: nextThumb,
            updatedAt: now,
          } satisfies ThumbnailRecord);
        }
      }
    }

    // Mirror to localStorage (keep compact if payload is large; never drop authoritative IDB)
    const lsAttempt = safeStorageSet(
      `${PROJECT_PREFIX}${updated.id}`,
      JSON.stringify(updated),
    );
    if (!lsAttempt.ok && idbSaved) {
      // Clear stale localStorage blob so IDB remains authoritative
      safeStorageRemove(`${PROJECT_PREFIX}${updated.id}`);
    }

    if (!idbSaved && !lsAttempt.ok) {
      return (
        idbFailure ?? {
          ok: false,
          error: lsAttempt.error ?? 'No se pudo guardar el proyecto.',
          quotaExceeded: lsAttempt.quotaExceeded,
        }
      );
    }

    // If IDB explicitly failed (e.g. quota exceeded) while project did not fit safely
    if (idbFailure && !lsAttempt.ok) {
      return idbFailure;
    }

    safeStorageSet(ACTIVE_PROJECT_KEY, updated.id);
    const nextSummary = summarizeProject(updated, false);
    const existingList = listSavedProjects().filter((p) => p.id !== updated.id);
    writeSummaryIndex([nextSummary, ...existingList]);

    return {
      ok: true,
      project: updated,
    };
  }

  async loadProject(projectId: string): Promise<ProjectData | null> {
    const [fromIdb, thumbRec] = await Promise.all([
      idbGet<ProjectData>(STORE_PROJECTS, projectId),
      idbGet<ThumbnailRecord>(STORE_THUMBNAILS, projectId),
    ]);

    const normalizedIdb = fromIdb ? normalizeProjectHierarchy(fromIdb) : null;
    const fromLs = loadProjectLocally(projectId);

    let chosen: ProjectData | null = null;
    if (normalizedIdb && fromLs) {
      chosen =
        normalizedIdb.updatedAt >= fromLs.updatedAt ? normalizedIdb : fromLs;
    } else {
      chosen = normalizedIdb ?? fromLs;
    }

    if (!chosen) return null;

    if (!chosen.thumbnailDataUrl && thumbRec?.dataUrl) {
      chosen = {
        ...chosen,
        thumbnailDataUrl: thumbRec.dataUrl,
        thumbnailUpdatedAt: thumbRec.updatedAt,
      };
    }

    safeStorageSet(ACTIVE_PROJECT_KEY, projectId);
    return chosen;
  }

  async loadBackupProject(projectId: string): Promise<ProjectData | null> {
    const rec = await idbGet<ProjectRecoveryRecord>(STORE_BACKUPS, projectId);
    if (!rec?.project) return null;
    return normalizeProjectHierarchy(rec.project);
  }

  async deleteProjects(
    projectIds: string[],
  ): Promise<{ ok: boolean; error?: string }> {
    const idSet = new Set(projectIds);
    for (const id of idSet) {
      safeStorageRemove(`${PROJECT_PREFIX}${id}`);
      safeStorageRemove(`${RECOVERY_PREFIX}${id}`);
      if (safeStorageGet(ACTIVE_PROJECT_KEY) === id) {
        safeStorageRemove(ACTIVE_PROJECT_KEY);
      }
      await Promise.all([
        idbDelete(STORE_PROJECTS, id),
        idbDelete(STORE_THUMBNAILS, id),
        idbDelete(STORE_RECOVERY, id),
        idbDelete(STORE_BACKUPS, id),
        deleteTimelapseStoresForProject(id),
      ]);
    }
    const remaining = listSavedProjects().filter((p) => !idSet.has(p.id));
    writeSummaryIndex(remaining);
    return { ok: true };
  }

  async listFolders(): Promise<ProjectFolder[]> {
    const [idbFolders, lsFolders] = [
      await idbGetAll<ProjectFolder>(STORE_FOLDERS),
      listFoldersLocally(),
    ];
    const map = new Map<string, ProjectFolder>();
    for (const f of lsFolders) map.set(f.id, f);
    for (const f of idbFolders) {
      if (f && typeof f.id === 'string' && typeof f.name === 'string') {
        const prev = map.get(f.id);
        if (!prev || f.updatedAt >= prev.updatedAt) {
          map.set(f.id, f);
        }
      }
    }
    const merged = Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name, 'es'),
    );
    writeFoldersLocally(merged);
    return merged;
  }

  async saveFolder(folder: ProjectFolder): Promise<{ ok: boolean; error?: string }> {
    const db = await openProjectsDb();
    if (db) {
      const res = await idbPut(STORE_FOLDERS, folder);
      if (!res.ok) {
        return { ok: false, error: res.error };
      }
    }
    const next = listFoldersLocally().filter((f) => f.id !== folder.id);
    next.push(folder);
    next.sort((a, b) => a.name.localeCompare(b.name, 'es'));
    writeFoldersLocally(next);
    return { ok: true };
  }

  async deleteFolder(
    folderId: string,
    resolution: DeleteFolderResolution,
  ): Promise<{ ok: boolean; error?: string }> {
    const targetFolderId =
      resolution.mode === 'move' && resolution.targetFolderId !== folderId
        ? resolution.targetFolderId
        : null;

    // Safely reassign all projects belonging to the deleted folder before removing it
    const summaries = await this.listProjects();
    const affected = summaries.filter((p) => p.folderId === folderId);
    for (const summary of affected) {
      const full = await this.loadProject(summary.id);
      if (full) {
        const updatedProj: ProjectData = {
          ...full,
          folderId: targetFolderId,
        };
        if (await openProjectsDb()) {
          await idbPut(STORE_PROJECTS, updatedProj);
        }
        safeStorageSet(
          `${PROJECT_PREFIX}${updatedProj.id}`,
          JSON.stringify(updatedProj),
        );
      }
    }

    const updatedIndex = listSavedProjects().map((s) =>
      s.folderId === folderId ? { ...s, folderId: targetFolderId } : s,
    );
    writeSummaryIndex(updatedIndex);

    await idbDelete(STORE_FOLDERS, folderId);
    writeFoldersLocally(listFoldersLocally().filter((f) => f.id !== folderId));
    return { ok: true };
  }

  async saveRecoveryDraft(
    project: ProjectData,
    thumbnailDataUrl?: string | null,
  ): Promise<void> {
    const rec: ProjectRecoveryRecord = {
      projectId: project.id,
      savedAt: Date.now(),
      reason: 'autosave',
      project,
      thumbnailDataUrl:
        thumbnailDataUrl !== undefined
          ? thumbnailDataUrl
          : project.thumbnailDataUrl ?? null,
    };
    await idbPut(STORE_RECOVERY, rec);
    // Lightweight localStorage mirror when size allows
    safeStorageSet(`${RECOVERY_PREFIX}${project.id}`, JSON.stringify(rec));
  }

  async loadRecoveryDraft(
    projectId: string,
  ): Promise<ProjectRecoveryRecord | null> {
    const fromIdb = await idbGet<ProjectRecoveryRecord>(STORE_RECOVERY, projectId);
    let fromLs: ProjectRecoveryRecord | null = null;
    try {
      const raw = safeStorageGet(`${RECOVERY_PREFIX}${projectId}`);
      if (raw) fromLs = JSON.parse(raw) as ProjectRecoveryRecord;
    } catch {
      fromLs = null;
    }

    const chosen =
      fromIdb && fromLs
        ? fromIdb.savedAt >= fromLs.savedAt
          ? fromIdb
          : fromLs
        : fromIdb ?? fromLs;

    if (!chosen?.project) return null;
    const normalized = normalizeProjectHierarchy(chosen.project);
    if (!normalized) return null;
    return {
      ...chosen,
      project: normalized,
    };
  }

  async clearRecoveryDraft(projectId: string): Promise<void> {
    safeStorageRemove(`${RECOVERY_PREFIX}${projectId}`);
    await idbDelete(STORE_RECOVERY, projectId);
  }

  async listRecoveryProjectIds(): Promise<string[]> {
    const ids = new Set<string>(await idbGetAllKeys(STORE_RECOVERY));
    try {
      if (typeof localStorage !== 'undefined') {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(RECOVERY_PREFIX)) {
            ids.add(key.slice(RECOVERY_PREFIX.length));
          }
        }
      }
    } catch {
      // Ignore
    }
    return Array.from(ids);
  }
}

export const projectStorage: ProjectStorageAdapter =
  new WebProjectStorageAdapter();

/* ============================================================================
 * High-level Project & Folder Management API
 * ========================================================================== */

export async function listSavedProjectsAsync(): Promise<ProjectSummary[]> {
  return projectStorage.listProjects();
}

export async function saveProjectAsync(
  project: ProjectData,
  options?: {
    thumbnailDataUrl?: string | null;
    createBackup?: boolean;
  },
): Promise<SaveOperationResult> {
  return projectStorage.saveProject(project, options);
}

export async function loadProjectFromAnyStorage(
  projectId: string,
): Promise<ProjectData | null> {
  return projectStorage.loadProject(projectId);
}

export async function renameSavedProjectAsync(
  projectId: string,
  newName: string,
): Promise<SaveOperationResult> {
  const trimmed = newName.trim();
  if (!trimmed) {
    return { ok: false, error: 'El nombre del proyecto no puede estar vacío.' };
  }
  const loaded = await projectStorage.loadProject(projectId);
  if (!loaded) {
    return { ok: false, error: 'No se encontró el proyecto para renombrar.' };
  }
  return projectStorage.saveProject(
    { ...loaded, name: trimmed },
    { createBackup: false },
  );
}

export async function duplicateSavedProjectAsync(
  projectId: string,
  newName?: string,
): Promise<SaveOperationResult> {
  const loaded = await projectStorage.loadProject(projectId);
  if (!loaded) {
    return { ok: false, error: 'No se encontró el proyecto para duplicar.' };
  }
  const cloned = cloneProjectForDuplicate(loaded, newName);
  const res = await projectStorage.saveProject(cloned, {
    thumbnailDataUrl: cloned.thumbnailDataUrl ?? null,
    createBackup: false,
  });
  if (res.ok && res.project) {
    await copyTimelapseStoresForProject(loaded.id, res.project.id);
  }
  return res;
}

export async function moveProjectsToFolderAsync(
  projectIds: string[],
  folderId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  for (const id of projectIds) {
    const loaded = await projectStorage.loadProject(id);
    if (!loaded) continue;
    const res = await projectStorage.saveProject(
      { ...loaded, folderId },
      { createBackup: false },
    );
    if (!res.ok) {
      return { ok: false, error: res.error };
    }
  }
  return { ok: true };
}

export async function deleteProjectsAsync(
  projectIds: string[],
): Promise<{ ok: boolean; error?: string }> {
  return projectStorage.deleteProjects(projectIds);
}

export async function listProjectFoldersAsync(): Promise<ProjectFolder[]> {
  return projectStorage.listFolders();
}

export async function createProjectFolderAsync(
  name: string,
): Promise<{ ok: boolean; folder?: ProjectFolder; error?: string }> {
  const trimmed = name.trim();
  if (!trimmed) {
    return { ok: false, error: 'El nombre de la carpeta no puede estar vacío.' };
  }
  const now = Date.now();
  const folder: ProjectFolder = {
    id: generateId('fld'),
    name: trimmed,
    createdAt: now,
    updatedAt: now,
  };
  const res = await projectStorage.saveFolder(folder);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, folder };
}

export async function renameProjectFolderAsync(
  folderId: string,
  newName: string,
): Promise<{ ok: boolean; folder?: ProjectFolder; error?: string }> {
  const trimmed = newName.trim();
  if (!trimmed) {
    return { ok: false, error: 'El nombre de la carpeta no puede estar vacío.' };
  }
  const folders = await projectStorage.listFolders();
  const target = folders.find((f) => f.id === folderId);
  if (!target) {
    return { ok: false, error: 'Carpeta no encontrada.' };
  }
  const updated: ProjectFolder = {
    ...target,
    name: trimmed,
    updatedAt: Date.now(),
  };
  const res = await projectStorage.saveFolder(updated);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, folder: updated };
}

export async function deleteProjectFolderAsync(
  folderId: string,
  resolution: DeleteFolderResolution = { mode: 'unfile' },
): Promise<{ ok: boolean; error?: string }> {
  return projectStorage.deleteFolder(folderId, resolution);
}

export async function saveRecoveryDraftAsync(
  project: ProjectData,
  thumbnailDataUrl?: string | null,
): Promise<void> {
  return projectStorage.saveRecoveryDraft(project, thumbnailDataUrl);
}

export async function loadRecoveryDraftAsync(
  projectId: string,
): Promise<ProjectRecoveryRecord | null> {
  return projectStorage.loadRecoveryDraft(projectId);
}

export async function clearRecoveryDraftAsync(projectId: string): Promise<void> {
  return projectStorage.clearRecoveryDraft(projectId);
}

export async function listRecoveryProjectIdsAsync(): Promise<string[]> {
  return projectStorage.listRecoveryProjectIds();
}

export async function loadProjectFromIndexedDb(
  projectId: string,
): Promise<ProjectData | null> {
  const raw = await idbGet<ProjectData>(STORE_PROJECTS, projectId);
  return raw ? normalizeProjectHierarchy(raw) : null;
}

/* ============================================================================
 * Synchronous Backwards-Compatible Wrappers
 * ========================================================================== */

export function saveProjectLocally(project: ProjectData): ProjectData {
  const updated: ProjectData = {
    ...project,
    version: 2,
    coordinateSystem: 'z-up',
    updatedAt: Date.now(),
  };

  const lsRes = safeStorageSet(
    `${PROJECT_PREFIX}${updated.id}`,
    JSON.stringify(updated),
  );
  if (!lsRes.ok) {
    safeStorageRemove(`${PROJECT_PREFIX}${updated.id}`);
  }

  void projectStorage.saveProject(updated, { createBackup: true });

  safeStorageSet(ACTIVE_PROJECT_KEY, updated.id);
  const summary = summarizeProject(updated, false);
  const index = listSavedProjects().filter((p) => p.id !== updated.id);
  writeSummaryIndex([summary, ...index]);

  return updated;
}

export function loadProjectLocally(projectId: string): ProjectData | null {
  try {
    const raw = safeStorageGet(`${PROJECT_PREFIX}${projectId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    const normalized = normalizeProjectHierarchy(parsed);
    if (!normalized) return null;
    safeStorageSet(ACTIVE_PROJECT_KEY, projectId);
    return normalized;
  } catch {
    return null;
  }
}

export function deleteProjectLocally(projectId: string): void {
  safeStorageRemove(`${PROJECT_PREFIX}${projectId}`);
  safeStorageRemove(`${RECOVERY_PREFIX}${projectId}`);
  void projectStorage.deleteProjects([projectId]);
  const index = listSavedProjects().filter((p) => p.id !== projectId);
  writeSummaryIndex(index);
  if (safeStorageGet(ACTIVE_PROJECT_KEY) === projectId) {
    safeStorageRemove(ACTIVE_PROJECT_KEY);
  }
}

export function getActiveStoredProjectId(): string | null {
  return safeStorageGet(ACTIVE_PROJECT_KEY);
}

export function loadInitialProject(): ProjectData {
  const activeId = safeStorageGet(ACTIVE_PROJECT_KEY);
  if (activeId) {
    const loaded = loadProjectLocally(activeId);
    if (loaded) return loaded;
  }
  const list = listSavedProjects();
  if (list.length > 0) {
    const loaded = loadProjectLocally(list[0].id);
    if (loaded) return loaded;
  }
  return createNewProject('Cubo Inicial', 'cube');
}
