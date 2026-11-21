import { SerializedEditableMesh, Vec3 } from '../mesh/EditableMesh';
import {
  CameraProjection,
  MaterialAsset,
  MaterialSlot,
  ModifierSlot,
  ObjectShadingMode,
  ObjectTransform,
  ReferenceImageDepthMode,
  ReferenceImageOrientation,
  SceneObjectType,
  ViewportDisplayMode,
} from '../project/types';
import { PrimitiveType } from '../mesh/primitives';

export interface TimelapseCameraState {
  position: Vec3;
  target: Vec3;
  projection: CameraProjection;
  orthoHeight: number;
}

export type TimelapseStepKind = 'baseline' | 'model' | 'camera';

export interface TimelapseReferenceImageSnapshot {
  refImageHash: string;
  fileName: string;
  mimeType: string;
  naturalWidth: number;
  naturalHeight: number;
  opacity: number;
  orientation: ReferenceImageOrientation;
  depthMode: ReferenceImageDepthMode;
  aspectRatio: number;
}

export interface TimelapseObjectSnapshot {
  id: string;
  name: string;
  objectType: SceneObjectType;
  primitiveType: PrimitiveType | 'custom';
  collectionId: string;
  visible: boolean;
  locked: boolean;
  transform: ObjectTransform;
  meshHash?: string;
  material: MaterialSlot;
  materialId?: string;
  shading?: ObjectShadingMode;
  modifiers: ModifierSlot[];
  referenceImage?: TimelapseReferenceImageSnapshot;
}

export interface TimelapseSceneSnapshot {
  activeSceneId: string;
  materials: MaterialAsset[];
  objects: TimelapseObjectSnapshot[];
}

export interface TimelapseStep {
  id: string;
  projectId: string;
  seq: number;
  timestamp: number;
  kind: TimelapseStepKind;
  opType: string;
  label: string;
  camera: TimelapseCameraState;
  scene?: TimelapseSceneSnapshot;
}

export interface TimelapseProjectMeta {
  projectId: string;
  enabled: boolean;
  paused: boolean;
  stepCount: number;
  modelStepCount: number;
  cameraStepCount: number;
  nextSeq: number;
  lastCameraPose: TimelapseCameraState | null;
  totalEstimatedBytes: number;
  createdAt: number;
  updatedAt: number;
}

export interface HydratedTimelapseFrame {
  step: TimelapseStep;
  materials: MaterialAsset[];
  objects: HydratedTimelapseObject[];
  camera: TimelapseCameraState;
}

export interface HydratedTimelapseObject {
  id: string;
  name: string;
  objectType: SceneObjectType;
  primitiveType: PrimitiveType | 'custom';
  collectionId: string;
  visible: boolean;
  locked: boolean;
  transform: ObjectTransform;
  mesh: SerializedEditableMesh;
  meshHash?: string;
  material: MaterialSlot;
  materialId?: string;
  shading?: ObjectShadingMode;
  modifiers: ModifierSlot[];
  referenceImage?: {
    imageDataUrl: string;
    refImageHash: string;
    fileName: string;
    mimeType: string;
    naturalWidth: number;
    naturalHeight: number;
    opacity: number;
    orientation: ReferenceImageOrientation;
    depthMode: ReferenceImageDepthMode;
    aspectRatio: number;
  };
}

export type TimelapseBlobKind = 'mesh' | 'ref_image';

export interface TimelapseBlobRecord {
  id: string; // `${projectId}::${hash}`
  projectId: string;
  hash: string;
  kind: TimelapseBlobKind;
  compressed: boolean;
  byteLength: number;
  payload: Uint8Array | string;
}

export type TimelapseResolutionPresetId =
  | 'square_1080'
  | 'portrait_1080x1920'
  | 'hd_720p'
  | 'fhd_1080p';

export interface TimelapseResolutionPreset {
  id: TimelapseResolutionPresetId;
  label: string;
  subtitle: string;
  width: number;
  height: number;
}

export const TIMELAPSE_RESOLUTION_PRESETS: TimelapseResolutionPreset[] = [
  {
    id: 'square_1080',
    label: '1080 × 1080',
    subtitle: 'Cuadrado (1:1 · Instagram / Feeds)',
    width: 1080,
    height: 1080,
  },
  {
    id: 'portrait_1080x1920',
    label: '1080 × 1920',
    subtitle: 'Vertical (9:16 · Reels / TikTok / Shorts)',
    width: 1080,
    height: 1920,
  },
  {
    id: 'hd_720p',
    label: '1280 × 720',
    subtitle: 'HD (16:9 · Ligero y rápido)',
    width: 1280,
    height: 720,
  },
  {
    id: 'fhd_1080p',
    label: '1920 × 1080',
    subtitle: 'Full HD (16:9 · YouTube / Escritorio)',
    width: 1920,
    height: 1080,
  },
];

export type TimelapseExportMode = 'full' | 'summary';

export interface TimelapseExportOptions {
  projectId: string;
  projectName: string;
  steps: TimelapseStep[];
  mode: TimelapseExportMode;
  speed: number;
  includeCamera: boolean;
  resolutionId: TimelapseResolutionPresetId;
  displayMode: ViewportDisplayMode;
  xrayTransparency: number;
  fps?: number;
  signal?: AbortSignal;
  onProgress?: (progress: TimelapseExportProgress) => void;
}

export interface TimelapseExportProgress {
  phase: 'preparing' | 'rendering' | 'muxing';
  ratio: number;
  currentFrame: number;
  totalFrames: number;
  message: string;
}

export interface TimelapseExportResult {
  blob: Blob;
  mimeType: string;
  filename: string;
  width: number;
  height: number;
  durationSec: number;
  frameCount: number;
  sizeBytes: number;
  backend: 'webcodecs' | 'mediarecorder';
}

export interface Mp4SupportInfo {
  supported: boolean;
  backend: 'webcodecs' | 'mediarecorder' | 'none';
  codecString?: string;
  codecLabel?: string;
  reason?: string;
}
