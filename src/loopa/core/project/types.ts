import { SerializedEditableMesh, Vec3 } from '../mesh/EditableMesh';
import { PrimitiveType } from '../mesh/primitives';
import {
  ProportionalEditingSettings,
  ProportionalFalloff,
} from '../mesh/proportionalEditing';
import {
  RadialMenuLayouts,
  RadialSlotList,
  WorkspaceToolRadialLayouts,
} from '../radial/radialActions';

export type {
  ProportionalEditingSettings,
  ProportionalFalloff,
} from '../mesh/proportionalEditing';

export type WorkMode = 'object' | 'edit' | 'sculpt';
export type TransformTool = 'select' | 'move' | 'rotate' | 'scale' | 'all';
export type GizmoTransformMode = 'move' | 'rotate' | 'scale' | 'all';
export type MoveSubMode = 'free' | 'axis' | 'slide';
export type AxisConstraint = 'free' | 'x' | 'y' | 'z';
export type CameraProjection = 'perspective' | 'orthographic';
export type OrthoViewId =
  | 'front'
  | 'back'
  | 'right'
  | 'left'
  | 'top'
  | 'bottom';

export const ORTHO_VIEW_LABELS: Record<OrthoViewId, string> = {
  front: 'Frontal',
  back: 'Trasera',
  right: 'Derecha',
  left: 'Izquierda',
  top: 'Superior',
  bottom: 'Inferior',
};

export interface ObjectTransform {
  position: Vec3;
  rotation: Vec3; // Euler radians [x, y, z]
  scale: Vec3;
}

export interface ObjectTransformChange {
  id: string;
  before: ObjectTransform;
  after: ObjectTransform;
}

import type { ModifierSlot } from '../modifiers/types';
export type { ModifierSlot, ModifierType } from '../modifiers/types';

export type ObjectShadingMode = 'flat' | 'smooth';

export interface MaterialSlot {
  color: string;
  roughness: number;
  metalness: number;
}

export interface MaterialAsset {
  id: string;
  name: string;
  baseColor: string;
  metallic: number;
  roughness: number;
  opacity?: number;
  emissiveColor?: string;
  emissiveIntensity?: number;
  textureName?: string;
  textureDataUrl?: string;
}

export type SceneObjectType =
  | 'mesh'
  | 'camera'
  | 'light'
  | 'empty'
  | 'reference_image';

export type ReferenceImageOrientation =
  | 'front'
  | 'back'
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'free';

export type ReferenceImageDepthMode = 'back' | 'front';

export interface ReferenceImageData {
  imageDataUrl: string;
  fileName: string;
  mimeType: string;
  naturalWidth: number;
  naturalHeight: number;
  opacity: number;
  orientation: ReferenceImageOrientation;
  depthMode: ReferenceImageDepthMode;
  aspectRatio: number;
}

export type LightType = 'point';

export interface LightData {
  lightType: LightType;
  color: string;
  intensity: number;
  distance: number;
  enabled: boolean;
  showIcon: boolean;
}

export type SculptBrushType =
  | 'draw'
  | 'smooth'
  | 'grab'
  | 'clay'
  | 'inflate'
  | 'crease'
  | 'flatten'
  | 'pinch'
  | 'draw_sharp'
  | 'clay_strips';

export interface SculptSymmetryAxes {
  x: boolean;
  y: boolean;
  z: boolean;
}

export interface SculptSettings {
  brush: SculptBrushType;
  radius: number;
  strength: number;
  invert: boolean;
  symmetry: SculptSymmetryAxes;
  strokeSmoothing: number;
}

export interface SceneObjectData {
  id: string;
  name: string;
  objectType: SceneObjectType;
  primitiveType: PrimitiveType | 'custom';
  collectionId: string;
  visible: boolean;
  locked: boolean;
  transform: ObjectTransform;
  mesh: SerializedEditableMesh;
  material: MaterialSlot;
  materialId?: string;
  shading?: ObjectShadingMode;
  modifiers: ModifierSlot[];
  referenceImage?: ReferenceImageData;
  light?: LightData;
}

export interface CollectionData {
  id: string;
  name: string;
  sceneId: string;
  parentId: string | null;
  expanded: boolean;
}

export interface SceneData {
  id: string;
  name: string;
  activeCollectionId: string;
  collections: CollectionData[];
  objects: SceneObjectData[];
}

export type ProjectTemplateId = 'empty' | 'cube' | 'uv_sphere' | 'plane';

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';

export type ProjectSortBy =
  | 'updated_desc'
  | 'created_desc'
  | 'name_asc'
  | 'updated_asc';

export type GalleryViewMode = 'grid' | 'list';

export interface ProjectFolder {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectData {
  version: number;
  coordinateSystem?: 'z-up' | 'y-up';
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt?: number;
  folderId?: string | null;
  templateId?: ProjectTemplateId;
  thumbnailDataUrl?: string | null;
  thumbnailUpdatedAt?: number;
  activeSceneId: string;
  materials?: MaterialAsset[];
  scenes: SceneData[];
}

export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt?: number;
  objectCount: number;
  folderId: string | null;
  thumbnailDataUrl?: string | null;
  hasRecoveryDraft?: boolean;
}

export interface ProjectRecoveryRecord {
  projectId: string;
  savedAt: number;
  reason: 'autosave' | 'backup';
  project: ProjectData;
  thumbnailDataUrl?: string | null;
}

export interface NativeProjectFileEnvelope {
  format: 'forma3d-project';
  formatVersion: 1;
  exportedAt: number;
  folderName?: string | null;
  thumbnailDataUrl?: string | null;
  project: ProjectData;
}

export interface SaveOperationResult {
  ok: boolean;
  project?: ProjectData;
  error?: string;
  quotaExceeded?: boolean;
}

export type DeleteFolderResolution =
  | { mode: 'unfile' }
  | { mode: 'move'; targetFolderId: string };

export interface ProjectStorageAdapter {
  listProjects(): Promise<ProjectSummary[]>;
  saveProject(
    project: ProjectData,
    options?: {
      thumbnailDataUrl?: string | null;
      createBackup?: boolean;
    },
  ): Promise<SaveOperationResult>;
  loadProject(projectId: string): Promise<ProjectData | null>;
  loadBackupProject(projectId: string): Promise<ProjectData | null>;
  deleteProjects(projectIds: string[]): Promise<{ ok: boolean; error?: string }>;
  listFolders(): Promise<ProjectFolder[]>;
  saveFolder(folder: ProjectFolder): Promise<{ ok: boolean; error?: string }>;
  deleteFolder(
    folderId: string,
    resolution: DeleteFolderResolution,
  ): Promise<{ ok: boolean; error?: string }>;
  saveRecoveryDraft(
    project: ProjectData,
    thumbnailDataUrl?: string | null,
  ): Promise<void>;
  loadRecoveryDraft(projectId: string): Promise<ProjectRecoveryRecord | null>;
  clearRecoveryDraft(projectId: string): Promise<void>;
  listRecoveryProjectIds(): Promise<string[]>;
}

export type FloatingMenuCorner =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

export type FloatingMenuSize = 'small' | 'medium' | 'large';

export type TouchModifierKey = 'shift' | 'ctrl' | 'alt';

export type TouchModifierBehaviorMode = 'toggle' | 'hold';

export type TouchModifierState = Record<TouchModifierKey, boolean>;

export interface TouchModifierSlotConfig {
  enabled: boolean;
  twoFingerHold: boolean;
  showScreenButton: boolean;
}

export type TouchModifierSettings = Record<
  TouchModifierKey,
  TouchModifierSlotConfig
>;

export interface TouchControlSettings {
  oneFingerOrbit: boolean;
  oneFingerTapSelect: boolean;
  doubleTapBoxSelect: boolean;
  doubleTapIntervalMs: number;
  twoFingerPinchZoom: boolean;
  twoFingerPan: boolean;
  twoFingerUndo: boolean;
  threeFingerRedo: boolean;
  longPressContextMenu: boolean;
  floatingMenuEnabled: boolean;
  floatingMenuCorner: FloatingMenuCorner;
  floatingMenuSize: FloatingMenuSize;
  floatingMenuCustomPos: { xPct: number; yPct: number } | null;
  barhomeFloatingMenuCustomPos: { xPct: number; yPct: number } | null;
  modifierPanelEnabled: boolean;
  modifierPanelMode: TouchModifierBehaviorMode;
  modifiers: TouchModifierSettings;
  radialLayouts: RadialMenuLayouts;
  barhomeRadialLayout: RadialSlotList;
  workspaceToolRadialLayouts: WorkspaceToolRadialLayouts;
}

export type ViewportDisplayMode = 'wireframe' | 'solid' | 'xray' | 'material';

export type ExtrudeDefaultAxis = 'normal' | 'x' | 'y' | 'z';

export interface ToolConfigurations {
  extrude: {
    defaultDistance: number;
    defaultAxis: ExtrudeDefaultAxis;
    defaultIndividual: boolean;
  };
  bevel: {
    defaultWidth: number;
    defaultSegments: number;
    defaultProfile: number;
    defaultClampOverlap: boolean;
  };
  subdivide: {
    defaultCuts: number;
    defaultSmoothness: number;
    defaultFractal: number;
  };
  inset: {
    defaultThickness: number;
    defaultDepth: number;
    defaultIndividual: boolean;
  };
  loopCut: {
    defaultCuts: number;
    defaultSlide: number;
  };
  mergeByDistance: {
    defaultDistance: number;
  };
  dissolveLimited: {
    defaultMaxAngleDeg: number;
    defaultDissolveVertices: boolean;
  };
  move: {
    defaultSubMode: MoveSubMode;
  };
}

export type ConfigurableToolKey = keyof ToolConfigurations;

export interface ModelerSettings {
  displayMode: ViewportDisplayMode;
  xrayTransparency: number;
  showFaceOrientation?: boolean;
  showGrid: boolean;
  showAxes: boolean;
  xrayEditMode: boolean;
  gizmoSize: number;
  snapEnabled: boolean;
  snapTranslateStep: number;
  snapRotateDeg: number;
  snapScaleStep: number;
  multiSelectTouch: boolean;
  autosaveEnabled: boolean;
  autosaveIntervalSec: number;
  createRecoveryBackups: boolean;
  proportionalEditing: ProportionalEditingSettings;
  touch: TouchControlSettings;
  toolConfigs: ToolConfigurations;
  timelapseAutoRecord: boolean;
  timelapseRecordCamera: boolean;
  timelapseIncludeCameraInPlayback: boolean;
}

