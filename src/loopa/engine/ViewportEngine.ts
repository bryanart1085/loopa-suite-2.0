import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { EditableMesh, SerializedEditableMesh, Vec3 } from '../core/mesh/EditableMesh';
import {
  EditSelectionMode,
  applyTransformToVertices,
  computeDerivedEditSelection,
} from '../core/mesh/operations';
import {
  DEFAULT_PROPORTIONAL_EDITING_SETTINGS,
  ProportionalDistanceField,
  ProportionalEditingSettings,
  applyProportionalWorldAnchorTransform,
  buildProportionalDistanceField,
  clampProportionalRadius,
  computeProportionalWeights,
  normalizeProportionalSettings,
  sampleProportionalWeightColor,
} from '../core/mesh/proportionalEditing';
import {
  applyEdgeSlide,
  applyParametricVertexSlide,
  buildEdgeSlidePlan,
  buildParametricVertexSlidePlan,
  buildVertexSlidePlan,
  EdgeSlidePlan,
  ParametricVertexSlidePlan,
  VertexSlidePlan,
  VertexSlideRailPair,
} from '../core/mesh/slideTools';
import { encodeProjectThumbnailFromCanvas } from '../core/project/thumbnail';
import {
  DEFAULT_MATERIAL_COLOR,
  DEFAULT_MATERIAL_METALLIC,
  DEFAULT_MATERIAL_ROUGHNESS,
  resolveObjectMaterial,
} from '../core/project/hierarchy';
import {
  EvaluatedMaterialSurface,
  evaluateMaterialNodeGraph,
} from '../core/materials/nodeGraph';
import {
  AxisConstraint,
  CameraProjection,
  LightData,
  MaterialAsset,
  ModelerSettings,
  ObjectShadingMode,
  ObjectTransform,
  ObjectTransformChange,
  SceneObjectData,
  SculptSettings,
  TouchModifierState,
  TransformTool,
  ViewportDisplayMode,
  WorkMode,
} from '../core/project/types';
import {
  DEFAULT_SCULPT_SETTINGS,
  SculptStrokeSession,
  createSculptStrokeSession,
  stepSculptStroke,
} from '../core/mesh/sculptBrushes';
import { DEFAULT_TOUCH_SETTINGS } from '../core/project/storage';
import { TimelapseCameraState } from '../core/timelapse/types';
import {
  buildTransformRefsFromObjects,
  evaluateObjectModifiers,
  hasActiveViewportModifiers,
} from '../core/modifiers/evaluateModifiers';
import { clampVerticesForMirrorClipping } from '../core/modifiers/mirrorModifier';
import { ModifierSlot, ModifierTransformRef, normalizeMirrorParams } from '../core/modifiers/types';
import {
  BoxSelectRect,
  EMPTY_MODIFIER_STATE,
  TouchGestureManager,
  TrackedPointer,
} from './TouchGestureManager';
import {
  isPointInRect2D,
  Rect2D,
  segmentIntersectsRect2D,
  triangleIntersectsRect2D,
} from './boxSelectMath';

export type CameraPreset = 'front' | 'back' | 'top' | 'bottom' | 'right' | 'left' | 'iso' | 'focus';

export type CameraQuaternionTuple = [number, number, number, number];

export function computeCameraPresetOffset(preset: CameraPreset, distance: number): Vec3 {
  const d = Math.max(0.1, distance);
  const topEps = Math.max(1e-4, d * 1e-4);
  switch (preset) {
    case 'front':
      return [0, -d, 0];
    case 'back':
      return [0, d, 0];
    case 'right':
      return [d, 0, 0];
    case 'left':
      return [-d, 0, 0];
    case 'top':
      return [0, -topEps, d];
    case 'bottom':
      return [0, -topEps, -d];
    case 'iso':
    case 'focus':
      return [d * 0.62, -d * 0.68, d * 0.48];
  }
}

export interface ViewportContextInfo {
  clientX: number;
  clientY: number;
  hitObjectId: string | null;
  hitComponentId: string | null;
}

export interface BoxSelectOverlayState {
  left: number;
  top: number;
  width: number;
  height: number;
  matchCount: number;
  additive: boolean;
}

export type ModalGMode = 'move' | 'vertex_slide' | 'edge_slide';

export interface ModalTransformStatus {
  active: boolean;
  mode: ModalGMode;
  label: string;
  deltaText: string;
  clamped?: boolean;
}

export interface ViewportCallbacks {
  onSelectObject: (id: string | null, additive?: boolean) => void;
  onBoxSelectObjects?: (ids: string[], additive: boolean) => void;
  onSelectComponent: (
    id: string | null,
    additive: boolean,
    addOnly?: boolean,
    ctrl?: boolean,
  ) => void;
  onBoxSelectComponents?: (ids: string[], additive: boolean) => void;
  onBoxSelectOverlayChange?: (overlay: BoxSelectOverlayState | null) => void;
  onPickLoopCutEdge: (edgeId: string | null) => void;
  onTwoFingerUndo: () => void;
  onThreeFingerRedo: () => void;
  onOpenContextMenu: (info: ViewportContextInfo) => void;
  onModifierStateChange?: (modifiers: TouchModifierState) => void;
  onAltTap?: () => void;
  onTrackballActiveChange?: (active: boolean) => void;
  onModalTransformStatusChange?: (status: ModalTransformStatus | null) => void;
  onCompleteModalTransform?: (committed: boolean) => void;
  onCameraPoseChange?: (quaternion: CameraQuaternionTuple) => void;
  onCameraMovementCommit?: (
    camera: TimelapseCameraState,
    source: 'orbit' | 'preset' | 'projection',
  ) => void;
  onLiveObjectTransform: (id: string, transform: ObjectTransform) => void;
  onCommitObjectTransform: (id: string, before: ObjectTransform, after: ObjectTransform) => void;
  onCommitObjectTransforms: (changes: ObjectTransformChange[]) => void;
  onCommitMeshEdit: (id: string, before: EditableMesh, after: EditableMesh) => void;
  onCommitSculptStroke?: (id: string, nextMesh: EditableMesh) => void;
  onChangeProportionalRadius?: (radius: number) => void;
  onLoopCutSlideDelta?: (delta: number) => void;
}

interface ObjectVisual {
  id: string;
  objectType: SceneObjectData['objectType'];
  group: THREE.Group;
  solidMesh: THREE.Mesh<
    THREE.BufferGeometry,
    THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[]
  >;
  clayMaterial: THREE.MeshStandardMaterial;
  slotMaterialIds: string[];
  faceOrientationFrontMesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | null;
  faceOrientationBackMesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | null;
  wireEdges: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  selectionOutline?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  baseSolidCollider: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  refPlaneMesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | null;
  refTexture: THREE.Texture | null;
  refImageSrc: string | null;
  pointLight: THREE.PointLight | null;
  lightIconGroup: THREE.Group | null;
  lightPickMesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | null;
  lightWireLines: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial> | null;
  triangleToFaceId: string[];
  faceToTriangleRange: Map<string, { start: number; count: number }>;
  baseTriangleToFaceId: string[];
  baseFaceToTriangleRange: Map<string, { start: number; count: number }>;
  baseEditableMesh: EditableMesh;
  editableMesh: EditableMesh;
  lastMeshData: SerializedEditableMesh | null;
  shading: ObjectShadingMode;
  materialId: string | null;
  modifiers: ModifierSlot[];
  modifiersSignature: string;
  hasActiveModifiers: boolean;
  hasFaces: boolean;
  locked: boolean;
}

const _v0 = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _tbVecCurr = new THREE.Vector3();
const _tbAxis = new THREE.Vector3();
const _zeroVec = new THREE.Vector3(0, 0, 0);
const _oneVec = new THREE.Vector3(1, 1, 1);
const _mat4A = new THREE.Matrix4();
const _mat4B = new THREE.Matrix4();
const _mat4C = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _tbQuat = new THREE.Quaternion();
const _tbQuatStart = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _modalRayHit = new THREE.Vector3();
const _modalCurrPoint = new THREE.Vector3();
const _modalDelta = new THREE.Vector3();
const _modalCamRight = new THREE.Vector3();
const _modalCamUp = new THREE.Vector3();

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

function createVertexDotTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.4, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function distToSegment2D(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): { dist: number; t: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-6) {
    return { dist: Math.hypot(px - ax, py - ay), t: 0 };
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return { dist: Math.hypot(px - cx, py - cy), t };
}

export class ViewportEngine {
  private container: HTMLElement;
  private callbacks: ViewportCallbacks;
  private isSoftwareGl: boolean;

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private perspectiveCamera: THREE.PerspectiveCamera;
  private orthographicCamera: THREE.OrthographicCamera;
  private activeCamera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  private projection: CameraProjection = 'perspective';

  private orbitControls: OrbitControls;
  private scaleGizmoControls: TransformControls;
  private rotateGizmoControls: TransformControls;
  private transformControls: TransformControls;
  private activeDraggingGizmo: TransformControls | null = null;
  private editGizmoAnchor: THREE.Object3D;
  private multiSelectionGizmoPivot = new THREE.Object3D();

  private gridHelper: THREE.GridHelper;
  private axesGroup: THREE.Group;

  private objectsGroup = new THREE.Group();
  private visuals = new Map<string, ObjectVisual>();

  // Edit mode overlays
  private editOverlayGroup = new THREE.Group();
  private editAllEdgesLine: THREE.LineSegments;
  private editSelectedEdgesLine: LineSegments2;
  private editSeamEdgesLine: THREE.LineSegments;
  private slideGuideLines: THREE.LineSegments;
  private editSeamEdgeBars: THREE.InstancedMesh;
  private loopCutPreviewBars: THREE.InstancedMesh;
  private loopCutPreviewPoints: THREE.Points;
  private editSelectedFacesMesh: THREE.Mesh;
  private editUnselectedVerticesPoints: THREE.Points;
  private editSelectedVerticesPoints: THREE.Points;
  private mergeCursorMarker: THREE.LineSegments;
  private proportionalRing: THREE.LineLoop;
  private proportionalRingVisible = false;
  private ngonOverlayGroup = new THREE.Group();
  private ngonHighlightMesh: THREE.Mesh;
  private ngonHighlightEdges: THREE.LineSegments;
  private highlightedNgonObjectId: string | null = null;
  private highlightedNgonFaceIds: string[] = [];
  private vertexDotTexture: THREE.CanvasTexture;

  // State mirrors
  private selectedObjectId: string | null = null;
  private selectedObjectIds = new Set<string>();
  private currentObjectsData = new Map<string, SceneObjectData>();
  private sharedMaterials = new Map<string, THREE.MeshPhysicalMaterial>();
  private sharedMaterialTextures = new Map<
    string,
    Partial<
      Record<
        'map' | 'normalMap' | 'bumpMap',
        { dataUrl: string; texture: THREE.Texture }
      >
    >
  >();
  private materialAssetMap = new Map<string, MaterialAsset>();
  private workMode: WorkMode = 'object';
  private editSelectionMode: EditSelectionMode = 'vertex';
  private selectedComponentIds = new Set<string>();
  private boxSelectPreviewObjectIds = new Set<string>();
  private boxSelectPreviewComponentIds = new Set<string>();
  private isBoxSelectBlocking = false;
  private virtualModifiers: TouchModifierState = { ...EMPTY_MODIFIER_STATE };
  private activeTool: TransformTool = 'move';
  private axisConstraint: AxisConstraint = 'free';
  private settings: ModelerSettings | null = null;
  private proportionalSettings: ProportionalEditingSettings = {
    ...DEFAULT_PROPORTIONAL_EDITING_SETTINGS,
  };
  private proportionalPreviewField: ProportionalDistanceField | null = null;
  private proportionalPreviewSourceMesh: EditableMesh | null = null;
  private proportionalPreviewKey = '';
  private proportionalPreviewWeights = new Map<string, number>();
  private proportionalPreviewRadiusUsed = -1;
  private proportionalPreviewFalloffUsed = '';
  private displayMode: ViewportDisplayMode = 'solid';
  private xrayTransparency = 50;
  private showFaceOrientation = false;
  private editOverlaySourceMesh: EditableMesh | null = null;
  private suppressGizmo = false;
  private loopCutPreviewMode = false;
  private loopCutPreviewSegments: [Vec3, Vec3][] = [];
  private loopCutPreviewRingEdgeIds = new Set<string>();
  private loopCutPreviewFaceIds = new Set<string>();
  private loopCutSlideActive = false;
  private loopCutSlidePointerId: number | null = null;
  private loopCutSlideLastX = 0;

  // Sculpt mode state & 3D brush cursor
  private sculptSettings: SculptSettings = {
    ...DEFAULT_SCULPT_SETTINGS,
    symmetry: { ...DEFAULT_SCULPT_SETTINGS.symmetry },
  };
  private sculptStrokeSession: SculptStrokeSession | null = null;
  private sculptPointerId: number | null = null;
  private sculptGrabPlane = new THREE.Plane();
  private sculptCursorGroup = new THREE.Group();
  private sculptCursorMirrorGroup = new THREE.Group();
  private sculptCursorRing: THREE.LineLoop;
  private sculptCursorCenter: THREE.Mesh;
  private sculptCursorMirrorPoints: THREE.Mesh[] = [];
  private sculptCursorMirrorGeometry: THREE.SphereGeometry;
  private sculptCursorMirrorMaterial: THREE.MeshBasicMaterial;
  private sculptCursorLastWorldPoint: THREE.Vector3 | null = null;
  private sculptCursorLastWorldNormal: THREE.Vector3 | null = null;

  // Drag tracking
  private isGizmoDragging = false;
  private isTrackballDragging = false;
  private trackballMoved = false;
  private trackballStartVec = new THREE.Vector3();
  private trackballStartQuat = new THREE.Quaternion();
  private trackballDeltaQuat = new THREE.Quaternion();
  private modalTransformMode: ModalGMode | null = null;
  private modalTransformCommitOnRelease = true;
  private modalSlideClamp = true;
  private modalCancelNonce = 0;
  private slideSessionBaseMesh: EditableMesh | null = null;
  private slideSessionFactor = 0;
  private modalSlideStartFactor = 0;
  private lastAppliedSlideFactor = 0;
  private slideSessionHasChanges = false;
  private slideSessionVertexSlidePlan: ParametricVertexSlidePlan | null = null;
  private cameraRotationLocked = false;
  private isModalDragging = false;
  private modalMoved = false;
  private modalStartX = 0;
  private modalStartY = 0;
  private modalStartObjPos = new THREE.Vector3();
  private modalDragPlane = new THREE.Plane();
  private modalDragStartPointWorld = new THREE.Vector3();
  private modalAxisDirWorld = new THREE.Vector3();
  private modalLastDeltaWorld = new THREE.Vector3();
  private modalVertexSlidePlan: VertexSlidePlan | null = null;
  private modalParametricVertexSlidePlan: ParametricVertexSlidePlan | null = null;
  private modalVertexSlideAxisLocked = false;
  private modalEdgeSlidePlan: EdgeSlidePlan | null = null;
  private modalSlideAxis2D: {
    dirX: number;
    dirY: number;
    lenPosPx: number;
    lenNegPx: number;
  } | null = null;
  private objectDragStartTransform: ObjectTransform | null = null;
  private multiGizmoTargetIds: string[] = [];
  private multiObjectDragStartTransforms = new Map<string, ObjectTransform>();
  private multiTransformStartPosition = new THREE.Vector3();
  private multiTransformStartQuaternion = new THREE.Quaternion();
  private multiTransformStartScale = new THREE.Vector3(1, 1, 1);
  private editDragStartMesh: EditableMesh | null = null;
  private editDragStartVertexIds = new Set<string>();
  private editDragStartVertexPositions = new Map<string, Vec3>();
  private editDragStartAnchorInv = new THREE.Matrix4();
  private editDragStartAnchorPos = new THREE.Vector3();
  private proportionalDragField: ProportionalDistanceField | null = null;
  private proportionalDragWeights = new Map<string, number>();
  private proportionalDragRadiusUsed = -1;
  private proportionalDragFalloffUsed = '';
  private proportionalDragConnectedUsed = false;
  private sceneTransformRefs: ModifierTransformRef[] = [];

  // Centralized Touch & Pointer Gesture Manager
  private gestureManager: TouchGestureManager;
  private suppressOrbitForContextPress = false;

  // Render loop / transition
  private frameId = 0;
  private renderBusy = false;
  private renderDirty = false;
  private cameraAnimTargetPos: THREE.Vector3 | null = null;
  private cameraAnimTargetLook: THREE.Vector3 | null = null;
  private lastAnimTime = 0;
  private isOrbitDragging = false;
  private lastCameraSampleAt = 0;
  private wheelCameraCommitTimer: number | null = null;
  private disposed = false;
  private paused = false;

  private resizeObserver: ResizeObserver;
  private raycaster = new THREE.Raycaster();

  constructor(container: HTMLElement, callbacks: ViewportCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareWebGL();

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    const aspect = width / height;

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = false;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.touchAction = 'none';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1d1f24);
    this.scene.fog = new THREE.FogExp2(0x1d1f24, 0.011);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // Cameras (Blender Z-up convention: X horizontal, Y depth, Z vertical)
    this.perspectiveCamera = new THREE.PerspectiveCamera(45, aspect, 0.05, 500);
    this.perspectiveCamera.up.set(0, 0, 1);
    this.perspectiveCamera.position.set(5.6, -6.2, 4.2);
    this.perspectiveCamera.lookAt(0, 0, 0);

    const frustum = 7;
    this.orthographicCamera = new THREE.OrthographicCamera(
      (-frustum * aspect) / 2,
      (frustum * aspect) / 2,
      frustum / 2,
      -frustum / 2,
      -100,
      500,
    );
    this.orthographicCamera.up.set(0, 0, 1);
    this.orthographicCamera.position.copy(this.perspectiveCamera.position);
    this.orthographicCamera.lookAt(0, 0, 0);
    this.activeCamera = this.perspectiveCamera;

    // 3-Point Studio Lighting (Z-up)
    const hemi = new THREE.HemisphereLight(0xa6bddb, 0x262930, 0.8);
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff5e8, 1.45);
    keyLight.position.set(7, -8, 12);
    keyLight.castShadow = false;
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xc2d4ff, 0.55);
    rimLight.position.set(-8, 7, 6);
    this.scene.add(rimLight);

    // Reference Grid rotated onto XY plane (Z = 0) — visual guide only, never writes depth
    this.gridHelper = new THREE.GridHelper(32, 32, 0x3f444f, 0x2a2d35);
    const gridMaterials = Array.isArray(this.gridHelper.material)
      ? this.gridHelper.material
      : [this.gridHelper.material];
    for (const mat of gridMaterials) {
      mat.transparent = true;
      mat.opacity = 0.85;
      mat.depthTest = true;
      mat.depthWrite = false;
      mat.needsUpdate = true;
    }
    this.gridHelper.rotation.x = Math.PI / 2;
    this.gridHelper.position.set(0, 0, -0.001);
    this.gridHelper.renderOrder = -2;
    this.scene.add(this.gridHelper);

    // Colored X, Y, Z Axes
    this.axesGroup = this.createAxesGroup();
    this.scene.add(this.axesGroup);

    this.scene.add(this.objectsGroup);

    // Edit Mode Overlay Setup
    this.vertexDotTexture = createVertexDotTexture();

    this.editAllEdgesLine = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: 0x111317,
        depthTest: true,
        depthWrite: false,
        transparent: true,
        opacity: 0.85,
      }),
    );
    this.editAllEdgesLine.renderOrder = 4;

    const selectedEdgesMaterial = new LineMaterial({
      color: 0xff9900,
      worldUnits: false,
      resolution: new THREE.Vector2(width, height),
      depthTest: false,
      depthWrite: false,
    });
    selectedEdgesMaterial.uniforms.linewidth.value = 2;
    this.editSelectedEdgesLine = new LineSegments2(
      new LineSegmentsGeometry(),
      selectedEdgesMaterial,
    );
    this.editSelectedEdgesLine.renderOrder = 5;

    this.editSeamEdgesLine = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: 0xff2e63,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.editSeamEdgesLine.renderOrder = 5;

    const barGeo = new THREE.BoxGeometry(1, 1, 1);
    const seamBarMat = new THREE.MeshBasicMaterial({
      color: 0xff2e63,
      depthTest: false,
      depthWrite: false,
    });
    this.editSeamEdgeBars = new THREE.InstancedMesh(barGeo, seamBarMat, 1);
    this.editSeamEdgeBars.count = 0;
    this.editSeamEdgeBars.frustumCulled = false;
    this.editSeamEdgeBars.renderOrder = 5;

    this.editSelectedFacesMesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({
        color: 0xff9900,
        transparent: true,
        opacity: 0.42,
        side: THREE.DoubleSide,
        depthTest: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    this.editSelectedFacesMesh.renderOrder = 3;

    this.editUnselectedVerticesPoints = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial({
        color: 0xffffff,
        vertexColors: true,
        size: 10,
        sizeAttenuation: false,
        map: this.vertexDotTexture,
        alphaTest: 0.45,
        depthTest: true,
        depthWrite: false,
      }),
    );
    this.editUnselectedVerticesPoints.renderOrder = 6;

    this.editSelectedVerticesPoints = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial({
        color: 0xff9900,
        size: 14,
        sizeAttenuation: false,
        map: this.vertexDotTexture,
        alphaTest: 0.45,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.editSelectedVerticesPoints.renderOrder = 7;

    const loopBarMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      depthTest: false,
      depthWrite: false,
    });
    this.loopCutPreviewBars = new THREE.InstancedMesh(barGeo, loopBarMat, 1);
    this.loopCutPreviewBars.count = 0;
    this.loopCutPreviewBars.frustumCulled = false;
    this.loopCutPreviewBars.renderOrder = 8;

    this.loopCutPreviewPoints = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial({
        color: 0xe0f2fe,
        size: 10,
        sizeAttenuation: false,
        map: this.vertexDotTexture,
        alphaTest: 0.45,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.loopCutPreviewPoints.visible = false;
    this.loopCutPreviewPoints.frustumCulled = false;
    this.loopCutPreviewPoints.renderOrder = 9;

    const cursorSize = 0.22;
    const cursorGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-cursorSize, 0, 0),
      new THREE.Vector3(cursorSize, 0, 0),
      new THREE.Vector3(0, -cursorSize, 0),
      new THREE.Vector3(0, cursorSize, 0),
      new THREE.Vector3(0, 0, -cursorSize),
      new THREE.Vector3(0, 0, cursorSize),
    ]);
    this.mergeCursorMarker = new THREE.LineSegments(
      cursorGeo,
      new THREE.LineBasicMaterial({
        color: 0xff5555,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.mergeCursorMarker.visible = false;
    this.mergeCursorMarker.frustumCulled = false;
    this.mergeCursorMarker.renderOrder = 10;

    this.slideGuideLines = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: 0x22d3ee,
        transparent: true,
        opacity: 0.9,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.slideGuideLines.visible = false;
    this.slideGuideLines.frustumCulled = false;
    this.slideGuideLines.renderOrder = 8;

    this.editOverlayGroup.add(
      this.editSelectedFacesMesh,
      this.editAllEdgesLine,
      this.editSelectedEdgesLine,
      this.editSeamEdgesLine,
      this.slideGuideLines,
      this.editSeamEdgeBars,
      this.loopCutPreviewBars,
      this.loopCutPreviewPoints,
      this.editUnselectedVerticesPoints,
      this.editSelectedVerticesPoints,
      this.mergeCursorMarker,
    );
    this.editOverlayGroup.visible = false;
    this.scene.add(this.editOverlayGroup);

    // Subdivision N-gon Visual Identification Overlay (visible in both Object & Edit modes)
    this.ngonHighlightMesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({
        color: 0xf43f5e,
        transparent: true,
        opacity: 0.56,
        side: THREE.DoubleSide,
        depthTest: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
      }),
    );
    this.ngonHighlightMesh.renderOrder = 8;

    this.ngonHighlightEdges = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: 0xfb7185,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.ngonHighlightEdges.renderOrder = 9;

    this.ngonOverlayGroup.add(this.ngonHighlightMesh, this.ngonHighlightEdges);
    this.ngonOverlayGroup.visible = false;
    this.scene.add(this.ngonOverlayGroup);

    // Proportional Editing visual radius indicator ring (world-space camera-facing)
    const ringPts: THREE.Vector3[] = [];
    const ringSegs = 64;
    for (let i = 0; i < ringSegs; i++) {
      const a = (i / ringSegs) * Math.PI * 2;
      ringPts.push(new THREE.Vector3(Math.cos(a), Math.sin(a), 0));
    }
    this.proportionalRing = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(ringPts),
      new THREE.LineBasicMaterial({
        color: 0xfbbf24,
        transparent: true,
        opacity: 0.88,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.proportionalRing.renderOrder = 9;
    this.proportionalRing.visible = false;
    this.proportionalRing.frustumCulled = false;
    this.scene.add(this.proportionalRing);

    // Sculpt 3D Brush Cursor Ring (oriented along surface hit normal)
    this.sculptCursorRing = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(ringPts),
      new THREE.LineBasicMaterial({
        color: 0x5ecd6e,
        transparent: true,
        opacity: 0.92,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.sculptCursorRing.renderOrder = 11;
    this.sculptCursorRing.frustumCulled = false;

    this.sculptCursorCenter = new THREE.Mesh(
      new THREE.SphereGeometry(0.022, 10, 8),
      new THREE.MeshBasicMaterial({
        color: 0x5ecd6e,
        transparent: true,
        opacity: 0.95,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.sculptCursorCenter.renderOrder = 12;
    this.sculptCursorCenter.frustumCulled = false;

    this.sculptCursorMirrorGeometry = new THREE.SphereGeometry(0.018, 8, 6);
    this.sculptCursorMirrorMaterial = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
      depthWrite: false,
    });
    for (let i = 0; i < 7; i++) {
      const marker = new THREE.Mesh(
        this.sculptCursorMirrorGeometry,
        this.sculptCursorMirrorMaterial,
      );
      marker.renderOrder = 12;
      marker.frustumCulled = false;
      marker.visible = false;
      this.sculptCursorMirrorPoints.push(marker);
    }

    this.sculptCursorGroup.add(this.sculptCursorRing, this.sculptCursorCenter);
    this.sculptCursorGroup.visible = false;
    this.sculptCursorMirrorGroup.add(...this.sculptCursorMirrorPoints);
    this.sculptCursorMirrorGroup.visible = false;
    this.scene.add(this.sculptCursorGroup, this.sculptCursorMirrorGroup);

    // Gizmo Anchor for Edit Mode
    this.editGizmoAnchor = new THREE.Object3D();
    this.scene.add(this.editGizmoAnchor);
    this.scene.add(this.multiSelectionGizmoPivot);

    // 1. TransformControls Gizmos (bound BEFORE gesture & orbit; ordered inner Scale -> middle Rotate -> outer Translate for conflict-free ALL mode)
    const createConfiguredGizmo = (): TransformControls => {
      const ctrl = new TransformControls(this.activeCamera, this.renderer.domElement);
      ctrl.setSize(1.25);
      ctrl.setColors(0xe05252, 0x52b852, 0x48bce8, 0xffff00);
      ctrl.getRaycaster().params.Line.threshold = 0.25;
      this.scene.add(ctrl.getHelper());
      return ctrl;
    };

    this.scaleGizmoControls = createConfiguredGizmo();
    this.scaleGizmoControls.setMode('scale');
    this.scaleGizmoControls.enabled = false;

    this.rotateGizmoControls = createConfiguredGizmo();
    this.rotateGizmoControls.setMode('rotate');
    this.rotateGizmoControls.enabled = false;

    this.transformControls = createConfiguredGizmo();

    const bindGizmoListeners = (ctrl: TransformControls) => {
      ctrl.addEventListener('dragging-changed', (event) => {
        const dragging = Boolean(event.value);
        if (dragging) {
          this.activeDraggingGizmo = ctrl;
          for (const other of [
            this.scaleGizmoControls,
            this.rotateGizmoControls,
            this.transformControls,
          ]) {
            if (other !== ctrl) {
              other.enabled = false;
            }
          }
          if (this.isTrackballDragging) {
            this.cancelTrackballRotate();
          }
          if (this.isModalDragging) {
            this.cancelModalTransform();
          }
          this.gestureManager.invalidateCurrentGesture();
        } else {
          this.activeDraggingGizmo = null;
          this.syncGizmoEnabledState();
        }
        this.isGizmoDragging = dragging;
        this.orbitControls.enabled =
          !dragging &&
          !this.isTrackballDragging &&
          !this.isModalDragging &&
          !this.suppressOrbitForContextPress &&
          !this.isBoxSelectBlocking;
        if (dragging) {
          this.handleGizmoDragStart();
        } else {
          this.handleGizmoDragEnd();
        }
        this.requestRender();
      });

      ctrl.addEventListener('objectChange', () => {
        if (this.activeDraggingGizmo && this.activeDraggingGizmo !== ctrl) {
          return;
        }
        this.handleGizmoObjectChange();
        this.requestRender();
      });

      ctrl.addEventListener('change', () => {
        this.requestRender();
      });
    };

    bindGizmoListeners(this.scaleGizmoControls);
    bindGizmoListeners(this.rotateGizmoControls);
    bindGizmoListeners(this.transformControls);

    // 2. Centralized Multi-Touch Pointer Gesture Manager (must bind BEFORE OrbitControls so Double-Tap Box Select locks orbit on pointerdown)
    const dom = this.renderer.domElement;
    this.gestureManager = new TouchGestureManager(dom, DEFAULT_TOUCH_SETTINGS, {
      isGizmoBusy: () =>
        this.isGizmoDragging ||
        this.transformControls.axis !== null ||
        (this.activeTool === 'all' &&
          (this.rotateGizmoControls.axis !== null || this.scaleGizmoControls.axis !== null)),
      isBoxSelectDisabled: () => this.loopCutPreviewMode || this.workMode === 'sculpt',
      isShiftHoldDisabled: () => this.loopCutPreviewMode && this.loopCutSlideActive,
      isTrackballDisabled: () =>
        this.loopCutPreviewMode || this.suppressGizmo || this.workMode === 'sculpt',
      canTrackballRotate: () => this.canTrackballRotate(),
      getWorkMode: () => this.workMode,
      hasLongPressTarget: (clientX, clientY, pointerType) =>
        this.workMode === 'sculpt'
          ? false
          : this.workMode === 'object'
            ? this.hitTestObject(clientX, clientY, pointerType) !== null
            : this.hitTestEditComponent(clientX, clientY, pointerType) !== null,
      onSingleTap: (clientX, clientY, pointerType, modifiers, shiftKey) => {
        const effective = this.mergeModifiers(modifiers);
        const shiftActive = effective.shift || shiftKey;
        const additive = Boolean(this.settings?.multiSelectTouch) || shiftActive;
        const ctrlActive = effective.ctrl;
        this.performTapSelection(clientX, clientY, pointerType, additive, false, ctrlActive);
      },
      onAltTap: () => {
        this.callbacks.onAltTap?.();
      },
      onTwoFingerTap: () => {
        if (!this.loopCutPreviewMode) {
          this.callbacks.onTwoFingerUndo();
        }
      },
      onThreeFingerTap: () => {
        if (!this.loopCutPreviewMode) {
          this.callbacks.onThreeFingerRedo();
        }
      },
      onLongPress: (clientX, clientY, pointerType) => {
        this.handleLongPressContext(clientX, clientY, pointerType);
      },
      onBoxSelectStart: (rect, modifiers, shiftKey) => {
        this.handleBoxSelectMove(rect, modifiers, shiftKey);
      },
      onBoxSelectMove: (rect, modifiers, shiftKey) => {
        this.handleBoxSelectMove(rect, modifiers, shiftKey);
      },
      onBoxSelectEnd: (rect, modifiers, shiftKey) => {
        this.handleBoxSelectEnd(rect, modifiers, shiftKey);
      },
      onBoxSelectCancel: () => {
        this.clearBoxSelectPreview();
      },
      onTrackballRotateStart: (clientX, clientY) => {
        this.startTrackballRotate(clientX, clientY);
      },
      onTrackballRotateMove: (clientX, clientY) => {
        this.updateTrackballRotate(clientX, clientY);
      },
      onTrackballRotateEnd: () => {
        this.endTrackballRotate();
      },
      onTrackballRotateCancel: () => {
        this.cancelTrackballRotate();
      },
      isModalTransformArmed: () => this.canStartModalTransform(),
      onModalTransformStart: (clientX, clientY) => {
        this.startModalTransform(clientX, clientY);
      },
      onModalTransformMove: (clientX, clientY) => {
        this.updateModalTransform(clientX, clientY);
      },
      onModalTransformEnd: () => {
        this.endModalTransform();
      },
      onModalTransformCancel: () => {
        this.cancelModalTransform();
      },
      onModifierStateChange: (modifiers) => {
        this.callbacks.onModifierStateChange?.(modifiers);
      },
      onTouchNavigationChange: (activePointers, modifiers, isBoxSelectBlocking) => {
        this.syncTouchNavigationFlags(activePointers, modifiers, isBoxSelectBlocking);
      },
    });

    // 3. OrbitControls (iPad Touch: 1 finger rotate, 2 fingers pinch/pan)
    this.orbitControls = new OrbitControls(this.activeCamera, this.renderer.domElement);
    this.orbitControls.enableDamping = !this.isSoftwareGl;
    this.orbitControls.dampingFactor = 0.08;
    this.orbitControls.rotateSpeed = 0.75;
    this.orbitControls.zoomSpeed = 0.9;
    this.orbitControls.panSpeed = 0.85;
    this.orbitControls.minDistance = 0.6;
    this.orbitControls.maxDistance = 120;
    this.orbitControls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };

    this.orbitControls.addEventListener('start', () => {
      this.isOrbitDragging = true;
      this.cameraAnimTargetPos = null;
      this.cameraAnimTargetLook = null;
    });
    this.orbitControls.addEventListener('change', () => {
      this.requestRender();
      if (this.paused || this.disposed) return;
      const now = performance.now();
      if (this.isOrbitDragging) {
        if (now - this.lastCameraSampleAt >= 360) {
          this.lastCameraSampleAt = now;
          this.emitCameraMovement('orbit');
        }
      } else if (!this.cameraAnimTargetPos) {
        if (this.wheelCameraCommitTimer !== null) {
          window.clearTimeout(this.wheelCameraCommitTimer);
        }
        this.wheelCameraCommitTimer = window.setTimeout(() => {
          this.wheelCameraCommitTimer = null;
          if (!this.disposed && !this.paused) {
            this.lastCameraSampleAt = performance.now();
            this.emitCameraMovement('orbit');
          }
        }, 280);
      }
    });
    this.orbitControls.addEventListener('end', () => {
      this.isOrbitDragging = false;
      if (this.paused || this.disposed) return;
      this.lastCameraSampleAt = performance.now();
      this.emitCameraMovement('orbit');
    });

    dom.addEventListener('webglcontextlost', this.onContextLost);
    dom.addEventListener('wheel', this.onViewportWheel, { passive: false });
    dom.addEventListener('pointerdown', this.onSculptPointerDown, {
      capture: true,
    });
    dom.addEventListener('pointermove', this.onSculptPointerMove, {
      capture: true,
    });
    dom.addEventListener('pointerup', this.onSculptPointerUp, {
      capture: true,
    });
    dom.addEventListener('pointercancel', this.onSculptPointerUp, {
      capture: true,
    });
    dom.addEventListener('pointerleave', this.onSculptPointerLeave);
    dom.addEventListener('pointerdown', this.onLoopCutSlidePointerDown);
    dom.addEventListener('pointermove', this.onLoopCutSlidePointerMove);
    dom.addEventListener('pointerup', this.onLoopCutSlidePointerUp);
    dom.addEventListener('pointercancel', this.onLoopCutSlidePointerUp);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.activeCamera);
    }

    this.orbitControls.update();
    this.emitCameraPose();
    this.requestRender();
  }

  private emitCameraPose(): void {
    const q = this.activeCamera.quaternion;
    this.callbacks.onCameraPoseChange?.([q.x, q.y, q.z, q.w]);
  }

  public getCameraState(): TimelapseCameraState {
    const pos = this.activeCamera.position;
    const tgt = this.orbitControls.target;
    const orthoHeight = Math.max(0.2, this.orthographicCamera.top - this.orthographicCamera.bottom);
    return {
      position: [pos.x, pos.y, pos.z],
      target: [tgt.x, tgt.y, tgt.z],
      projection: this.projection,
      orthoHeight,
    };
  }

  private emitCameraMovement(source: 'orbit' | 'preset' | 'projection'): void {
    if (this.paused || this.disposed) return;
    this.callbacks.onCameraMovementCommit?.(this.getCameraState(), source);
  }

  private createAxesGroup(): THREE.Group {
    const group = new THREE.Group();
    group.renderOrder = -2;
    const len = 16;

    const makeAxis = (dir: Vec3, color: number) => {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-dir[0] * len, -dir[1] * len, -dir[2] * len),
        new THREE.Vector3(dir[0] * len, dir[1] * len, dir[2] * len),
      ]);
      const mat = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.72,
        depthTest: true,
        depthWrite: false,
      });
      const line = new THREE.Line(geo, mat);
      line.renderOrder = -2;
      return line;
    };

    group.add(makeAxis([1, 0, 0], 0xe05252)); // X Red
    group.add(makeAxis([0, 1, 0], 0x52b852)); // Y Green
    group.add(makeAxis([0, 0, 1], 0x48bce8)); // Z Sky Blue (#48BCE8)
    return group;
  }

  private onContextLost = (e: Event) => {
    e.preventDefault();
  };

  private isAnyTransformDragging(): boolean {
    return (
      this.isGizmoDragging ||
      this.isTrackballDragging ||
      this.isModalDragging ||
      this.sculptStrokeSession !== null
    );
  }

  private onViewportWheel = (e: WheelEvent) => {
    if (
      !this.isAnyTransformDragging() ||
      this.workMode !== 'edit' ||
      !this.proportionalSettings.enabled
    ) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const nextRadius = clampProportionalRadius(this.proportionalSettings.radius * factor);
    if (Math.abs(nextRadius - this.proportionalSettings.radius) > 1e-5) {
      this.proportionalSettings = {
        ...this.proportionalSettings,
        radius: nextRadius,
      };
      this.refreshProportionalDragWeights(false);
      if (this.isTrackballDragging && this.selectedObjectId) {
        const visual = this.visuals.get(this.selectedObjectId);
        if (visual) this.applyTrackballEditMesh(visual);
      } else if (
        this.isModalDragging &&
        this.modalTransformMode === 'move' &&
        this.selectedObjectId
      ) {
        const visual = this.visuals.get(this.selectedObjectId);
        if (visual) {
          this.applyModalMoveEditMesh(visual, this.modalLastDeltaWorld);
        }
      } else {
        this.handleGizmoObjectChange();
      }
      this.callbacks.onChangeProportionalRadius?.(nextRadius);
      this.requestRender();
    }
  };

  private onLoopCutSlidePointerDown = (e: PointerEvent) => {
    if (!this.loopCutPreviewMode || !this.loopCutSlideActive) return;
    if (!e.isPrimary) {
      this.loopCutSlidePointerId = null;
      return;
    }
    this.loopCutSlidePointerId = e.pointerId;
    this.loopCutSlideLastX = e.clientX;
    this.orbitControls.enableRotate = false;
  };

  private onLoopCutSlidePointerMove = (e: PointerEvent) => {
    if (!this.loopCutPreviewMode || !this.loopCutSlideActive) {
      this.loopCutSlidePointerId = null;
      return;
    }
    if (this.loopCutSlidePointerId === null || e.pointerId !== this.loopCutSlidePointerId) {
      return;
    }
    const dx = e.clientX - this.loopCutSlideLastX;
    if (Math.abs(dx) < 0.5) return;
    this.loopCutSlideLastX = e.clientX;
    this.callbacks.onLoopCutSlideDelta?.(dx * 0.0055);
  };

  private onLoopCutSlidePointerUp = (e: PointerEvent) => {
    if (e.pointerId === this.loopCutSlidePointerId) {
      this.loopCutSlidePointerId = null;
    }
  };

  private raycastActiveSculptMesh(
    clientX: number,
    clientY: number,
  ): {
    visual: ObjectVisual;
    worldPoint: THREE.Vector3;
    worldNormal: THREE.Vector3;
  } | null {
    if (!this.selectedObjectId) return null;
    const visual = this.visuals.get(this.selectedObjectId);
    if (
      !visual ||
      visual.objectType !== 'mesh' ||
      !visual.group.visible ||
      visual.locked ||
      !visual.hasFaces
    ) {
      return null;
    }
    const collider = this.getEditBaseCollider(visual);
    if (!collider) return null;

    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.activeCamera);

    visual.group.updateMatrixWorld(true);
    collider.updateMatrixWorld(true);
    const hits = this.raycaster.intersectObject(collider, false);
    if (hits.length === 0) return null;

    const hit = hits[0];
    const worldPoint = hit.point.clone();
    const worldNormal = new THREE.Vector3(0, 0, 1);
    if (hit.face) {
      const normalMat = new THREE.Matrix3().getNormalMatrix(collider.matrixWorld);
      worldNormal.copy(hit.face.normal).applyMatrix3(normalMat).normalize();
    } else {
      this.activeCamera.getWorldDirection(worldNormal).negate();
    }
    const toCam = _v0.subVectors(this.activeCamera.position, worldPoint);
    if (worldNormal.dot(toCam) < 0) {
      worldNormal.negate();
    }
    return { visual, worldPoint, worldNormal };
  }

  private updateSculptCursorVisual(
    worldPoint: THREE.Vector3 | null,
    worldNormal?: THREE.Vector3,
  ): void {
    if (this.workMode !== 'sculpt' || !worldPoint) {
      this.sculptCursorGroup.visible = false;
      this.sculptCursorMirrorGroup.visible = false;
      this.sculptCursorLastWorldPoint = null;
      this.sculptCursorLastWorldNormal = null;
      this.sculptCursorMirrorPoints.forEach((point) => {
        point.visible = false;
      });
      this.sculptCursorMirrorGroup.visible = false;
      return;
    }
    this.sculptCursorLastWorldPoint = worldPoint.clone();
    this.sculptCursorLastWorldNormal = (worldNormal ?? new THREE.Vector3(0, 0, 1)).clone();
    const visual = this.selectedObjectId ? this.visuals.get(this.selectedObjectId) : undefined;
    const avgScale = visual
      ? (Math.abs(visual.group.scale.x) +
          Math.abs(visual.group.scale.y) +
          Math.abs(visual.group.scale.z)) /
        3
      : 1;
    const displayRadius = Math.max(0.02, this.sculptSettings.radius * Math.max(0.05, avgScale));
    const colorHex = this.sculptSettings.invert ? 0xfb7185 : 0x5ecd6e;
    (this.sculptCursorRing.material as THREE.LineBasicMaterial).color.setHex(colorHex);
    (this.sculptCursorCenter.material as THREE.MeshBasicMaterial).color.setHex(colorHex);
    this.sculptCursorMirrorMaterial.color.setHex(this.sculptSettings.invert ? 0x7dd3fc : 0x38bdf8);

    const n = (worldNormal ?? new THREE.Vector3(0, 0, 1)).clone().normalize();
    this.sculptCursorGroup.position.copy(worldPoint).addScaledVector(n, 0.004);
    _quat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    this.sculptCursorGroup.quaternion.copy(_quat);
    this.sculptCursorRing.scale.setScalar(displayRadius);
    this.sculptCursorGroup.visible = true;

    this.sculptCursorMirrorPoints.forEach((point) => {
      point.visible = false;
    });
    if (
      visual &&
      (this.sculptSettings.symmetry.x ||
        this.sculptSettings.symmetry.y ||
        this.sculptSettings.symmetry.z)
    ) {
      visual.group.updateMatrixWorld(true);
      const localPoint = worldPoint.clone().applyMatrix4(visual.group.matrixWorld.clone().invert());
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(visual.group.matrixWorld);
      const localNormal = n.clone().applyMatrix3(normalMatrix.clone().invert()).normalize();
      const xSigns = this.sculptSettings.symmetry.x ? [1, -1] : [1];
      const ySigns = this.sculptSettings.symmetry.y ? [1, -1] : [1];
      const zSigns = this.sculptSettings.symmetry.z ? [1, -1] : [1];
      let markerIndex = 0;

      for (const sx of xSigns) {
        for (const sy of ySigns) {
          for (const sz of zSigns) {
            if (sx === 1 && sy === 1 && sz === 1) continue;
            const reflectedLocal = localPoint.clone();
            reflectedLocal.x *= sx;
            reflectedLocal.y *= sy;
            reflectedLocal.z *= sz;
            const reflectedWorld = reflectedLocal
              .applyMatrix4(visual.group.matrixWorld)
              .addScaledVector(
                localNormal
                  .clone()
                  .set(localNormal.x * sx, localNormal.y * sy, localNormal.z * sz)
                  .applyMatrix3(normalMatrix)
                  .normalize(),
                0.004,
              );
            if (reflectedWorld.distanceToSquared(worldPoint) < 1e-8) continue;
            const marker = this.sculptCursorMirrorPoints[markerIndex++];
            if (!marker) continue;
            marker.position.copy(reflectedWorld);
            marker.visible = true;
            this.sculptCursorMirrorGroup.visible = true;
          }
        }
      }
    }
    this.updateSculptCursorScreenSize();
  }

  private updateSculptCursorScreenSize(): void {
    if (!this.sculptCursorGroup.visible) return;
    const height = this.renderer.domElement.clientHeight;
    if (height < 1) return;
    let worldUnitsPerPixel = 0;
    if (this.activeCamera instanceof THREE.PerspectiveCamera) {
      const distance = this.activeCamera.position.distanceTo(this.sculptCursorGroup.position);
      worldUnitsPerPixel =
        (2 * distance * Math.tan(THREE.MathUtils.degToRad(this.activeCamera.fov / 2))) / height;
    } else if (this.activeCamera instanceof THREE.OrthographicCamera) {
      worldUnitsPerPixel =
        (this.activeCamera.top - this.activeCamera.bottom) / (this.activeCamera.zoom * height);
    }
    if (!Number.isFinite(worldUnitsPerPixel) || worldUnitsPerPixel <= 0) return;
    this.sculptCursorCenter.scale.setScalar((worldUnitsPerPixel * 3) / 0.022);
    const mirrorScale = (worldUnitsPerPixel * 2.5) / 0.018;
    this.sculptCursorMirrorPoints.forEach((point) => {
      point.scale.setScalar(mirrorScale);
    });
  }

  private applyLiveSculptMeshToVisual(visual: ObjectVisual, nextBaseMesh: EditableMesh): void {
    visual.baseEditableMesh = nextBaseMesh;
    if (visual.hasActiveModifiers && visual.modifiers.length > 0) {
      const objData = this.currentObjectsData.get(visual.id);
      if (objData) {
        const evalRes = evaluateObjectModifiers(nextBaseMesh.toJSON(), visual.modifiers, {
          ownerTransform: {
            id: objData.id,
            position: objData.transform.position,
            rotation: objData.transform.rotation,
            scale: objData.transform.scale,
          },
          sceneTransformRefs: this.sceneTransformRefs,
        });
        visual.editableMesh = evalRes.hasActiveModifiers
          ? EditableMesh.fromJSON(evalRes.mesh)
          : nextBaseMesh;
      } else {
        visual.editableMesh = nextBaseMesh;
      }
    } else {
      visual.editableMesh = nextBaseMesh;
    }
    this.rebuildObjectGeometry(visual);
  }

  private finishActiveSculptStroke(commit: boolean): void {
    const session = this.sculptStrokeSession;
    const ptrId = this.sculptPointerId;
    this.sculptStrokeSession = null;
    this.sculptPointerId = null;

    if (ptrId !== null) {
      try {
        if (this.renderer.domElement.hasPointerCapture(ptrId)) {
          this.renderer.domElement.releasePointerCapture(ptrId);
        }
      } catch {
        // Ignore capture release errors
      }
    }

    this.orbitControls.enabled = !this.isAnyTransformDragging() && !this.isBoxSelectBlocking;
    this.orbitControls.enableRotate = !this.cameraRotationLocked;

    if (session && commit && session.hasModified) {
      this.callbacks.onCommitSculptStroke?.(session.objectId, session.workingMesh.clone());
    } else if (session && !commit) {
      const visual = this.visuals.get(session.objectId);
      if (visual) {
        this.applyLiveSculptMeshToVisual(visual, session.beforeMesh.clone());
      }
    }
    this.requestRender();
  }

  private onSculptPointerDown = (e: PointerEvent) => {
    if (this.workMode !== 'sculpt' || this.loopCutPreviewMode) return;

    // If a second finger touches during an active stroke, finish single-finger sculpt so multi-touch camera gestures can proceed
    if (this.sculptStrokeSession && this.sculptPointerId !== e.pointerId) {
      this.finishActiveSculptStroke(true);
      return;
    }

    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (
      e.shiftKey ||
      e.ctrlKey ||
      e.metaKey ||
      e.altKey ||
      this.virtualModifiers.shift ||
      this.virtualModifiers.ctrl ||
      this.virtualModifiers.alt
    ) {
      return;
    }

    const hit = this.raycastActiveSculptMesh(e.clientX, e.clientY);
    if (!hit) {
      // Missed active mesh: allow OrbitControls 1-finger/mouse camera rotation
      this.updateSculptCursorVisual(null);
      return;
    }

    e.stopImmediatePropagation();
    e.preventDefault();
    this.gestureManager.invalidateCurrentGesture();
    this.orbitControls.enabled = false;
    this.orbitControls.enableRotate = false;

    try {
      this.renderer.domElement.setPointerCapture(e.pointerId);
    } catch {
      // Ignore capture failure
    }

    hit.visual.group.updateMatrixWorld(true);
    const camDir = new THREE.Vector3();
    this.activeCamera.getWorldDirection(camDir).normalize();
    this.sculptGrabPlane.setFromNormalAndCoplanarPoint(camDir.clone().negate(), hit.worldPoint);

    const session = createSculptStrokeSession({
      objectId: hit.visual.id,
      mesh: hit.visual.baseEditableMesh,
      matrixWorld: hit.visual.group.matrixWorld,
      settings: this.sculptSettings,
      worldHit: hit.worldPoint,
      worldNormal: hit.worldNormal,
    });
    this.sculptStrokeSession = session;
    this.sculptPointerId = e.pointerId;

    const changed = stepSculptStroke(session, hit.worldPoint, hit.worldNormal, true);
    if (changed) {
      this.applyLiveSculptMeshToVisual(hit.visual, session.workingMesh);
    }
    this.updateSculptCursorVisual(hit.worldPoint, hit.worldNormal);
    this.requestRender();
  };

  private onSculptPointerMove = (e: PointerEvent) => {
    if (this.workMode !== 'sculpt') {
      if (this.sculptCursorGroup.visible) {
        this.sculptCursorGroup.visible = false;
        this.requestRender();
      }
      return;
    }

    const session = this.sculptStrokeSession;
    if (session) {
      if (e.pointerId !== this.sculptPointerId) return;
      e.stopImmediatePropagation();
      e.preventDefault();

      const visual = this.visuals.get(session.objectId);
      if (!visual) {
        this.finishActiveSculptStroke(false);
        return;
      }

      visual.group.updateMatrixWorld(true);

      if (session.settings.brush === 'grab') {
        const planeHit = new THREE.Vector3();
        if (this.raycastPointerToPlane(e.clientX, e.clientY, this.sculptGrabPlane, planeHit)) {
          const changed = stepSculptStroke(session, planeHit, this.sculptGrabPlane.normal);
          if (changed) {
            this.applyLiveSculptMeshToVisual(visual, session.workingMesh);
          }
          this.updateSculptCursorVisual(planeHit, this.sculptGrabPlane.normal);
          this.requestRender();
        }
        return;
      }

      const hit = this.raycastActiveSculptMesh(e.clientX, e.clientY);
      if (!hit) {
        this.updateSculptCursorVisual(null);
        this.requestRender();
        return;
      }
      const changed = stepSculptStroke(session, hit.worldPoint, hit.worldNormal);
      if (changed) {
        this.applyLiveSculptMeshToVisual(hit.visual, session.workingMesh);
      }
      this.updateSculptCursorVisual(hit.worldPoint, hit.worldNormal);
      this.requestRender();
      return;
    }

    if (e.pointerType !== 'touch' && !this.isOrbitDragging) {
      const hit = this.raycastActiveSculptMesh(e.clientX, e.clientY);
      this.updateSculptCursorVisual(hit ? hit.worldPoint : null, hit?.worldNormal);
      this.requestRender();
    }
  };

  private onSculptPointerUp = (e: PointerEvent) => {
    if (this.sculptStrokeSession && e.pointerId === this.sculptPointerId) {
      e.stopImmediatePropagation();
      this.finishActiveSculptStroke(true);
      if (e.pointerType === 'touch') {
        this.updateSculptCursorVisual(null);
      }
    }
  };

  private onSculptPointerLeave = () => {
    if (!this.sculptStrokeSession && this.sculptCursorGroup.visible) {
      this.sculptCursorGroup.visible = false;
      this.requestRender();
    }
  };

  private syncTouchNavigationFlags(
    activePointers: ReadonlyMap<number, TrackedPointer>,
    modifiers: TouchModifierState = EMPTY_MODIFIER_STATE,
    isBoxSelectBlocking = false,
  ): void {
    this.isBoxSelectBlocking = isBoxSelectBlocking;
    if (
      isBoxSelectBlocking ||
      modifiers.shift ||
      this.isTrackballDragging ||
      this.isModalDragging ||
      this.sculptStrokeSession !== null
    ) {
      // Lock camera navigation while Double-Tap Box Select, CTRL Trackball, G Modal Drag, Sculpt Stroke, or touch SHIFT hold is active
      this.orbitControls.enabled = false;
      this.orbitControls.enableRotate = false;
      return;
    }

    if (activePointers.size === 0) {
      this.suppressOrbitForContextPress = false;
      this.loopCutSlidePointerId = null;
      this.orbitControls.enabled = !this.isAnyTransformDragging();
      this.orbitControls.enableRotate =
        !this.cameraRotationLocked && !(this.loopCutPreviewMode && this.loopCutSlideActive);
      this.orbitControls.enableZoom = true;
      this.orbitControls.enablePan = true;
      return;
    }

    if (this.suppressOrbitForContextPress) {
      this.orbitControls.enabled = false;
      return;
    }

    if (activePointers.size > 1 && this.loopCutSlidePointerId !== null) {
      this.loopCutSlidePointerId = null;
    }
    if (activePointers.size > 1 && this.sculptStrokeSession) {
      this.finishActiveSculptStroke(true);
    }

    const slideBlockingOrbit =
      this.loopCutPreviewMode && this.loopCutSlideActive && activePointers.size === 1;

    const touchCfg = this.settings?.touch ?? DEFAULT_TOUCH_SETTINGS;
    const hasTouch = Array.from(activePointers.values()).some((p) => p.pointerType === 'touch');
    if (!hasTouch) {
      this.orbitControls.enabled = !this.isAnyTransformDragging();
      this.orbitControls.enableRotate = !this.cameraRotationLocked && !slideBlockingOrbit;
      this.orbitControls.enableZoom = true;
      this.orbitControls.enablePan = true;
      return;
    }

    this.orbitControls.enableRotate =
      !this.cameraRotationLocked && !slideBlockingOrbit && touchCfg.oneFingerOrbit;
    this.orbitControls.enableZoom = touchCfg.twoFingerPinchZoom;
    this.orbitControls.enablePan = touchCfg.twoFingerPan;
    this.orbitControls.touches = {
      ONE: this.cameraRotationLocked ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };
    this.orbitControls.enabled = !this.isAnyTransformDragging();
  }

  private handleLongPressContext(clientX: number, clientY: number, pointerType: string): void {
    if (this.loopCutPreviewMode || this.workMode === 'sculpt') return;
    this.suppressOrbitForContextPress = true;
    this.orbitControls.enabled = false;

    if (this.workMode === 'object') {
      const hitObjectId = this.hitTestObject(clientX, clientY, pointerType);
      this.callbacks.onOpenContextMenu({
        clientX,
        clientY,
        hitObjectId,
        hitComponentId: null,
      });
    } else {
      const hitComponentId = this.hitTestEditComponent(clientX, clientY, pointerType);
      this.callbacks.onOpenContextMenu({
        clientX,
        clientY,
        hitObjectId: this.selectedObjectId,
        hitComponentId,
      });
    }
  }

  private hitTestObject(clientX: number, clientY: number, pointerType: string): string | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.activeCamera);

    const solidTargets: THREE.Object3D[] = [];
    const wireTargets: THREE.Object3D[] = [];
    const wireframeOnly = this.displayMode === 'wireframe';
    for (const visual of this.visuals.values()) {
      if (!visual.group.visible || visual.locked) continue;
      if (visual.objectType === 'reference_image' && visual.refPlaneMesh) {
        solidTargets.push(visual.refPlaneMesh);
      } else if (visual.objectType === 'light') {
        if (visual.lightPickMesh && visual.lightPickMesh.visible) {
          solidTargets.push(visual.lightPickMesh);
        } else if (visual.lightWireLines && visual.lightWireLines.visible) {
          wireTargets.push(visual.lightWireLines);
        }
      } else if (!wireframeOnly && visual.hasFaces) {
        solidTargets.push(visual.solidMesh);
      } else {
        wireTargets.push(visual.wireEdges);
      }
    }

    const solidHits = this.raycaster.intersectObjects(solidTargets, false);
    this.raycaster.params.Line.threshold = pointerType === 'touch' ? 0.35 : 0.2;
    const wireHits = this.raycaster.intersectObjects(wireTargets, false);

    let bestHit: { id: string; distance: number } | null = null;
    if (solidHits.length > 0) {
      const id = solidHits[0].object.userData.objectId as string;
      bestHit = { id, distance: solidHits[0].distance };
    }
    if (wireHits.length > 0) {
      const id = wireHits[0].object.userData.objectId as string;
      if (!bestHit || wireHits[0].distance < bestHit.distance) {
        bestHit = { id, distance: wireHits[0].distance };
      }
    }
    return bestHit ? bestHit.id : null;
  }

  private getEditBaseCollider(visual: ObjectVisual): THREE.Mesh | null {
    if (visual.baseEditableMesh.faces.length === 0) return null;
    if (visual.hasActiveModifiers) {
      visual.group.updateMatrixWorld(true);
      visual.baseSolidCollider.matrixWorld.copy(visual.group.matrixWorld);
      return visual.baseSolidCollider;
    }
    return visual.solidMesh;
  }

  private hitTestEditComponent(
    clientX: number,
    clientY: number,
    pointerType: string,
  ): string | null {
    if (!this.selectedObjectId) return null;
    const visual = this.visuals.get(this.selectedObjectId);
    if (!visual) return null;

    const baseMesh = visual.baseEditableMesh;
    const baseCollider = this.getEditBaseCollider(visual);

    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
    const tapPxX = clientX - rect.left;
    const tapPxY = clientY - rect.top;

    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.activeCamera);

    if (!this.loopCutPreviewMode && this.editSelectionMode === 'face') {
      if (!baseCollider) return null;
      const hits = this.raycaster.intersectObject(baseCollider, false);
      if (hits.length > 0 && hits[0].faceIndex != null) {
        return visual.baseTriangleToFaceId[hits[0].faceIndex] ?? null;
      }
      return null;
    }

    const xray = this.isXraySelectionActive();
    const camPos = this.activeCamera.position;
    const targetDist = Math.max(1, camPos.distanceTo(this.orbitControls.target));
    const hitRadius = pointerType === 'touch' ? 26 : 15;
    visual.group.updateMatrixWorld(true);

    const isOccluded = (worldPoint: THREE.Vector3): boolean => {
      if (xray || !baseCollider) return false;
      const projected = _v2.copy(worldPoint).project(this.activeCamera);
      this.raycaster.setFromCamera(new THREE.Vector2(projected.x, projected.y), this.activeCamera);
      const distToPoint = this.raycaster.ray.origin.distanceTo(worldPoint);
      const hits = this.raycaster.intersectObject(baseCollider, false);
      if (hits.length > 0 && hits[0].distance < distToPoint - 0.06) {
        return true;
      }
      return false;
    };

    if (!this.loopCutPreviewMode && this.editSelectionMode === 'vertex') {
      let bestId: string | null = null;
      let bestScore = Infinity;

      for (const v of baseMesh.vertices) {
        _v0.set(v.position[0], v.position[1], v.position[2]).applyMatrix4(visual.group.matrixWorld);
        const worldPos = _v0.clone();
        _v1.copy(worldPos).project(this.activeCamera);
        if (_v1.z < -1 || _v1.z > 1) continue;

        const sx = ((_v1.x + 1) / 2) * rect.width;
        const sy = ((-_v1.y + 1) / 2) * rect.height;
        const pxDist = Math.hypot(sx - tapPxX, sy - tapPxY);
        if (pxDist > hitRadius) continue;
        if (isOccluded(worldPos)) continue;

        const camDist = worldPos.distanceTo(camPos);
        const score = pxDist + (camDist / targetDist) * 2.0;
        if (score < bestScore) {
          bestScore = score;
          bestId = v.id;
        }
      }
      return bestId;
    }

    if (this.loopCutPreviewMode || this.editSelectionMode === 'edge') {
      let bestId: string | null = null;
      let bestScore = Infinity;

      for (const edge of baseMesh.edges) {
        const va = baseMesh.getVertex(edge.v0);
        const vb = baseMesh.getVertex(edge.v1);
        if (!va || !vb) continue;

        const wa = new THREE.Vector3(...va.position).applyMatrix4(visual.group.matrixWorld);
        const wb = new THREE.Vector3(...vb.position).applyMatrix4(visual.group.matrixWorld);

        const pa = wa.clone().project(this.activeCamera);
        const pb = wb.clone().project(this.activeCamera);
        if (pa.z > 1 && pb.z > 1) continue;

        const ax = ((pa.x + 1) / 2) * rect.width;
        const ay = ((-pa.y + 1) / 2) * rect.height;
        const bx = ((pb.x + 1) / 2) * rect.width;
        const by = ((-pb.y + 1) / 2) * rect.height;

        const { dist, t } = distToSegment2D(tapPxX, tapPxY, ax, ay, bx, by);
        if (dist > hitRadius) continue;

        const sampleWorld = wa.clone().lerp(wb, t);
        if (isOccluded(sampleWorld)) continue;

        const camDist = sampleWorld.distanceTo(camPos);
        const score = dist + (camDist / targetDist) * 2.0;
        if (score < bestScore) {
          bestScore = score;
          bestId = edge.id;
        }
      }
      return bestId;
    }

    return null;
  }

  private mergeModifiers(modifiers: TouchModifierState): TouchModifierState {
    return {
      shift: modifiers.shift || this.virtualModifiers.shift,
      ctrl: modifiers.ctrl || this.virtualModifiers.ctrl,
      alt: modifiers.alt || this.virtualModifiers.alt,
    };
  }

  private isBoxSelectAdditive(modifiers: TouchModifierState, shiftKey = false): boolean {
    const effective = this.mergeModifiers(modifiers);
    return Boolean(this.settings?.multiSelectTouch) || effective.shift || shiftKey;
  }

  private toCanvasBoxRect(rect: BoxSelectRect): {
    canvasRect: Rect2D;
    overlay: { left: number; top: number; width: number; height: number };
    width: number;
    height: number;
  } {
    const bounds = this.renderer.domElement.getBoundingClientRect();
    const minX = Math.max(0, Math.min(bounds.width, rect.minX - bounds.left));
    const maxX = Math.max(0, Math.min(bounds.width, rect.maxX - bounds.left));
    const minY = Math.max(0, Math.min(bounds.height, rect.minY - bounds.top));
    const maxY = Math.max(0, Math.min(bounds.height, rect.maxY - bounds.top));
    return {
      canvasRect: { minX, minY, maxX, maxY },
      overlay: {
        left: minX,
        top: minY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
      },
      width: Math.max(1, bounds.width),
      height: Math.max(1, bounds.height),
    };
  }

  private queryObjectsInBox(rect: BoxSelectRect): string[] {
    const { canvasRect, width, height } = this.toCanvasBoxRect(rect);
    if (canvasRect.maxX - canvasRect.minX < 2 && canvasRect.maxY - canvasRect.minY < 2) {
      return [];
    }
    this.activeCamera.updateMatrixWorld(true);
    const matched: string[] = [];

    const projectVec = (v: THREE.Vector3) => {
      const p = v.clone().project(this.activeCamera);
      return {
        x: ((p.x + 1) / 2) * width,
        y: ((-p.y + 1) / 2) * height,
        inFront: p.z >= -1 && p.z <= 1,
      };
    };

    for (const visual of this.visuals.values()) {
      if (!visual.group.visible || visual.locked) continue;
      visual.group.updateMatrixWorld(true);

      if (visual.objectType === 'reference_image' && visual.refPlaneMesh) {
        const posAttr = visual.refPlaneMesh.geometry.getAttribute('position');
        if (!posAttr) continue;
        const pts: { x: number; y: number; inFront: boolean }[] = [];
        let hit = false;
        for (let i = 0; i < posAttr.count; i++) {
          const wv = new THREE.Vector3(
            posAttr.getX(i),
            posAttr.getY(i),
            posAttr.getZ(i),
          ).applyMatrix4(visual.group.matrixWorld);
          const pr = projectVec(wv);
          pts.push(pr);
          if (pr.inFront && isPointInRect2D(pr, canvasRect)) {
            hit = true;
            break;
          }
        }
        if (!hit && pts.length >= 4) {
          const corners = [0, 1, 2, 3].map((idx) => pts[idx]);
          if (
            triangleIntersectsRect2D(corners[0], corners[1], corners[2], canvasRect) ||
            triangleIntersectsRect2D(corners[1], corners[3], corners[2], canvasRect)
          ) {
            hit = true;
          }
        }
        if (hit) matched.push(visual.id);
        continue;
      }

      if (visual.objectType === 'light') {
        const wp = new THREE.Vector3();
        visual.group.getWorldPosition(wp);
        const pr = projectVec(wp);
        if (pr.inFront && isPointInRect2D(pr, canvasRect)) {
          matched.push(visual.id);
        }
        continue;
      }

      const mesh = visual.editableMesh;
      const vertProjMap = new Map<string, { x: number; y: number; inFront: boolean }>();
      let hit = false;

      // 1. Vertex inside box (fast early accept)
      for (const v of mesh.vertices) {
        const wv = new THREE.Vector3(...v.position).applyMatrix4(visual.group.matrixWorld);
        const pr = projectVec(wv);
        vertProjMap.set(v.id, pr);
        if (pr.inFront && isPointInRect2D(pr, canvasRect)) {
          hit = true;
          break;
        }
      }

      // 2. Any mesh edge crossing box
      if (!hit) {
        for (const edge of mesh.edges) {
          const pa = vertProjMap.get(edge.v0);
          const pb = vertProjMap.get(edge.v1);
          if (!pa || !pb || (!pa.inFront && !pb.inFront)) continue;
          if (segmentIntersectsRect2D(pa, pb, canvasRect)) {
            hit = true;
            break;
          }
        }
      }

      // 3. Any face triangle intersecting / enclosing box (handles zoom-in inside a face)
      if (!hit && visual.hasFaces) {
        const posAttr = visual.solidMesh.geometry.getAttribute('position');
        if (posAttr) {
          for (let ti = 0; ti + 2 < posAttr.count; ti += 3) {
            const wa = new THREE.Vector3(
              posAttr.getX(ti),
              posAttr.getY(ti),
              posAttr.getZ(ti),
            ).applyMatrix4(visual.group.matrixWorld);
            const wb = new THREE.Vector3(
              posAttr.getX(ti + 1),
              posAttr.getY(ti + 1),
              posAttr.getZ(ti + 1),
            ).applyMatrix4(visual.group.matrixWorld);
            const wc = new THREE.Vector3(
              posAttr.getX(ti + 2),
              posAttr.getY(ti + 2),
              posAttr.getZ(ti + 2),
            ).applyMatrix4(visual.group.matrixWorld);
            const pa = projectVec(wa);
            const pb = projectVec(wb);
            const pc = projectVec(wc);
            if (!pa.inFront && !pb.inFront && !pc.inFront) continue;
            if (triangleIntersectsRect2D(pa, pb, pc, canvasRect)) {
              hit = true;
              break;
            }
          }
        }
      }

      if (hit) matched.push(visual.id);
    }

    return matched;
  }

  private queryEditComponentsInBox(rect: BoxSelectRect): string[] {
    if (!this.selectedObjectId || this.loopCutPreviewMode) return [];
    const visual = this.visuals.get(this.selectedObjectId);
    if (!visual) return [];

    const { canvasRect, width, height } = this.toCanvasBoxRect(rect);
    if (canvasRect.maxX - canvasRect.minX < 2 && canvasRect.maxY - canvasRect.minY < 2) {
      return [];
    }

    this.activeCamera.updateMatrixWorld(true);
    visual.group.updateMatrixWorld(true);
    const xray = this.isXraySelectionActive();
    const baseCollider = this.getEditBaseCollider(visual);

    const isOccluded = (worldPoint: THREE.Vector3): boolean => {
      if (xray || !baseCollider) return false;
      const projected = _v2.copy(worldPoint).project(this.activeCamera);
      this.raycaster.setFromCamera(new THREE.Vector2(projected.x, projected.y), this.activeCamera);
      const distToPoint = this.raycaster.ray.origin.distanceTo(worldPoint);
      const hits = this.raycaster.intersectObject(baseCollider, false);
      return hits.length > 0 && hits[0].distance < distToPoint - 0.06;
    };

    const projectWorld = (wv: THREE.Vector3) => {
      const p = wv.clone().project(this.activeCamera);
      return {
        x: ((p.x + 1) / 2) * width,
        y: ((-p.y + 1) / 2) * height,
        inFront: p.z >= -1 && p.z <= 1,
      };
    };

    const matched: string[] = [];
    const mesh = visual.baseEditableMesh;

    if (this.editSelectionMode === 'vertex') {
      for (const v of mesh.vertices) {
        const wv = new THREE.Vector3(...v.position).applyMatrix4(visual.group.matrixWorld);
        const pr = projectWorld(wv);
        if (!pr.inFront) continue;
        if (!isPointInRect2D(pr, canvasRect)) continue;
        if (isOccluded(wv)) continue;
        matched.push(v.id);
      }
      return matched;
    }

    if (this.editSelectionMode === 'edge') {
      for (const edge of mesh.edges) {
        const va = mesh.getVertex(edge.v0);
        const vb = mesh.getVertex(edge.v1);
        if (!va || !vb) continue;
        const wa = new THREE.Vector3(...va.position).applyMatrix4(visual.group.matrixWorld);
        const wb = new THREE.Vector3(...vb.position).applyMatrix4(visual.group.matrixWorld);
        const pa = projectWorld(wa);
        const pb = projectWorld(wb);
        if (!pa.inFront && !pb.inFront) continue;
        if (!segmentIntersectsRect2D(pa, pb, canvasRect)) continue;

        if (!xray && baseCollider) {
          // Visible if midpoint or either visible endpoint inside rect is not occluded
          const mid = wa.clone().lerp(wb, 0.5);
          const aIn = pa.inFront && isPointInRect2D(pa, canvasRect);
          const bIn = pb.inFront && isPointInRect2D(pb, canvasRect);
          const visible = !isOccluded(mid) || (aIn && !isOccluded(wa)) || (bIn && !isOccluded(wb));
          if (!visible) continue;
        }
        matched.push(edge.id);
      }
      return matched;
    }

    if (this.editSelectionMode === 'face' && baseCollider) {
      const posAttr = baseCollider.geometry.getAttribute('position');
      if (!posAttr) return [];

      for (const face of mesh.faces) {
        const range = visual.baseFaceToTriangleRange.get(face.id);
        if (!range) continue;

        let triIntersects = false;
        const startVert = range.start * 3;
        const endVert = (range.start + range.count) * 3;
        let visibleTriSample: THREE.Vector3 | null = null;

        for (let vi = startVert; vi + 2 < endVert; vi += 3) {
          const wa = new THREE.Vector3(
            posAttr.getX(vi),
            posAttr.getY(vi),
            posAttr.getZ(vi),
          ).applyMatrix4(visual.group.matrixWorld);
          const wb = new THREE.Vector3(
            posAttr.getX(vi + 1),
            posAttr.getY(vi + 1),
            posAttr.getZ(vi + 1),
          ).applyMatrix4(visual.group.matrixWorld);
          const wc = new THREE.Vector3(
            posAttr.getX(vi + 2),
            posAttr.getY(vi + 2),
            posAttr.getZ(vi + 2),
          ).applyMatrix4(visual.group.matrixWorld);

          const pa = projectWorld(wa);
          const pb = projectWorld(wb);
          const pc = projectWorld(wc);
          if (!pa.inFront && !pb.inFront && !pc.inFront) continue;
          if (triangleIntersectsRect2D(pa, pb, pc, canvasRect)) {
            triIntersects = true;
            if (!xray) {
              const triCenter = wa
                .clone()
                .add(wb)
                .add(wc)
                .multiplyScalar(1 / 3);
              if (!isOccluded(triCenter)) {
                visibleTriSample = triCenter;
                break;
              }
            } else {
              break;
            }
          }
        }

        if (!triIntersects) continue;
        if (!xray && !visibleTriSample) {
          const fc = mesh.computeFaceCenter(face);
          const worldCenter = new THREE.Vector3(...fc).applyMatrix4(visual.group.matrixWorld);
          if (isOccluded(worldCenter)) continue;
        }
        matched.push(face.id);
      }
      return matched;
    }

    return [];
  }

  private refreshBoxSelectPreviewVisuals(): void {
    if (this.workMode === 'object') {
      for (const visual of this.visuals.values()) {
        const objData = this.currentObjectsData.get(visual.id);
        const isSelected =
          this.selectedObjectIds.has(visual.id) || this.boxSelectPreviewObjectIds.has(visual.id);
        if (visual.objectType === 'reference_image' && objData) {
          this.syncReferenceVisual(visual, objData, isSelected);
        } else if (visual.objectType === 'light' && objData) {
          this.syncLightVisual(visual, objData, isSelected);
        } else {
          this.applyObjectDisplayMode(visual, isSelected, false, objData);
        }
      }
    } else if (this.workMode === 'edit') {
      this.syncEditModeOverlays();
    }
    this.requestRender();
  }

  private clearBoxSelectPreview(): void {
    const hadPreview =
      this.boxSelectPreviewObjectIds.size > 0 || this.boxSelectPreviewComponentIds.size > 0;
    this.boxSelectPreviewObjectIds.clear();
    this.boxSelectPreviewComponentIds.clear();
    this.callbacks.onBoxSelectOverlayChange?.(null);
    if (hadPreview) {
      this.refreshBoxSelectPreviewVisuals();
    }
  }

  private handleBoxSelectMove(
    rect: BoxSelectRect,
    modifiers: TouchModifierState,
    shiftKey = false,
  ): void {
    const additive = this.isBoxSelectAdditive(modifiers, shiftKey);
    const { overlay } = this.toCanvasBoxRect(rect);

    if (this.workMode === 'object') {
      const ids = this.queryObjectsInBox(rect);
      this.boxSelectPreviewObjectIds = new Set(ids);
      this.boxSelectPreviewComponentIds.clear();
      this.refreshBoxSelectPreviewVisuals();
      this.callbacks.onBoxSelectOverlayChange?.({
        ...overlay,
        matchCount: ids.length,
        additive,
      });
    } else {
      const ids = this.queryEditComponentsInBox(rect);
      this.boxSelectPreviewComponentIds = new Set(ids);
      this.boxSelectPreviewObjectIds.clear();
      this.refreshBoxSelectPreviewVisuals();
      this.callbacks.onBoxSelectOverlayChange?.({
        ...overlay,
        matchCount: ids.length,
        additive,
      });
    }
  }

  private handleBoxSelectEnd(
    rect: BoxSelectRect,
    modifiers: TouchModifierState,
    shiftKey = false,
  ): void {
    const additive = this.isBoxSelectAdditive(modifiers, shiftKey);
    const ids =
      this.workMode === 'object'
        ? this.queryObjectsInBox(rect)
        : this.queryEditComponentsInBox(rect);

    this.clearBoxSelectPreview();

    if (this.workMode === 'object') {
      this.callbacks.onBoxSelectObjects?.(ids, additive);
    } else {
      this.callbacks.onBoxSelectComponents?.(ids, additive);
    }
  }

  private performTapSelection(
    clientX: number,
    clientY: number,
    pointerType: string,
    additive: boolean,
    addOnly = false,
    ctrl = false,
  ): void {
    if (this.workMode === 'sculpt') return;
    if (this.workMode === 'object') {
      if (ctrl) return;
      const hitId = this.hitTestObject(clientX, clientY, pointerType);
      this.callbacks.onSelectObject(hitId, additive);
      return;
    }

    const hitCompId = this.hitTestEditComponent(clientX, clientY, pointerType);
    if (this.loopCutPreviewMode) {
      if (!ctrl && hitCompId) {
        this.callbacks.onPickLoopCutEdge(hitCompId);
      }
    } else {
      this.callbacks.onSelectComponent(hitCompId, additive, addOnly, ctrl);
    }
  }

  private handleGizmoDragStart(): void {
    if (this.workMode === 'object') {
      if (this.multiGizmoTargetIds.length > 1) {
        this.objectDragStartTransform = null;
        this.multiObjectDragStartTransforms.clear();
        for (const id of this.multiGizmoTargetIds) {
          const visual = this.visuals.get(id);
          if (!visual) continue;
          this.multiObjectDragStartTransforms.set(id, {
            position: [visual.group.position.x, visual.group.position.y, visual.group.position.z],
            rotation: [visual.group.rotation.x, visual.group.rotation.y, visual.group.rotation.z],
            scale: [visual.group.scale.x, visual.group.scale.y, visual.group.scale.z],
          });
        }
        this.multiTransformStartPosition.copy(this.multiSelectionGizmoPivot.position);
        this.multiTransformStartQuaternion.copy(this.multiSelectionGizmoPivot.quaternion);
        this.multiTransformStartScale.copy(this.multiSelectionGizmoPivot.scale);
        return;
      }

      if (!this.selectedObjectId) return;
      const visual = this.visuals.get(this.selectedObjectId);
      if (!visual) return;
      this.multiObjectDragStartTransforms.clear();
      const g = visual.group;
      this.objectDragStartTransform = {
        position: [g.position.x, g.position.y, g.position.z],
        rotation: [g.rotation.x, g.rotation.y, g.rotation.z],
        scale: [g.scale.x, g.scale.y, g.scale.z],
      };
      return;
    }

    if (!this.selectedObjectId) return;
    const visual = this.visuals.get(this.selectedObjectId);
    if (!visual) return;
    this.editDragStartMesh = visual.baseEditableMesh.clone();
    this.editDragStartVertexIds = visual.baseEditableMesh.getVertexIdsFromSelection(
      this.editSelectionMode,
      this.selectedComponentIds,
    );
    this.editDragStartVertexPositions.clear();
    for (const v of this.editDragStartMesh.vertices) {
      this.editDragStartVertexPositions.set(v.id, [...v.position]);
    }
    this.editGizmoAnchor.updateMatrixWorld(true);
    this.editDragStartAnchorPos.copy(this.editGizmoAnchor.position);
    this.editDragStartAnchorInv.copy(this.editGizmoAnchor.matrixWorld).invert();
    this.proportionalDragField = null;
    this.proportionalDragWeights.clear();
    this.proportionalDragRadiusUsed = -1;
    this.proportionalDragFalloffUsed = '';
    this.refreshProportionalDragWeights(true);
  }

  private refreshProportionalDragWeights(forceRebuildField: boolean): void {
    if (
      !this.editDragStartMesh ||
      !this.selectedObjectId ||
      !this.proportionalSettings.enabled ||
      this.editDragStartVertexIds.size === 0
    ) {
      this.proportionalDragField = null;
      this.proportionalDragWeights.clear();
      return;
    }
    const visual = this.visuals.get(this.selectedObjectId);
    if (!visual) return;

    if (
      forceRebuildField ||
      !this.proportionalDragField ||
      this.proportionalDragConnectedUsed !== this.proportionalSettings.connectedOnly
    ) {
      this.proportionalDragField = buildProportionalDistanceField(
        this.editDragStartMesh,
        this.editSelectionMode,
        this.selectedComponentIds,
        {
          connectedOnly: this.proportionalSettings.connectedOnly,
          objectScale: [visual.group.scale.x, visual.group.scale.y, visual.group.scale.z],
        },
      );
      this.proportionalDragConnectedUsed = this.proportionalSettings.connectedOnly;
      this.proportionalDragRadiusUsed = -1;
    }

    if (
      this.proportionalDragRadiusUsed !== this.proportionalSettings.radius ||
      this.proportionalDragFalloffUsed !== this.proportionalSettings.falloff
    ) {
      this.proportionalDragWeights = computeProportionalWeights(
        this.proportionalDragField,
        this.proportionalSettings.radius,
        this.proportionalSettings.falloff,
      );
      this.proportionalDragRadiusUsed = this.proportionalSettings.radius;
      this.proportionalDragFalloffUsed = this.proportionalSettings.falloff;
    }
  }

  private getProportionalPreviewWeights(visual: ObjectVisual): Map<string, number> {
    if (
      this.workMode !== 'edit' ||
      !this.proportionalSettings.enabled ||
      this.selectedComponentIds.size === 0 ||
      this.loopCutPreviewMode
    ) {
      return new Map();
    }
    const sortedIds = Array.from(this.selectedComponentIds).sort().join(',');
    const key = `${visual.id}|${this.editSelectionMode}|${this.proportionalSettings.connectedOnly ? 1 : 0}|${sortedIds}|${visual.group.scale.x.toFixed(4)},${visual.group.scale.y.toFixed(4)},${visual.group.scale.z.toFixed(4)}`;

    if (
      !this.proportionalPreviewField ||
      this.proportionalPreviewKey !== key ||
      this.proportionalPreviewSourceMesh !== visual.baseEditableMesh
    ) {
      this.proportionalPreviewField = buildProportionalDistanceField(
        visual.baseEditableMesh,
        this.editSelectionMode,
        this.selectedComponentIds,
        {
          connectedOnly: this.proportionalSettings.connectedOnly,
          objectScale: [visual.group.scale.x, visual.group.scale.y, visual.group.scale.z],
        },
      );
      this.proportionalPreviewSourceMesh = visual.baseEditableMesh;
      this.proportionalPreviewKey = key;
      this.proportionalPreviewRadiusUsed = -1;
    }

    if (
      this.proportionalPreviewRadiusUsed !== this.proportionalSettings.radius ||
      this.proportionalPreviewFalloffUsed !== this.proportionalSettings.falloff
    ) {
      this.proportionalPreviewWeights = computeProportionalWeights(
        this.proportionalPreviewField,
        this.proportionalSettings.radius,
        this.proportionalSettings.falloff,
      );
      this.proportionalPreviewRadiusUsed = this.proportionalSettings.radius;
      this.proportionalPreviewFalloffUsed = this.proportionalSettings.falloff;
    }

    return this.proportionalPreviewWeights;
  }

  private syncLiveObjectTransformAndMirrors(
    objectId: string,
    liveTransform: ObjectTransform,
    notify = true,
  ): void {
    if (notify) {
      this.callbacks.onLiveObjectTransform(objectId, liveTransform);
    }

    // Update any scene objects referencing this object as a Mirror Object live
    this.sceneTransformRefs = this.sceneTransformRefs.map((ref) =>
      ref.id === objectId
        ? {
            id: ref.id,
            position: liveTransform.position,
            rotation: liveTransform.rotation,
            scale: liveTransform.scale,
          }
        : ref,
    );
    for (const other of this.visuals.values()) {
      if (!other.modifiers || other.modifiers.length === 0) continue;
      const refsDragged = other.modifiers.some(
        (m) =>
          m.enabled &&
          m.type === 'mirror' &&
          normalizeMirrorParams(m.params).mirrorObjectId === objectId,
      );
      if (!refsDragged) continue;
      const ownerObj = this.currentObjectsData.get(other.id);
      if (!ownerObj) continue;
      const ownerRef: ModifierTransformRef = {
        id: ownerObj.id,
        position: ownerObj.id === objectId ? liveTransform.position : ownerObj.transform.position,
        rotation: ownerObj.id === objectId ? liveTransform.rotation : ownerObj.transform.rotation,
        scale: ownerObj.id === objectId ? liveTransform.scale : ownerObj.transform.scale,
      };
      const evalRes = evaluateObjectModifiers(ownerObj.mesh, other.modifiers, {
        ownerTransform: ownerRef,
        sceneTransformRefs: this.sceneTransformRefs,
      });
      other.hasActiveModifiers = evalRes.hasActiveModifiers;
      other.editableMesh = evalRes.hasActiveModifiers
        ? EditableMesh.fromJSON(evalRes.mesh)
        : other.baseEditableMesh;
      this.rebuildObjectGeometry(other);
    }
  }

  private commitEditedMeshToVisual(
    visual: ObjectVisual,
    nextMesh: EditableMesh,
    affectedVertexIds: Set<string>,
  ): void {
    const ownerObj = this.currentObjectsData.get(visual.id);
    const ownerRef: ModifierTransformRef | undefined = ownerObj
      ? {
          id: ownerObj.id,
          position: ownerObj.transform.position,
          rotation: ownerObj.transform.rotation,
          scale: ownerObj.transform.scale,
        }
      : undefined;

    if (visual.modifiers.length > 0) {
      clampVerticesForMirrorClipping(
        nextMesh,
        affectedVertexIds,
        this.editDragStartVertexPositions,
        visual.modifiers,
        ownerRef,
        this.sceneTransformRefs,
      );
    }

    visual.baseEditableMesh = nextMesh;
    if (hasActiveViewportModifiers(visual.modifiers)) {
      const evalRes = evaluateObjectModifiers(nextMesh.toJSON(), visual.modifiers, {
        ownerTransform: ownerRef,
        sceneTransformRefs: this.sceneTransformRefs,
      });
      visual.hasActiveModifiers = evalRes.hasActiveModifiers;
      visual.editableMesh = evalRes.hasActiveModifiers
        ? EditableMesh.fromJSON(evalRes.mesh)
        : nextMesh;
    } else {
      visual.hasActiveModifiers = false;
      visual.editableMesh = nextMesh;
    }
    visual.lastMeshData = null;
    this.rebuildObjectGeometry(visual);
    this.syncEditModeOverlays();
  }

  private handleGizmoObjectChange(): void {
    if (!this.isGizmoDragging) return;

    if (this.workMode === 'object') {
      if (this.multiObjectDragStartTransforms.size > 1) {
        this.applyMultiObjectGizmoTransform();
        return;
      }
      if (!this.selectedObjectId) return;
      const visual = this.visuals.get(this.selectedObjectId);
      if (!visual) return;
      const g = visual.group;
      const liveTransform: ObjectTransform = {
        position: [g.position.x, g.position.y, g.position.z],
        rotation: [g.rotation.x, g.rotation.y, g.rotation.z],
        scale: [g.scale.x, g.scale.y, g.scale.z],
      };
      this.syncLiveObjectTransformAndMirrors(this.selectedObjectId, liveTransform);
      return;
    }

    if (!this.selectedObjectId) return;
    const visual = this.visuals.get(this.selectedObjectId);
    if (!visual) return;
    if (this.editDragStartMesh) {
      // Recompute baseEditableMesh from dragStartMesh using delta matrix
      const nextMesh = this.editDragStartMesh.clone();
      this.editGizmoAnchor.updateMatrixWorld(true);
      visual.group.updateMatrixWorld(true);

      // deltaLocal = M_obj^-1 * deltaWorld * M_obj
      _mat4B.copy(visual.group.matrixWorld).invert();

      let affectedVertexIds: Set<string>;
      if (this.proportionalSettings.enabled) {
        this.refreshProportionalDragWeights(false);
        const deltaPosWorld = _v0.subVectors(
          this.editGizmoAnchor.position,
          this.editDragStartAnchorPos,
        );
        affectedVertexIds = applyProportionalWorldAnchorTransform(
          nextMesh,
          this.editDragStartMesh,
          this.proportionalDragWeights,
          {
            startAnchorWorld: this.editDragStartAnchorPos,
            deltaPosWorld,
            deltaQuatWorld: this.editGizmoAnchor.quaternion,
            deltaScaleWorld: this.editGizmoAnchor.scale,
            objectMatrixWorld: visual.group.matrixWorld,
            objectMatrixWorldInv: _mat4B,
          },
        );
      } else {
        // deltaWorld = M_anchor_curr * M_anchor_start^-1
        _mat4A.multiplyMatrices(this.editGizmoAnchor.matrixWorld, this.editDragStartAnchorInv);
        _mat4C.multiplyMatrices(_mat4B, _mat4A);
        _mat4C.multiply(visual.group.matrixWorld);
        applyTransformToVertices(nextMesh, this.editDragStartVertexIds, _mat4C, [0, 0, 0]);
        affectedVertexIds = this.editDragStartVertexIds;
      }

      this.commitEditedMeshToVisual(visual, nextMesh, affectedVertexIds);
    }
  }

  private handleGizmoDragEnd(): void {
    if (this.workMode === 'object' && this.multiObjectDragStartTransforms.size > 1) {
      const changes: ObjectTransformChange[] = [];
      for (const [id, before] of this.multiObjectDragStartTransforms) {
        const visual = this.visuals.get(id);
        if (!visual) continue;
        changes.push({
          id,
          before,
          after: {
            position: [visual.group.position.x, visual.group.position.y, visual.group.position.z],
            rotation: [visual.group.rotation.x, visual.group.rotation.y, visual.group.rotation.z],
            scale: [visual.group.scale.x, visual.group.scale.y, visual.group.scale.z],
          },
        });
      }
      this.multiObjectDragStartTransforms.clear();
      this.callbacks.onCommitObjectTransforms(changes);
      return;
    }

    if (!this.selectedObjectId) return;
    const visual = this.visuals.get(this.selectedObjectId);
    if (!visual) return;

    if (this.workMode === 'object' && this.objectDragStartTransform) {
      const g = visual.group;
      const after: ObjectTransform = {
        position: [g.position.x, g.position.y, g.position.z],
        rotation: [g.rotation.x, g.rotation.y, g.rotation.z],
        scale: [g.scale.x, g.scale.y, g.scale.z],
      };
      this.callbacks.onCommitObjectTransform(
        this.selectedObjectId,
        this.objectDragStartTransform,
        after,
      );
      this.objectDragStartTransform = null;
    } else if (this.workMode === 'edit' && this.editDragStartMesh) {
      const before = this.editDragStartMesh;
      const after = visual.baseEditableMesh.clone();
      this.editDragStartMesh = null;
      this.editDragStartVertexPositions.clear();
      this.proportionalDragField = null;
      this.proportionalDragWeights.clear();
      this.proportionalPreviewField = null;
      this.callbacks.onCommitMeshEdit(this.selectedObjectId, before, after);
      this.syncGizmoAttachment();
    }
  }

  private applyMultiObjectGizmoTransform(): void {
    const pivot = this.multiSelectionGizmoPivot;
    const deltaRotation = pivot.quaternion
      .clone()
      .multiply(this.multiTransformStartQuaternion.clone().invert())
      .normalize();
    const deltaScale = pivot.scale.clone().divide(this.multiTransformStartScale);
    const deltaPosition = pivot.position.clone().sub(this.multiTransformStartPosition);
    for (const [id, before] of this.multiObjectDragStartTransforms) {
      const visual = this.visuals.get(id);
      if (!visual) continue;

      const position = new THREE.Vector3(...before.position)
        .sub(this.multiTransformStartPosition)
        .applyQuaternion(deltaRotation)
        .multiply(deltaScale)
        .add(this.multiTransformStartPosition)
        .add(deltaPosition);
      const rotation = new THREE.Quaternion()
        .setFromEuler(
          new THREE.Euler(
            before.rotation[0],
            before.rotation[1],
            before.rotation[2],
            visual.group.rotation.order,
          ),
        )
        .premultiply(deltaRotation);
      const scale = new THREE.Vector3(...before.scale).multiply(deltaScale);

      visual.group.position.copy(position);
      visual.group.rotation.setFromQuaternion(rotation, visual.group.rotation.order);
      visual.group.scale.copy(scale);

      const liveTransform: ObjectTransform = {
        position: [position.x, position.y, position.z],
        rotation: [visual.group.rotation.x, visual.group.rotation.y, visual.group.rotation.z],
        scale: [scale.x, scale.y, scale.z],
      };
      this.syncLiveObjectTransformAndMirrors(id, liveTransform, id === this.selectedObjectId);
    }
  }

  private canTrackballRotate(): boolean {
    if (
      !this.selectedObjectId ||
      this.loopCutPreviewMode ||
      this.suppressGizmo ||
      this.workMode === 'sculpt'
    ) {
      return false;
    }
    const visual = this.visuals.get(this.selectedObjectId);
    if (!visual || !visual.group.visible || visual.locked) return false;
    if (this.workMode === 'object') return true;
    const vertIds = visual.baseEditableMesh.getVertexIdsFromSelection(
      this.editSelectionMode,
      this.selectedComponentIds,
    );
    return vertIds.size > 0;
  }

  private projectToTrackball(clientX: number, clientY: number, out: THREE.Vector3): THREE.Vector3 {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    const radius = Math.max(40, Math.min(w, h) * 0.45);
    const x = (clientX - rect.left - w * 0.5) / radius;
    const y = -(clientY - rect.top - h * 0.5) / radius;
    const lenSq = x * x + y * y;
    const z = lenSq <= 0.5 ? Math.sqrt(1 - lenSq) : 0.5 / Math.sqrt(lenSq);
    return out.set(x, y, z).normalize().applyQuaternion(this.activeCamera.quaternion).normalize();
  }

  private applyTrackballEditMesh(visual: ObjectVisual): void {
    if (!this.editDragStartMesh) return;
    const nextMesh = this.editDragStartMesh.clone();
    visual.group.updateMatrixWorld(true);
    _mat4B.copy(visual.group.matrixWorld).invert();

    let affectedVertexIds: Set<string>;
    if (this.proportionalSettings.enabled) {
      this.refreshProportionalDragWeights(false);
      affectedVertexIds = applyProportionalWorldAnchorTransform(
        nextMesh,
        this.editDragStartMesh,
        this.proportionalDragWeights,
        {
          startAnchorWorld: this.editDragStartAnchorPos,
          deltaPosWorld: _zeroVec,
          deltaQuatWorld: this.trackballDeltaQuat,
          deltaScaleWorld: _oneVec,
          objectMatrixWorld: visual.group.matrixWorld,
          objectMatrixWorldInv: _mat4B,
        },
      );
    } else {
      // M_world_delta = T(anchorWorld) * R(deltaQuat) * T(-anchorWorld)
      _mat4A.compose(this.editDragStartAnchorPos, this.trackballDeltaQuat, _oneVec);
      _mat4C.makeTranslation(
        -this.editDragStartAnchorPos.x,
        -this.editDragStartAnchorPos.y,
        -this.editDragStartAnchorPos.z,
      );
      _mat4A.multiply(_mat4C);
      _mat4C.multiplyMatrices(_mat4B, _mat4A);
      _mat4C.multiply(visual.group.matrixWorld);
      applyTransformToVertices(nextMesh, this.editDragStartVertexIds, _mat4C, [0, 0, 0]);
      affectedVertexIds = this.editDragStartVertexIds;
    }

    this.commitEditedMeshToVisual(visual, nextMesh, affectedVertexIds);
  }

  private startTrackballRotate(startX: number, startY: number): void {
    if (!this.canTrackballRotate() || !this.selectedObjectId) return;
    const visual = this.visuals.get(this.selectedObjectId);
    if (!visual) return;

    this.isTrackballDragging = true;
    this.trackballMoved = false;
    this.orbitControls.enabled = false;
    this.projectToTrackball(startX, startY, this.trackballStartVec);
    this.trackballDeltaQuat.identity();

    if (this.workMode === 'object') {
      const g = visual.group;
      this.objectDragStartTransform = {
        position: [g.position.x, g.position.y, g.position.z],
        rotation: [g.rotation.x, g.rotation.y, g.rotation.z],
        scale: [g.scale.x, g.scale.y, g.scale.z],
      };
      this.trackballStartQuat.copy(g.quaternion);
    } else {
      this.editDragStartMesh = visual.baseEditableMesh.clone();
      this.editDragStartVertexIds = visual.baseEditableMesh.getVertexIdsFromSelection(
        this.editSelectionMode,
        this.selectedComponentIds,
      );
      this.editDragStartVertexPositions.clear();
      for (const v of this.editDragStartMesh.vertices) {
        this.editDragStartVertexPositions.set(v.id, [...v.position]);
      }
      const centroidLocal = visual.baseEditableMesh.computeCentroid(this.editDragStartVertexIds);
      if (!centroidLocal) {
        this.isTrackballDragging = false;
        this.editDragStartMesh = null;
        return;
      }
      visual.group.updateMatrixWorld(true);
      this.editDragStartAnchorPos
        .set(centroidLocal[0], centroidLocal[1], centroidLocal[2])
        .applyMatrix4(visual.group.matrixWorld);
      this.proportionalDragField = null;
      this.proportionalDragWeights.clear();
      this.proportionalDragRadiusUsed = -1;
      this.proportionalDragFalloffUsed = '';
      this.refreshProportionalDragWeights(true);
    }

    this.callbacks.onTrackballActiveChange?.(true);
    this.requestRender();
  }

  private updateTrackballRotate(clientX: number, clientY: number): void {
    if (!this.isTrackballDragging || !this.selectedObjectId) return;
    const visual = this.visuals.get(this.selectedObjectId);
    if (!visual) return;

    this.projectToTrackball(clientX, clientY, _tbVecCurr);
    const dot = THREE.MathUtils.clamp(this.trackballStartVec.dot(_tbVecCurr), -1, 1);
    _tbAxis.crossVectors(this.trackballStartVec, _tbVecCurr);
    if (_tbAxis.lengthSq() < 1e-10) {
      this.trackballStartVec.copy(_tbVecCurr);
      return;
    }
    _tbAxis.normalize();
    const angle = Math.acos(dot) * 1.45;
    _tbQuat.setFromAxisAngle(_tbAxis, angle);
    this.trackballDeltaQuat.premultiply(_tbQuat).normalize();
    this.trackballStartVec.copy(_tbVecCurr);
    this.trackballMoved = true;

    if (this.workMode === 'object') {
      const g = visual.group;
      _tbQuatStart.copy(this.trackballDeltaQuat).multiply(this.trackballStartQuat).normalize();
      g.quaternion.copy(_tbQuatStart);
      const liveTransform: ObjectTransform = {
        position: [g.position.x, g.position.y, g.position.z],
        rotation: [g.rotation.x, g.rotation.y, g.rotation.z],
        scale: [g.scale.x, g.scale.y, g.scale.z],
      };
      this.syncLiveObjectTransformAndMirrors(this.selectedObjectId, liveTransform);
    } else if (this.editDragStartMesh) {
      this.applyTrackballEditMesh(visual);
    }

    this.requestRender();
  }

  private endTrackballRotate(): void {
    if (!this.isTrackballDragging) return;
    const wasMoved = this.trackballMoved;
    this.isTrackballDragging = false;
    this.trackballMoved = false;
    this.callbacks.onTrackballActiveChange?.(false);

    const objId = this.selectedObjectId;
    const visual = objId ? this.visuals.get(objId) : undefined;

    if (this.workMode === 'object' && this.objectDragStartTransform) {
      const before = this.objectDragStartTransform;
      this.objectDragStartTransform = null;
      if (wasMoved && objId && visual) {
        const g = visual.group;
        const after: ObjectTransform = {
          position: [g.position.x, g.position.y, g.position.z],
          rotation: [g.rotation.x, g.rotation.y, g.rotation.z],
          scale: [g.scale.x, g.scale.y, g.scale.z],
        };
        this.callbacks.onCommitObjectTransform(objId, before, after);
      }
    } else if (this.workMode === 'edit' && this.editDragStartMesh) {
      const before = this.editDragStartMesh;
      this.editDragStartMesh = null;
      this.editDragStartVertexPositions.clear();
      this.proportionalDragField = null;
      this.proportionalDragWeights.clear();
      this.proportionalPreviewField = null;
      if (wasMoved && objId && visual) {
        const after = visual.baseEditableMesh.clone();
        this.callbacks.onCommitMeshEdit(objId, before, after);
      }
    }

    this.syncGizmoAttachment();
    this.requestRender();
  }

  private cancelTrackballRotate(): void {
    if (!this.isTrackballDragging) return;
    this.isTrackballDragging = false;
    this.trackballMoved = false;
    this.callbacks.onTrackballActiveChange?.(false);

    const visual = this.selectedObjectId ? this.visuals.get(this.selectedObjectId) : undefined;

    if (this.workMode === 'object' && this.objectDragStartTransform) {
      const before = this.objectDragStartTransform;
      this.objectDragStartTransform = null;
      if (visual && this.selectedObjectId) {
        visual.group.position.set(...before.position);
        visual.group.rotation.set(...before.rotation);
        visual.group.scale.set(...before.scale);
        this.syncLiveObjectTransformAndMirrors(this.selectedObjectId, before);
      }
    } else if (this.workMode === 'edit' && this.editDragStartMesh) {
      const before = this.editDragStartMesh;
      this.editDragStartMesh = null;
      this.editDragStartVertexPositions.clear();
      this.proportionalDragField = null;
      this.proportionalDragWeights.clear();
      this.proportionalPreviewField = null;
      if (visual) {
        this.commitEditedMeshToVisual(visual, before, new Set());
      }
    }

    this.syncGizmoAttachment();
    this.requestRender();
  }

  /* ============================================================================
   * G Button Modal Transform: Move (tap) & Vertex / Edge Slide (hold)
   * ========================================================================== */

  private canStartModalTransform(): boolean {
    if (
      !this.modalTransformMode ||
      !this.selectedObjectId ||
      this.loopCutPreviewMode ||
      this.workMode === 'sculpt' ||
      (this.suppressGizmo && this.modalTransformMode === 'move')
    ) {
      return false;
    }
    const visual = this.visuals.get(this.selectedObjectId);
    if (!visual || !visual.group.visible || visual.locked) return false;

    if (this.modalTransformMode === 'move') {
      if (this.workMode === 'object') return true;
      const vertIds = visual.baseEditableMesh.getVertexIdsFromSelection(
        this.editSelectionMode,
        this.selectedComponentIds,
      );
      return vertIds.size > 0;
    }

    if (this.workMode !== 'edit') return false;

    if (this.modalTransformMode === 'vertex_slide') {
      if (this.editSelectionMode !== 'vertex') return false;
      return buildVertexSlidePlan(visual.baseEditableMesh, this.selectedComponentIds).valid;
    }

    if (this.modalTransformMode === 'edge_slide') {
      if (this.editSelectionMode !== 'edge') return false;
      return buildEdgeSlidePlan(visual.baseEditableMesh, this.selectedComponentIds).valid;
    }

    return false;
  }

  private raycastPointerToPlane(
    clientX: number,
    clientY: number,
    plane: THREE.Plane,
    out: THREE.Vector3,
  ): boolean {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    const ndcX = ((clientX - rect.left) / w) * 2 - 1;
    const ndcY = -((clientY - rect.top) / h) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.activeCamera);
    return this.raycaster.ray.intersectPlane(plane, out) !== null;
  }

  private projectWorldPointToCanvasPx(worldPoint: THREE.Vector3): {
    x: number;
    y: number;
  } {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    const p = _v2.copy(worldPoint).project(this.activeCamera);
    return {
      x: (p.x + 1) * 0.5 * w,
      y: (-p.y + 1) * 0.5 * h,
    };
  }

  private applyModalMoveEditMesh(visual: ObjectVisual, deltaWorld: THREE.Vector3): void {
    if (!this.editDragStartMesh) return;
    const nextMesh = this.editDragStartMesh.clone();
    visual.group.updateMatrixWorld(true);
    _mat4B.copy(visual.group.matrixWorld).invert();

    let affectedVertexIds: Set<string>;
    if (this.proportionalSettings.enabled) {
      this.refreshProportionalDragWeights(false);
      _quat.identity();
      affectedVertexIds = applyProportionalWorldAnchorTransform(
        nextMesh,
        this.editDragStartMesh,
        this.proportionalDragWeights,
        {
          startAnchorWorld: this.editDragStartAnchorPos,
          deltaPosWorld: deltaWorld,
          deltaQuatWorld: _quat,
          deltaScaleWorld: _oneVec,
          objectMatrixWorld: visual.group.matrixWorld,
          objectMatrixWorldInv: _mat4B,
        },
      );
    } else {
      _mat4A.makeTranslation(deltaWorld.x, deltaWorld.y, deltaWorld.z);
      _mat4C.multiplyMatrices(_mat4B, _mat4A);
      _mat4C.multiply(visual.group.matrixWorld);
      applyTransformToVertices(nextMesh, this.editDragStartVertexIds, _mat4C, [0, 0, 0]);
      affectedVertexIds = this.editDragStartVertexIds;
    }

    this.commitEditedMeshToVisual(visual, nextMesh, affectedVertexIds);
  }

  private startModalTransform(startX: number, startY: number): void {
    if (!this.canStartModalTransform() || !this.selectedObjectId || !this.modalTransformMode) {
      return;
    }
    const visual = this.visuals.get(this.selectedObjectId);
    if (!visual) return;

    this.isModalDragging = true;
    this.modalMoved = false;
    this.modalStartX = startX;
    this.modalStartY = startY;
    this.modalLastDeltaWorld.set(0, 0, 0);
    this.modalVertexSlidePlan = null;
    this.modalParametricVertexSlidePlan = null;
    this.modalVertexSlideAxisLocked = false;
    this.modalEdgeSlidePlan = null;
    this.modalSlideAxis2D = null;
    this.orbitControls.enabled = false;

    if (this.workMode === 'object') {
      const g = visual.group;
      this.objectDragStartTransform = {
        position: [g.position.x, g.position.y, g.position.z],
        rotation: [g.rotation.x, g.rotation.y, g.rotation.z],
        scale: [g.scale.x, g.scale.y, g.scale.z],
      };
      this.modalStartObjPos.copy(g.position);
      this.editDragStartAnchorPos.copy(g.position);
    } else {
      const isSlideSession =
        !this.modalTransformCommitOnRelease &&
        (this.modalTransformMode === 'vertex_slide' || this.modalTransformMode === 'edge_slide');
      if (isSlideSession && !this.slideSessionBaseMesh) {
        this.slideSessionBaseMesh = visual.baseEditableMesh.clone();
        this.slideSessionFactor = 0;
        this.slideSessionHasChanges = false;
        this.slideSessionVertexSlidePlan = null;
      }
      if (isSlideSession && this.slideSessionBaseMesh) {
        this.editDragStartMesh = this.slideSessionBaseMesh.clone();
        this.modalSlideStartFactor = this.slideSessionFactor;
      } else {
        this.editDragStartMesh = visual.baseEditableMesh.clone();
        this.modalSlideStartFactor = 0;
      }
      this.lastAppliedSlideFactor = this.modalSlideStartFactor;
      this.editDragStartVertexIds = this.editDragStartMesh.getVertexIdsFromSelection(
        this.editSelectionMode,
        this.selectedComponentIds,
      );
      this.editDragStartVertexPositions.clear();
      for (const v of this.editDragStartMesh.vertices) {
        this.editDragStartVertexPositions.set(v.id, [...v.position]);
      }
      const centroidLocal = this.editDragStartMesh.computeCentroid(this.editDragStartVertexIds);
      if (!centroidLocal) {
        this.isModalDragging = false;
        this.editDragStartMesh = null;
        return;
      }
      visual.group.updateMatrixWorld(true);
      this.editDragStartAnchorPos
        .set(centroidLocal[0], centroidLocal[1], centroidLocal[2])
        .applyMatrix4(visual.group.matrixWorld);

      if (this.modalTransformMode === 'move') {
        this.proportionalDragField = null;
        this.proportionalDragWeights.clear();
        this.proportionalDragRadiusUsed = -1;
        this.proportionalDragFalloffUsed = '';
        this.refreshProportionalDragWeights(true);
      } else if (this.modalTransformMode === 'vertex_slide') {
        const plan = buildVertexSlidePlan(this.editDragStartMesh, this.editDragStartVertexIds);
        if (!plan.valid) {
          this.isModalDragging = false;
          this.editDragStartMesh = null;
          return;
        }
        this.modalVertexSlidePlan = plan;
        if (
          isSlideSession &&
          this.slideSessionVertexSlidePlan &&
          Math.abs(this.modalSlideStartFactor) > 1e-5
        ) {
          this.modalParametricVertexSlidePlan = this.slideSessionVertexSlidePlan;
          this.modalVertexSlideAxisLocked = true;
          this.modalSlideAxis2D = this.computeScreenSlideAxis2D(
            visual,
            this.slideSessionVertexSlidePlan.railsByVertex.values(),
            startX,
            startY,
          );
        }
      } else if (this.modalTransformMode === 'edge_slide') {
        const plan = buildEdgeSlidePlan(this.editDragStartMesh, this.selectedComponentIds);
        if (!plan.valid) {
          this.isModalDragging = false;
          this.editDragStartMesh = null;
          return;
        }
        this.modalEdgeSlidePlan = plan;
        this.modalSlideAxis2D = this.computeScreenSlideAxis2D(
          visual,
          plan.railsByVertex.values(),
          startX,
          startY,
        );
      }
    }

    if (this.modalTransformMode === 'move') {
      const camDir = new THREE.Vector3();
      this.activeCamera.getWorldDirection(camDir).normalize();
      if (this.axisConstraint === 'free') {
        this.modalAxisDirWorld.set(0, 0, 0);
        this.modalDragPlane.setFromNormalAndCoplanarPoint(
          camDir.clone().negate(),
          this.editDragStartAnchorPos,
        );
      } else {
        this.modalAxisDirWorld.set(
          this.axisConstraint === 'x' ? 1 : 0,
          this.axisConstraint === 'y' ? 1 : 0,
          this.axisConstraint === 'z' ? 1 : 0,
        );
        const side = new THREE.Vector3().crossVectors(camDir, this.modalAxisDirWorld);
        let planeNormal = new THREE.Vector3().crossVectors(this.modalAxisDirWorld, side);
        if (planeNormal.lengthSq() < 1e-6) {
          planeNormal.copy(camDir).negate();
        } else {
          planeNormal.normalize();
        }
        this.modalDragPlane.setFromNormalAndCoplanarPoint(planeNormal, this.editDragStartAnchorPos);
      }

      if (
        !this.raycastPointerToPlane(
          startX,
          startY,
          this.modalDragPlane,
          this.modalDragStartPointWorld,
        )
      ) {
        this.modalDragStartPointWorld.copy(this.editDragStartAnchorPos);
      }
    }

    const modeLabel =
      this.modalTransformMode === 'vertex_slide'
        ? 'Deslizar vértice'
        : this.modalTransformMode === 'edge_slide'
          ? 'Deslizar arista'
          : 'Mover (G)';
    const pct = Math.round(this.modalSlideStartFactor * 100);
    this.callbacks.onModalTransformStatusChange?.({
      active: true,
      mode: this.modalTransformMode,
      label: modeLabel,
      deltaText:
        this.modalTransformMode === 'move' ? '0.00, 0.00, 0.00' : `${pct >= 0 ? '+' : ''}${pct}%`,
      clamped: false,
    });
    this.requestRender();
  }

  private computeScreenSlideAxis2D(
    visual: ObjectVisual,
    rails: Iterable<Pick<VertexSlideRailPair, 'vertexId' | 'startPos' | 'railA' | 'railB'>>,
    startX: number,
    startY: number,
  ): { dirX: number; dirY: number; lenPosPx: number; lenNegPx: number } {
    visual.group.updateMatrixWorld(true);
    this.activeCamera.updateMatrixWorld(true);
    const rect = this.renderer.domElement.getBoundingClientRect();
    const startPxX = startX - rect.left;
    const startPxY = startY - rect.top;

    interface ProjectedRailSample {
      vAx: number;
      vAy: number;
      hasA: boolean;
      vBx: number;
      vBy: number;
      hasB: boolean;
      weight: number;
      distToStart: number;
      spanPx: number;
    }

    const samples: ProjectedRailSample[] = [];
    for (const rail of rails) {
      const liveV = visual.baseEditableMesh.getVertex(rail.vertexId);
      const p0World = new THREE.Vector3(...rail.startPos).applyMatrix4(visual.group.matrixWorld);
      const p0 = this.projectWorldPointToCanvasPx(p0World);
      const pCursorRef = liveV
        ? this.projectWorldPointToCanvasPx(
            new THREE.Vector3(...liveV.position).applyMatrix4(visual.group.matrixWorld),
          )
        : p0;
      const distToStart = Math.hypot(pCursorRef.x - startPxX, pCursorRef.y - startPxY);
      const weight = 1 / (1 + distToStart / 80);

      let vAx = 0;
      let vAy = 0;
      let hasA = false;
      if (rail.railA) {
        const pAWorld = new THREE.Vector3(...rail.railA).applyMatrix4(visual.group.matrixWorld);
        const pA = this.projectWorldPointToCanvasPx(pAWorld);
        vAx = pA.x - p0.x;
        vAy = pA.y - p0.y;
        hasA = Math.hypot(vAx, vAy) > 1.5;
      }

      let vBx = 0;
      let vBy = 0;
      let hasB = false;
      if (rail.railB) {
        const pBWorld = new THREE.Vector3(...rail.railB).applyMatrix4(visual.group.matrixWorld);
        const pB = this.projectWorldPointToCanvasPx(pBWorld);
        vBx = pB.x - p0.x;
        vBy = pB.y - p0.y;
        hasB = Math.hypot(vBx, vBy) > 1.5;
      }

      if (hasA || hasB) {
        samples.push({
          vAx,
          vAy,
          hasA,
          vBx,
          vBy,
          hasB,
          weight,
          distToStart,
          spanPx: Math.hypot(vAx - vBx, vAy - vBy),
        });
      }
    }

    let sumAx = 0;
    let sumAy = 0;
    let wA = 0;
    let sumBx = 0;
    let sumBy = 0;
    let wB = 0;
    for (const s of samples) {
      if (s.hasA) {
        sumAx += s.vAx * s.weight;
        sumAy += s.vAy * s.weight;
        wA += s.weight;
      }
      if (s.hasB) {
        sumBx += s.vBx * s.weight;
        sumBy += s.vBy * s.weight;
        wB += s.weight;
      }
    }
    const avgAx = wA > 0 ? sumAx / wA : 0;
    const avgAy = wA > 0 ? sumAy / wA : 0;
    const avgBx = wB > 0 ? sumBx / wB : 0;
    const avgBy = wB > 0 ? sumBy / wB : 0;
    const combX = avgAx - avgBx;
    const combY = avgAy - avgBy;
    const combLen = Math.hypot(combX, combY);

    let dirX = 1;
    let dirY = 0;
    let lenPosPx = 75;
    let lenNegPx = 75;

    if (combLen > 8) {
      dirX = combX / combLen;
      dirY = combY / combLen;
      let projPosSum = 0;
      let projPosW = 0;
      let projNegSum = 0;
      let projNegW = 0;
      for (const s of samples) {
        if (s.hasA) {
          const p = Math.abs(s.vAx * dirX + s.vAy * dirY);
          if (p > 2) {
            projPosSum += p * s.weight;
            projPosW += s.weight;
          }
        }
        if (s.hasB) {
          const p = Math.abs(s.vBx * dirX + s.vBy * dirY);
          if (p > 2) {
            projNegSum += p * s.weight;
            projNegW += s.weight;
          }
        }
      }
      const avgPos = projPosW > 0 ? projPosSum / projPosW : Math.abs(avgAx * dirX + avgAy * dirY);
      const avgNeg = projNegW > 0 ? projNegSum / projNegW : Math.abs(avgBx * dirX + avgBy * dirY);
      lenPosPx = Math.max(24, avgPos || avgNeg || 75);
      lenNegPx = Math.max(24, avgNeg || lenPosPx);
    } else if (samples.length > 0) {
      samples.sort((a, b) => a.distToStart - b.distToStart);
      const best = samples.find((s) => s.spanPx > 4) ?? samples[0];
      const localCombX = best.vAx - best.vBx;
      const localCombY = best.vAy - best.vBy;
      const localLen = Math.hypot(localCombX, localCombY);
      if (localLen > 2) {
        dirX = localCombX / localLen;
        dirY = localCombY / localLen;
      }
      const pPos = best.hasA ? Math.abs(best.vAx * dirX + best.vAy * dirY) : 0;
      const pNeg = best.hasB ? Math.abs(best.vBx * dirX + best.vBy * dirY) : 0;
      lenPosPx = Math.max(24, pPos || pNeg || 75);
      lenNegPx = Math.max(24, pNeg || lenPosPx);
    }

    return { dirX, dirY, lenPosPx, lenNegPx };
  }

  private resolveVertexSlidePreferredDirLocal(
    visual: ObjectVisual,
    dragDx: number,
    dragDy: number,
  ): Vec3 | undefined {
    if (!this.editDragStartMesh || !this.modalVertexSlidePlan) return undefined;
    const dragLen = Math.hypot(dragDx, dragDy);
    if (dragLen < 1) return undefined;

    visual.group.updateMatrixWorld(true);
    this.activeCamera.updateMatrixWorld(true);
    const rect = this.renderer.domElement.getBoundingClientRect();
    const startPxX = this.modalStartX - rect.left;
    const startPxY = this.modalStartY - rect.top;

    const selectedVertSet = new Set(this.modalVertexSlidePlan.vertexIds);
    const internalEdgeIds = new Set<string>();
    for (const edge of this.editDragStartMesh.edges) {
      if (selectedVertSet.has(edge.v0) && selectedVertSet.has(edge.v1)) {
        internalEdgeIds.add(edge.id);
      }
    }

    if (internalEdgeIds.size > 0) {
      const chainPlan = buildEdgeSlidePlan(this.editDragStartMesh, internalEdgeIds);
      if (chainPlan.valid && chainPlan.railsByVertex.size > 0) {
        const chainAxis = this.computeScreenSlideAxis2D(
          visual,
          chainPlan.railsByVertex.values(),
          this.modalStartX,
          this.modalStartY,
        );
        const signedChainDot = (dragDx * chainAxis.dirX + dragDy * chainAxis.dirY) / dragLen;
        const chainCos = Math.abs(signedChainDot);

        let maxLongCos = 0;
        for (const eid of internalEdgeIds) {
          const e = this.editDragStartMesh.getEdge(eid);
          if (!e) continue;
          const va = this.editDragStartMesh.getVertex(e.v0);
          const vb = this.editDragStartMesh.getVertex(e.v1);
          if (!va || !vb) continue;
          const p0 = this.projectWorldPointToCanvasPx(
            new THREE.Vector3(...va.position).applyMatrix4(visual.group.matrixWorld),
          );
          const p1 = this.projectWorldPointToCanvasPx(
            new THREE.Vector3(...vb.position).applyMatrix4(visual.group.matrixWorld),
          );
          const vx = p1.x - p0.x;
          const vy = p1.y - p0.y;
          const vLen = Math.hypot(vx, vy);
          if (vLen > 1.5) {
            maxLongCos = Math.max(
              maxLongCos,
              Math.abs((dragDx * vx + dragDy * vy) / (dragLen * vLen)),
            );
          }
        }

        if (chainCos >= 0.32 || chainCos >= maxLongCos * 0.65) {
          return signedChainDot >= 0 ? chainPlan.avgDirA : chainPlan.avgDirB;
        }
      }
    }

    let bestScore = -1;
    let bestDir: Vec3 | undefined;
    for (const vid of this.modalVertexSlidePlan.vertexIds) {
      const options = this.modalVertexSlidePlan.railsByVertex.get(vid);
      if (!options || options.length === 0) continue;
      const p0 = this.projectWorldPointToCanvasPx(
        new THREE.Vector3(...options[0].startPos).applyMatrix4(visual.group.matrixWorld),
      );
      const distToStart = Math.hypot(p0.x - startPxX, p0.y - startPxY);
      const weight = 1 / (1 + distToStart / 80);

      for (const opt of options) {
        const p1 = this.projectWorldPointToCanvasPx(
          new THREE.Vector3(...opt.targetPos).applyMatrix4(visual.group.matrixWorld),
        );
        const vx = p1.x - p0.x;
        const vy = p1.y - p0.y;
        const vLen = Math.hypot(vx, vy);
        if (vLen < 1.5) continue;
        const cos = (dragDx * vx + dragDy * vy) / (dragLen * vLen);
        const score = cos * weight;
        if (score > bestScore) {
          bestScore = score;
          bestDir = opt.dir3D;
        }
      }
    }
    return bestDir;
  }

  private mapSlideDragToNormalizedFactor(
    dragDx: number,
    dragDy: number,
    axis: { dirX: number; dirY: number; lenPosPx: number; lenNegPx: number },
    startFactor: number,
  ): number {
    const proj = dragDx * axis.dirX + dragDy * axis.dirY;
    const lenPos = Math.max(24, axis.lenPosPx);
    const lenNeg = Math.max(24, axis.lenNegPx);
    const startOffsetPx = startFactor >= 0 ? startFactor * lenPos : startFactor * lenNeg;
    const currOffsetPx = startOffsetPx + proj;
    return currOffsetPx >= 0 ? currOffsetPx / lenPos : currOffsetPx / lenNeg;
  }

  private updateModalTransform(clientX: number, clientY: number): void {
    if (!this.isModalDragging || !this.selectedObjectId || !this.modalTransformMode) {
      return;
    }
    const visual = this.visuals.get(this.selectedObjectId);
    if (!visual) return;

    if (this.modalTransformMode === 'move') {
      const hit = this.raycastPointerToPlane(
        clientX,
        clientY,
        this.modalDragPlane,
        _modalCurrPoint,
      );
      if (hit) {
        _modalDelta.subVectors(_modalCurrPoint, this.modalDragStartPointWorld);
      } else {
        // Fallback screen-aligned translation at grazing camera angles
        const dist = this.activeCamera.position.distanceTo(this.editDragStartAnchorPos);
        const scale = Math.max(0.002, dist * 0.002);
        _modalCamRight.set(1, 0, 0).applyQuaternion(this.activeCamera.quaternion);
        _modalCamUp.set(0, 1, 0).applyQuaternion(this.activeCamera.quaternion);
        _modalDelta
          .set(0, 0, 0)
          .addScaledVector(_modalCamRight, (clientX - this.modalStartX) * scale)
          .addScaledVector(_modalCamUp, -(clientY - this.modalStartY) * scale);
      }

      if (this.axisConstraint !== 'free') {
        const proj = _modalDelta.dot(this.modalAxisDirWorld);
        _modalDelta.copy(this.modalAxisDirWorld).multiplyScalar(proj);
      }

      if (this.settings?.snapEnabled) {
        const step = Math.max(1e-4, this.settings.snapTranslateStep || 0.25);
        _modalDelta.x = Math.round(_modalDelta.x / step) * step;
        _modalDelta.y = Math.round(_modalDelta.y / step) * step;
        _modalDelta.z = Math.round(_modalDelta.z / step) * step;
      }

      this.modalMoved = true;
      this.modalLastDeltaWorld.copy(_modalDelta);

      if (this.workMode === 'object') {
        const g = visual.group;
        g.position.copy(this.modalStartObjPos).add(_modalDelta);
        const liveTransform: ObjectTransform = {
          position: [g.position.x, g.position.y, g.position.z],
          rotation: [g.rotation.x, g.rotation.y, g.rotation.z],
          scale: [g.scale.x, g.scale.y, g.scale.z],
        };
        this.syncLiveObjectTransformAndMirrors(this.selectedObjectId, liveTransform);
      } else if (this.editDragStartMesh) {
        this.applyModalMoveEditMesh(visual, _modalDelta);
      }

      this.callbacks.onModalTransformStatusChange?.({
        active: true,
        mode: 'move',
        label:
          this.axisConstraint === 'free'
            ? 'Mover (Libre)'
            : `Mover (${this.axisConstraint.toUpperCase()})`,
        deltaText: `${_modalDelta.x >= 0 ? '+' : ''}${_modalDelta.x.toFixed(2)}, ${_modalDelta.y >= 0 ? '+' : ''}${_modalDelta.y.toFixed(2)}, ${_modalDelta.z >= 0 ? '+' : ''}${_modalDelta.z.toFixed(2)}`,
      });
      this.requestRender();
      return;
    }

    if (
      this.modalTransformMode === 'vertex_slide' &&
      this.editDragStartMesh &&
      this.modalVertexSlidePlan
    ) {
      const dragDx = clientX - this.modalStartX;
      const dragDy = clientY - this.modalStartY;
      const dragLen = Math.hypot(dragDx, dragDy);
      this.modalMoved = true;

      if (
        !this.modalParametricVertexSlidePlan ||
        (!this.modalVertexSlideAxisLocked && dragLen < 12)
      ) {
        const prefDir = this.resolveVertexSlidePreferredDirLocal(visual, dragDx, dragDy);
        if (prefDir) {
          const pPlan = buildParametricVertexSlidePlan(
            this.editDragStartMesh,
            this.editDragStartVertexIds,
            prefDir,
          );
          if (pPlan.valid) {
            this.modalParametricVertexSlidePlan = pPlan;
            this.modalSlideAxis2D = this.computeScreenSlideAxis2D(
              visual,
              pPlan.railsByVertex.values(),
              this.modalStartX,
              this.modalStartY,
            );
          }
        }
      }
      if (this.modalParametricVertexSlidePlan && dragLen >= 12) {
        this.modalVertexSlideAxisLocked = true;
      }

      if (!this.modalParametricVertexSlidePlan || !this.modalSlideAxis2D) {
        this.commitEditedMeshToVisual(visual, this.editDragStartMesh.clone(), new Set());
        this.callbacks.onModalTransformStatusChange?.({
          active: true,
          mode: 'vertex_slide',
          label: 'Deslizar vértice',
          deltaText: '0%',
          clamped: false,
        });
        this.requestRender();
        return;
      }

      const targetFactor = this.mapSlideDragToNormalizedFactor(
        dragDx,
        dragDy,
        this.modalSlideAxis2D,
        this.modalSlideStartFactor,
      );
      const res = applyParametricVertexSlide(
        this.editDragStartMesh,
        this.modalParametricVertexSlidePlan,
        targetFactor,
        this.modalSlideClamp,
      );
      this.lastAppliedSlideFactor = res.appliedFactor;
      this.commitEditedMeshToVisual(visual, res.mesh, res.movedVertexIds);

      const pct = Math.round(res.appliedFactor * 100);
      this.callbacks.onModalTransformStatusChange?.({
        active: true,
        mode: 'vertex_slide',
        label: 'Deslizar vértice',
        deltaText: `${pct >= 0 ? '+' : ''}${pct}%`,
        clamped: res.clamped,
      });
      this.requestRender();
      return;
    }

    if (
      this.modalTransformMode === 'edge_slide' &&
      this.editDragStartMesh &&
      this.modalEdgeSlidePlan &&
      this.modalSlideAxis2D
    ) {
      const dragDx = clientX - this.modalStartX;
      const dragDy = clientY - this.modalStartY;
      const targetFactor = this.mapSlideDragToNormalizedFactor(
        dragDx,
        dragDy,
        this.modalSlideAxis2D,
        this.modalSlideStartFactor,
      );

      this.modalMoved = true;
      const res = applyEdgeSlide(
        this.editDragStartMesh,
        this.modalEdgeSlidePlan,
        targetFactor,
        this.modalSlideClamp,
      );
      this.lastAppliedSlideFactor = res.appliedFactor;
      this.commitEditedMeshToVisual(visual, res.mesh, res.movedVertexIds);

      const pct = Math.round(res.appliedFactor * 100);
      this.callbacks.onModalTransformStatusChange?.({
        active: true,
        mode: 'edge_slide',
        label: 'Deslizar arista',
        deltaText: `${pct >= 0 ? '+' : ''}${pct}%`,
        clamped: res.clamped,
      });
      this.requestRender();
    }
  }

  private endModalTransform(): void {
    if (!this.isModalDragging) return;
    const wasMoved = this.modalMoved;
    const activeMode = this.modalTransformMode;
    const usedVertexPlan = this.modalParametricVertexSlidePlan;
    this.isModalDragging = false;
    this.modalMoved = false;
    this.modalVertexSlidePlan = null;
    this.modalParametricVertexSlidePlan = null;
    this.modalVertexSlideAxisLocked = false;
    this.modalEdgeSlidePlan = null;
    this.modalSlideAxis2D = null;

    const objId = this.selectedObjectId;
    const visual = objId ? this.visuals.get(objId) : undefined;
    let committed = false;

    if (this.workMode === 'object' && this.objectDragStartTransform) {
      this.callbacks.onModalTransformStatusChange?.(null);
      const before = this.objectDragStartTransform;
      this.objectDragStartTransform = null;
      if (wasMoved && objId && visual) {
        const g = visual.group;
        const after: ObjectTransform = {
          position: [g.position.x, g.position.y, g.position.z],
          rotation: [g.rotation.x, g.rotation.y, g.rotation.z],
          scale: [g.scale.x, g.scale.y, g.scale.z],
        };
        this.callbacks.onCommitObjectTransform(objId, before, after);
        committed = true;
      }
    } else if (this.workMode === 'edit' && this.editDragStartMesh) {
      if (
        !this.modalTransformCommitOnRelease &&
        (activeMode === 'vertex_slide' || activeMode === 'edge_slide')
      ) {
        this.editDragStartMesh = null;
        this.editDragStartVertexPositions.clear();
        this.proportionalDragField = null;
        this.proportionalDragWeights.clear();
        this.proportionalPreviewField = null;
        this.slideSessionFactor = this.lastAppliedSlideFactor;
        this.slideSessionHasChanges = Math.abs(this.slideSessionFactor) > 1e-5;
        if (activeMode === 'vertex_slide') {
          this.slideSessionVertexSlidePlan = this.slideSessionHasChanges ? usedVertexPlan : null;
        }
        const pct = Math.round(this.slideSessionFactor * 100);
        this.callbacks.onModalTransformStatusChange?.({
          active: false,
          mode: activeMode,
          label: activeMode === 'vertex_slide' ? 'Vertex Slide' : 'Edge Slide',
          deltaText: this.slideSessionHasChanges
            ? `${pct >= 0 ? '+' : ''}${pct}%`
            : 'Arrastra sobre la malla',
        });
        this.syncGizmoAttachment();
        this.requestRender();
        return;
      }

      this.callbacks.onModalTransformStatusChange?.(null);
      const before = this.editDragStartMesh;
      this.editDragStartMesh = null;
      this.editDragStartVertexPositions.clear();
      this.proportionalDragField = null;
      this.proportionalDragWeights.clear();
      this.proportionalPreviewField = null;
      if (wasMoved && objId && visual) {
        const after = visual.baseEditableMesh.clone();
        this.callbacks.onCommitMeshEdit(objId, before, after);
        committed = true;
      }
    } else {
      this.callbacks.onModalTransformStatusChange?.(null);
    }

    this.callbacks.onCompleteModalTransform?.(committed);
    this.syncGizmoAttachment();
    this.requestRender();
  }

  public confirmModalSlidePreview(): boolean {
    if (this.isModalDragging) {
      this.endModalTransform();
    }
    const objId = this.selectedObjectId;
    const visual = objId ? this.visuals.get(objId) : undefined;
    if (
      this.workMode === 'edit' &&
      objId &&
      visual &&
      this.slideSessionBaseMesh &&
      this.slideSessionHasChanges
    ) {
      const before = this.slideSessionBaseMesh;
      const after = visual.baseEditableMesh.clone();
      this.slideSessionBaseMesh = null;
      this.slideSessionFactor = 0;
      this.modalSlideStartFactor = 0;
      this.lastAppliedSlideFactor = 0;
      this.slideSessionHasChanges = false;
      this.slideSessionVertexSlidePlan = null;
      this.callbacks.onModalTransformStatusChange?.(null);
      this.callbacks.onCommitMeshEdit(objId, before, after);
      this.callbacks.onCompleteModalTransform?.(true);
      this.syncGizmoAttachment();
      this.requestRender();
      return true;
    }
    this.slideSessionBaseMesh = null;
    this.slideSessionFactor = 0;
    this.modalSlideStartFactor = 0;
    this.lastAppliedSlideFactor = 0;
    this.slideSessionHasChanges = false;
    this.slideSessionVertexSlidePlan = null;
    this.callbacks.onModalTransformStatusChange?.(null);
    this.callbacks.onCompleteModalTransform?.(true);
    this.syncGizmoAttachment();
    this.requestRender();
    return false;
  }

  private cancelModalTransform(): void {
    if (
      !this.isModalDragging &&
      !this.objectDragStartTransform &&
      !this.editDragStartMesh &&
      !this.slideSessionBaseMesh
    ) {
      this.callbacks.onModalTransformStatusChange?.(null);
      return;
    }
    this.isModalDragging = false;
    this.modalMoved = false;
    this.modalVertexSlidePlan = null;
    this.modalParametricVertexSlidePlan = null;
    this.modalVertexSlideAxisLocked = false;
    this.modalEdgeSlidePlan = null;
    this.modalSlideAxis2D = null;
    this.callbacks.onModalTransformStatusChange?.(null);

    const visual = this.selectedObjectId ? this.visuals.get(this.selectedObjectId) : undefined;

    if (this.workMode === 'object' && this.objectDragStartTransform) {
      const before = this.objectDragStartTransform;
      this.objectDragStartTransform = null;
      if (visual && this.selectedObjectId) {
        visual.group.position.set(...before.position);
        visual.group.rotation.set(...before.rotation);
        visual.group.scale.set(...before.scale);
        this.syncLiveObjectTransformAndMirrors(this.selectedObjectId, before);
      }
    } else if (this.workMode === 'edit' && (this.slideSessionBaseMesh || this.editDragStartMesh)) {
      const before = (this.slideSessionBaseMesh ?? this.editDragStartMesh)!;
      this.slideSessionBaseMesh = null;
      this.slideSessionFactor = 0;
      this.modalSlideStartFactor = 0;
      this.lastAppliedSlideFactor = 0;
      this.slideSessionHasChanges = false;
      this.slideSessionVertexSlidePlan = null;
      this.editDragStartMesh = null;
      this.editDragStartVertexPositions.clear();
      this.proportionalDragField = null;
      this.proportionalDragWeights.clear();
      this.proportionalPreviewField = null;
      if (visual) {
        this.commitEditedMeshToVisual(visual, before, new Set());
      }
    } else {
      this.slideSessionBaseMesh = null;
      this.slideSessionFactor = 0;
      this.modalSlideStartFactor = 0;
      this.lastAppliedSlideFactor = 0;
      this.slideSessionHasChanges = false;
      this.slideSessionVertexSlidePlan = null;
    }

    this.syncGizmoAttachment();
    this.requestRender();
  }

  private buildModifiersSignature(
    objData: SceneObjectData,
    transformRefs: ModifierTransformRef[],
  ): string {
    const mods = objData.modifiers ?? [];
    if (mods.length === 0) return '';
    const refMap = new Map(transformRefs.map((r) => [r.id, r]));
    const refTransforms: ModifierTransformRef[] = [];
    let needsOwner = false;
    for (const m of mods) {
      if (!m.enabled || m.showInViewport === false) continue;
      if (m.type === 'mirror') {
        const p = normalizeMirrorParams(m.params);
        if (p.mirrorObjectId) {
          needsOwner = true;
          const targetRef = refMap.get(p.mirrorObjectId);
          if (targetRef) refTransforms.push(targetRef);
        }
      }
    }
    return JSON.stringify({
      mods,
      owner: needsOwner ? objData.transform : null,
      refs: refTransforms,
    });
  }

  public syncScene(params: {
    objects: SceneObjectData[];
    materials?: MaterialAsset[];
    selectedObjectId: string | null;
    selectedObjectIds?: Set<string>;
    workMode: WorkMode;
    editSelectionMode: EditSelectionMode;
    selectedComponentIds: Set<string>;
    activeTool: TransformTool;
    axisConstraint: AxisConstraint;
    projection: CameraProjection;
    settings: ModelerSettings;
    meshRevision: number;
    suppressGizmo?: boolean;
    virtualModifiers?: TouchModifierState;
    loopCutPreviewMode?: boolean;
    loopCutPreviewSegments?: [Vec3, Vec3][];
    loopCutPreviewRingEdgeIds?: string[];
    loopCutPreviewFaceIds?: string[];
    loopCutSlideActive?: boolean;
    mergeCursorPosition?: Vec3 | null;
    modalTransformMode?: ModalGMode | null;
    modalTransformCommitOnRelease?: boolean;
    modalSlideClamp?: boolean;
    modalCancelNonce?: number;
    cameraRotationLocked?: boolean;
    highlightedNgonObjectId?: string | null;
    highlightedNgonFaceIds?: string[];
    sculptSettings?: SculptSettings;
  }): void {
    if (
      params.modalCancelNonce !== undefined &&
      params.modalCancelNonce !== this.modalCancelNonce
    ) {
      this.modalCancelNonce = params.modalCancelNonce;
      this.cancelModalTransform();
    }
    this.modalTransformMode = params.modalTransformMode ?? null;
    this.modalTransformCommitOnRelease = params.modalTransformCommitOnRelease ?? true;
    this.modalSlideClamp = params.modalSlideClamp ?? true;
    if (!this.modalTransformMode) {
      this.slideSessionBaseMesh = null;
      this.slideSessionFactor = 0;
      this.modalSlideStartFactor = 0;
      this.lastAppliedSlideFactor = 0;
      this.slideSessionHasChanges = false;
      this.slideSessionVertexSlidePlan = null;
    }
    this.cameraRotationLocked = Boolean(params.cameraRotationLocked);

    this.virtualModifiers = params.virtualModifiers
      ? { ...params.virtualModifiers }
      : { ...EMPTY_MODIFIER_STATE };
    this.gestureManager.setExternalModifiers(this.virtualModifiers);
    if (this.selectedObjectId !== params.selectedObjectId) {
      this.sculptCursorLastWorldPoint = null;
      this.sculptCursorLastWorldNormal = null;
      this.sculptCursorGroup.visible = false;
      this.sculptCursorMirrorGroup.visible = false;
    }
    this.selectedObjectId = params.selectedObjectId;
    const nextSelObjs = new Set<string>(
      params.selectedObjectIds ? Array.from(params.selectedObjectIds) : [],
    );
    if (params.selectedObjectId) nextSelObjs.add(params.selectedObjectId);
    this.selectedObjectIds = nextSelObjs;
    this.currentObjectsData = new Map(params.objects.map((o) => [o.id, o]));
    this.syncSharedMaterials(params.materials ?? []);
    this.sceneTransformRefs = buildTransformRefsFromObjects(params.objects);

    this.workMode = params.workMode;
    if (params.sculptSettings) {
      this.sculptSettings = {
        ...params.sculptSettings,
        symmetry: { ...params.sculptSettings.symmetry },
      };
      if (this.workMode === 'sculpt' && this.sculptCursorLastWorldPoint && this.selectedObjectId) {
        this.updateSculptCursorVisual(
          this.sculptCursorLastWorldPoint,
          this.sculptCursorLastWorldNormal ?? undefined,
        );
      }
    }
    if (this.workMode !== 'sculpt') {
      if (this.sculptStrokeSession) {
        this.finishActiveSculptStroke(true);
      }
      this.sculptCursorGroup.visible = false;
      this.sculptCursorMirrorGroup.visible = false;
      this.sculptCursorLastWorldPoint = null;
      this.sculptCursorLastWorldNormal = null;
      this.sculptCursorMirrorPoints.forEach((point) => {
        point.visible = false;
      });
    }
    this.editSelectionMode = params.editSelectionMode;
    this.selectedComponentIds = new Set(params.selectedComponentIds);
    this.activeTool = params.activeTool;
    this.axisConstraint = params.axisConstraint;
    this.settings = params.settings;
    const prevProp = this.proportionalSettings;
    const nextProp = normalizeProportionalSettings(params.settings.proportionalEditing);
    const propChanged =
      prevProp.enabled !== nextProp.enabled ||
      Math.abs(prevProp.radius - nextProp.radius) > 1e-6 ||
      prevProp.falloff !== nextProp.falloff ||
      prevProp.connectedOnly !== nextProp.connectedOnly;
    this.proportionalSettings = nextProp;
    this.displayMode = params.settings.displayMode ?? 'solid';
    this.xrayTransparency = Math.max(10, Math.min(90, params.settings.xrayTransparency ?? 50));
    this.showFaceOrientation = Boolean(params.settings.showFaceOrientation);
    this.gestureManager.updateConfig(params.settings.touch);
    this.gestureManager.syncWorkMode(params.workMode);
    this.suppressGizmo =
      Boolean(params.suppressGizmo) ||
      this.modalTransformMode === 'vertex_slide' ||
      this.modalTransformMode === 'edge_slide';
    this.loopCutPreviewMode = Boolean(params.loopCutPreviewMode);
    this.loopCutPreviewSegments = params.loopCutPreviewSegments ?? [];
    this.loopCutPreviewRingEdgeIds = new Set(params.loopCutPreviewRingEdgeIds ?? []);
    this.loopCutPreviewFaceIds = new Set(params.loopCutPreviewFaceIds ?? []);
    this.loopCutSlideActive = Boolean(params.loopCutSlideActive);
    if (!this.loopCutPreviewMode || !this.loopCutSlideActive) {
      this.loopCutSlidePointerId = null;
    }
    this.orbitControls.enableRotate =
      !this.cameraRotationLocked && !(this.loopCutPreviewMode && this.loopCutSlideActive);
    this.orbitControls.touches = {
      ONE: this.cameraRotationLocked ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };
    if (params.mergeCursorPosition && params.workMode === 'edit') {
      this.mergeCursorMarker.position.set(...params.mergeCursorPosition);
      this.mergeCursorMarker.visible = true;
    } else {
      this.mergeCursorMarker.visible = false;
    }

    // Grid & Axes visibility
    this.gridHelper.visible = params.settings.showGrid;
    this.axesGroup.visible = params.settings.showAxes;

    // Projection switching
    if (this.projection !== params.projection) {
      this.switchProjection(params.projection);
    }

    // Reconcile objects
    const seen = new Set<string>();
    for (const objData of params.objects) {
      seen.add(objData.id);
      let visual = this.visuals.get(objData.id);
      if (!visual) {
        visual = this.createObjectVisual(objData);
        this.visuals.set(objData.id, visual);
        this.objectsGroup.add(visual.group);
      }

      visual.group.visible = objData.visible;
      visual.locked = objData.locked;

      // Keep every selected object under the gizmo in sync while a group drag is live.
      if (!(
        this.isAnyTransformDragging() &&
        this.workMode === 'object' &&
        (this.selectedObjectId === objData.id ||
          this.multiObjectDragStartTransforms.has(objData.id))
      )) {
        visual.group.position.set(...objData.transform.position);
        visual.group.rotation.set(...objData.transform.rotation);
        visual.group.scale.set(...objData.transform.scale);
      }

      const isSelected =
        this.selectedObjectIds.has(objData.id) || this.boxSelectPreviewObjectIds.has(objData.id);

      // Update mesh geometry, light, or reference image properties
      if (objData.objectType === 'reference_image' && objData.referenceImage) {
        this.syncReferenceVisual(visual, objData, isSelected);
      } else if (objData.objectType === 'light') {
        this.syncLightVisual(visual, objData, isSelected);
      } else {
        const nextPrimaryMatId = objData.materialId ?? null;
        if (!(
          (this.isAnyTransformDragging() || this.slideSessionBaseMesh !== null) &&
          this.workMode === 'edit' &&
          this.selectedObjectId === objData.id
        )) {
          const modSig = this.buildModifiersSignature(objData, this.sceneTransformRefs);
          const nextShading: ObjectShadingMode = objData.shading === 'smooth' ? 'smooth' : 'flat';
          if (
            visual.lastMeshData !== objData.mesh ||
            visual.group.userData.meshRevision !== params.meshRevision ||
            visual.modifiersSignature !== modSig ||
            visual.shading !== nextShading ||
            visual.materialId !== nextPrimaryMatId
          ) {
            visual.modifiers = objData.modifiers ?? [];
            visual.modifiersSignature = modSig;
            visual.shading = nextShading;
            visual.materialId = nextPrimaryMatId;
            visual.baseEditableMesh = EditableMesh.fromJSON(objData.mesh);
            visual.lastMeshData = objData.mesh;

            if (hasActiveViewportModifiers(visual.modifiers)) {
              const ownerRef: ModifierTransformRef = {
                id: objData.id,
                position: objData.transform.position,
                rotation: objData.transform.rotation,
                scale: objData.transform.scale,
              };
              const evalRes = evaluateObjectModifiers(objData.mesh, visual.modifiers, {
                ownerTransform: ownerRef,
                sceneTransformRefs: this.sceneTransformRefs,
              });
              visual.hasActiveModifiers = evalRes.hasActiveModifiers;
              visual.editableMesh = evalRes.hasActiveModifiers
                ? EditableMesh.fromJSON(evalRes.mesh)
                : visual.baseEditableMesh;
            } else {
              visual.hasActiveModifiers = false;
              visual.editableMesh = visual.baseEditableMesh;
            }

            this.rebuildObjectGeometry(visual);
            visual.group.userData.meshRevision = params.meshRevision;
          }
        }

        visual.materialId = nextPrimaryMatId;
        const inEditOnThis = objData.id === params.selectedObjectId && params.workMode === 'edit';
        this.applyObjectDisplayMode(visual, isSelected, inEditOnThis, objData);
      }
    }

    // Remove deleted visuals
    for (const [id, visual] of this.visuals.entries()) {
      if (!seen.has(id)) {
        this.objectsGroup.remove(visual.group);
        this.disposeObjectVisual(visual);
        this.visuals.delete(id);
      }
    }
    this.pruneUnusedSharedMaterials();

    if (
      propChanged &&
      this.isAnyTransformDragging() &&
      this.workMode === 'edit' &&
      this.editDragStartMesh
    ) {
      this.refreshProportionalDragWeights(false);
      if (this.isTrackballDragging && this.selectedObjectId) {
        const visual = this.visuals.get(this.selectedObjectId);
        if (visual) this.applyTrackballEditMesh(visual);
      } else if (
        this.isModalDragging &&
        this.modalTransformMode === 'move' &&
        this.selectedObjectId
      ) {
        const visual = this.visuals.get(this.selectedObjectId);
        if (visual) {
          this.applyModalMoveEditMesh(visual, this.modalLastDeltaWorld);
        }
      } else {
        this.handleGizmoObjectChange();
      }
    } else {
      this.syncEditModeOverlays();
    }
    this.syncGizmoSettings();
    if (!this.isAnyTransformDragging()) {
      this.syncGizmoAttachment();
    }

    this.highlightedNgonObjectId = params.highlightedNgonObjectId ?? null;
    this.highlightedNgonFaceIds = params.highlightedNgonFaceIds ?? [];
    this.syncNgonHighlightOverlay();

    this.requestRender();
  }

  private syncNgonHighlightOverlay(): void {
    if (!this.highlightedNgonObjectId || this.highlightedNgonFaceIds.length === 0) {
      this.ngonOverlayGroup.visible = false;
      return;
    }

    const visual = this.visuals.get(this.highlightedNgonObjectId);
    if (!visual || !visual.group.visible) {
      this.ngonOverlayGroup.visible = false;
      return;
    }

    this.ngonOverlayGroup.position.copy(visual.group.position);
    this.ngonOverlayGroup.rotation.copy(visual.group.rotation);
    this.ngonOverlayGroup.scale.copy(visual.group.scale);

    const triPositions: number[] = [];
    const edgePositions: number[] = [];

    const basePosAttr = (
      visual.hasActiveModifiers ? visual.baseSolidCollider : visual.solidMesh
    ).geometry.getAttribute('position');
    const evalPosAttr = visual.solidMesh.geometry.getAttribute('position');

    for (const fid of this.highlightedNgonFaceIds) {
      const baseRange = visual.baseFaceToTriangleRange.get(fid);
      if (baseRange && basePosAttr) {
        const startVert = baseRange.start * 3;
        const endVert = (baseRange.start + baseRange.count) * 3;
        for (let vi = startVert; vi < endVert; vi++) {
          triPositions.push(basePosAttr.getX(vi), basePosAttr.getY(vi), basePosAttr.getZ(vi));
        }
      } else {
        const evalRange = visual.faceToTriangleRange.get(fid);
        if (evalRange && evalPosAttr) {
          const startVert = evalRange.start * 3;
          const endVert = (evalRange.start + evalRange.count) * 3;
          for (let vi = startVert; vi < endVert; vi++) {
            triPositions.push(evalPosAttr.getX(vi), evalPosAttr.getY(vi), evalPosAttr.getZ(vi));
          }
        }
      }

      const baseFace = visual.baseEditableMesh.getFace(fid);
      const sourceMeshForFace = baseFace ? visual.baseEditableMesh : visual.editableMesh;
      const faceObj = baseFace ?? visual.editableMesh.getFace(fid);
      if (faceObj && faceObj.vertexIds.length >= 3) {
        const n = faceObj.vertexIds.length;
        for (let i = 0; i < n; i++) {
          const va = sourceMeshForFace.getVertex(faceObj.vertexIds[i]);
          const vb = sourceMeshForFace.getVertex(faceObj.vertexIds[(i + 1) % n]);
          if (va && vb) {
            edgePositions.push(...va.position, ...vb.position);
          }
        }
      }
    }

    const triGeo = new THREE.BufferGeometry();
    triGeo.setAttribute('position', new THREE.Float32BufferAttribute(triPositions, 3));
    this.ngonHighlightMesh.geometry.dispose();
    this.ngonHighlightMesh.geometry = triGeo;
    this.ngonHighlightMesh.visible = triPositions.length > 0;

    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));
    this.ngonHighlightEdges.geometry.dispose();
    this.ngonHighlightEdges.geometry = edgeGeo;
    this.ngonHighlightEdges.visible = edgePositions.length > 0;

    this.ngonOverlayGroup.visible = triPositions.length > 0 || edgePositions.length > 0;
  }

  private syncSharedMaterials(materials: MaterialAsset[]): void {
    this.materialAssetMap.clear();
    for (const mat of materials) {
      this.materialAssetMap.set(mat.id, mat);
      let threeMat = this.sharedMaterials.get(mat.id);
      const evaluation = mat.nodeGraph
        ? evaluateMaterialNodeGraph(mat.nodeGraph, mat)
        : null;
      const surface: EvaluatedMaterialSurface = evaluation?.ok
        ? evaluation.surface
        : {
            baseColor: mat.baseColor,
            baseColorTextureUrl: mat.textureDataUrl,
            textureName: mat.textureName,
            metallic: mat.metallic,
            roughness: mat.roughness,
            opacity: mat.opacity ?? 1,
            ior: 1.45,
            specular: 0.5,
            emissionColor: mat.emissiveColor ?? '#000000',
            emissionIntensity: mat.emissiveIntensity ?? 0,
          };
      const textureDataUrl = surface.baseColorTextureUrl;
      const opacity = Math.max(0.02, Math.min(1, surface.opacity ?? 1));
      const isTransparent = opacity < 0.999;
      if (!threeMat) {
        threeMat = new THREE.MeshPhysicalMaterial({
          color: textureDataUrl ? '#ffffff' : surface.baseColor,
          metalness: surface.metallic,
          roughness: surface.roughness,
          ior: surface.ior,
          specularIntensity: surface.specular,
          opacity,
          transparent: isTransparent,
          depthWrite: !isTransparent,
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1,
        });
        if (surface.emissionColor && surface.emissionIntensity) {
          threeMat.emissive.set(surface.emissionColor);
          threeMat.emissiveIntensity = surface.emissionIntensity;
        }
        this.sharedMaterials.set(mat.id, threeMat);
      } else {
        threeMat.color.set(textureDataUrl ? '#ffffff' : surface.baseColor);
        threeMat.metalness = surface.metallic;
        threeMat.roughness = surface.roughness;
        threeMat.ior = surface.ior;
        threeMat.specularIntensity = surface.specular;
        if (threeMat.transparent !== isTransparent) {
          threeMat.transparent = isTransparent;
          threeMat.needsUpdate = true;
        }
        threeMat.opacity = opacity;
        threeMat.depthWrite = !isTransparent;
        if (surface.emissionColor && surface.emissionIntensity) {
          threeMat.emissive.set(surface.emissionColor);
          threeMat.emissiveIntensity = surface.emissionIntensity;
        } else {
          threeMat.emissive.setHex(0x000000);
          threeMat.emissiveIntensity = 1;
        }
      }
      this.syncSharedMaterialTexture(
        mat,
        threeMat,
        'map',
        textureDataUrl,
        surface.textureTransform,
      );
      this.syncSharedMaterialTexture(
        mat,
        threeMat,
        'normalMap',
        surface.normalTextureUrl,
        surface.normalTextureTransform,
      );
      const normalStrength = surface.normalMapStrength ?? 1;
      threeMat.normalScale.set(normalStrength, normalStrength);
      this.syncSharedMaterialTexture(
        mat,
        threeMat,
        'bumpMap',
        surface.bumpTextureUrl,
        surface.bumpTextureTransform,
      );
      threeMat.bumpScale = surface.bumpScale ?? 1;
    }
  }

  private syncSharedMaterialTexture(
    materialAsset: MaterialAsset,
    material: THREE.MeshStandardMaterial,
    channel: 'map' | 'normalMap' | 'bumpMap',
    dataUrl: string | undefined,
    transform?: EvaluatedMaterialSurface['textureTransform'],
  ): void {
    const materialTextures =
      this.sharedMaterialTextures.get(materialAsset.id) ?? {};
    const current = materialTextures[channel];
    const applyTransform = (texture: THREE.Texture) => {
      const location = transform?.location ?? [0, 0, 0];
      const rotation = transform?.rotation ?? [0, 0, 0];
      const scale = transform?.scale ?? [1, 1, 1];
      texture.offset.set(location[0], location[1]);
      texture.repeat.set(scale[0], scale[1]);
      texture.rotation = rotation[2];
      texture.wrapS =
        scale[0] === 1 ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
      texture.wrapT =
        scale[1] === 1 ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
      texture.needsUpdate = true;
    };
    if (!dataUrl) {
      if (current) {
        current.texture.dispose();
        delete materialTextures[channel];
        if (Object.keys(materialTextures).length === 0) {
          this.sharedMaterialTextures.delete(materialAsset.id);
        } else {
          this.sharedMaterialTextures.set(materialAsset.id, materialTextures);
        }
      }
      if (material[channel]) {
        material[channel] = null;
        material.needsUpdate = true;
      }
      return;
    }
    if (current?.dataUrl === dataUrl) {
      applyTransform(current.texture);
      if (material[channel] !== current.texture) {
        material[channel] = current.texture;
        material.needsUpdate = true;
      }
      return;
    }

    current?.texture.dispose();
    const texture = new THREE.TextureLoader().load(
      dataUrl,
      () => {
        if (
          this.sharedMaterialTextures.get(materialAsset.id)?.[channel]
            ?.texture !== texture
        ) {
          return;
        }
        texture.colorSpace =
          channel === 'map' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        applyTransform(texture);
      },
      undefined,
      (error) => {
        if (
          this.sharedMaterialTextures.get(materialAsset.id)?.[channel]
            ?.texture !== texture
        ) {
          return;
        }
        console.error(
          `No se pudo cargar la textura "${materialAsset.textureName ?? materialAsset.name}".`,
          error,
        );
        delete materialTextures[channel];
        if (Object.keys(materialTextures).length === 0) {
          this.sharedMaterialTextures.delete(materialAsset.id);
        } else {
          this.sharedMaterialTextures.set(materialAsset.id, materialTextures);
        }
        if (material[channel] === texture) {
          material[channel] = null;
          material.needsUpdate = true;
        }
        texture.dispose();
      },
    );
    texture.colorSpace =
      channel === 'map' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    applyTransform(texture);
    materialTextures[channel] = { dataUrl, texture };
    this.sharedMaterialTextures.set(materialAsset.id, materialTextures);
    material[channel] = texture;
    material.needsUpdate = true;
  }

  private pruneUnusedSharedMaterials(): void {
    for (const [id, mat] of this.sharedMaterials.entries()) {
      if (!this.materialAssetMap.has(id)) {
        mat.dispose();
        this.sharedMaterials.delete(id);
        const textures = this.sharedMaterialTextures.get(id);
        Object.values(textures ?? {}).forEach((entry) => entry?.texture.dispose());
        this.sharedMaterialTextures.delete(id);
      }
    }
  }

  private getOrCreateMaterialForObject(
    objData: SceneObjectData,
    fallback: THREE.MeshStandardMaterial,
  ): THREE.MeshStandardMaterial {
    const matList = Array.from(this.materialAssetMap.values());
    const resolved = resolveObjectMaterial(objData, matList);
    const pooled = this.sharedMaterials.get(resolved.id);
    if (pooled) return pooled;
    fallback.map = null;
    fallback.color.set(resolved.baseColor || DEFAULT_MATERIAL_COLOR);
    fallback.metalness = resolved.metallic ?? DEFAULT_MATERIAL_METALLIC;
    fallback.roughness = resolved.roughness ?? DEFAULT_MATERIAL_ROUGHNESS;
    const opacity = Math.max(0.02, Math.min(1, resolved.opacity ?? 1));
    const isTransparent = opacity < 0.999;
    if (fallback.transparent !== isTransparent) {
      fallback.transparent = isTransparent;
      fallback.needsUpdate = true;
    }
    fallback.opacity = opacity;
    fallback.depthWrite = !isTransparent;
    fallback.emissive.setHex(0x000000);
    return fallback;
  }

  private getMaterialForSlotId(
    slotMatId: string,
    objData: SceneObjectData,
    fallback: THREE.MeshStandardMaterial,
  ): THREE.MeshStandardMaterial {
    if (slotMatId && slotMatId !== '__default__') {
      const pooled = this.sharedMaterials.get(slotMatId);
      if (pooled) return pooled;
    }
    return this.getOrCreateMaterialForObject(objData, fallback);
  }

  private disposeObjectVisual(visual: ObjectVisual): void {
    visual.solidMesh.geometry.dispose();
    visual.clayMaterial.dispose();
    visual.faceOrientationFrontMesh?.material.dispose();
    visual.faceOrientationBackMesh?.material.dispose();
    visual.wireEdges.geometry.dispose();
    visual.wireEdges.material.dispose();
    visual.selectionOutline?.geometry.dispose();
    visual.selectionOutline?.material.dispose();
    visual.baseSolidCollider.geometry.dispose();
    visual.baseSolidCollider.material.dispose();
    if (visual.refPlaneMesh) {
      visual.refPlaneMesh.geometry.dispose();
      visual.refPlaneMesh.material.dispose();
    }
    if (visual.refTexture) {
      visual.refTexture.dispose();
      visual.refTexture = null;
    }
    if (visual.pointLight) {
      visual.pointLight.dispose();
      visual.pointLight = null;
    }
    if (visual.lightPickMesh) {
      visual.lightPickMesh.geometry.dispose();
      visual.lightPickMesh.material.dispose();
    }
    if (visual.lightWireLines) {
      visual.lightWireLines.geometry.dispose();
      visual.lightWireLines.material.dispose();
    }
  }

  private syncReferenceVisual(
    visual: ObjectVisual,
    objData: SceneObjectData,
    isSelected: boolean,
  ): void {
    const ref = objData.referenceImage;
    if (!ref || !visual.refPlaneMesh) return;

    const mat = visual.refPlaneMesh.material;
    mat.opacity = Math.max(0.05, Math.min(1, ref.opacity));
    const isFront = ref.depthMode === 'front';
    mat.depthTest = !isFront;
    visual.refPlaneMesh.renderOrder = isFront ? 10 : -1;

    visual.wireEdges.visible = true;
    visual.wireEdges.material.color.setHex(isSelected ? 0xff9900 : 0x525b6c);
    visual.wireEdges.material.depthTest = !isFront;
    visual.wireEdges.renderOrder = isFront ? 11 : 0;

    if (visual.refImageSrc !== ref.imageDataUrl) {
      visual.refImageSrc = ref.imageDataUrl;
      if (visual.refTexture) {
        visual.refTexture.dispose();
        visual.refTexture = null;
      }
      if (ref.imageDataUrl) {
        const loader = new THREE.TextureLoader();
        loader.load(
          ref.imageDataUrl,
          (tex) => {
            if (this.disposed) {
              tex.dispose();
              return;
            }
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.anisotropy = 4;
            tex.needsUpdate = true;
            visual.refTexture = tex;
            if (visual.refPlaneMesh) {
              visual.refPlaneMesh.material.map = tex;
              visual.refPlaneMesh.material.needsUpdate = true;
            }
            this.requestRender();
          },
          undefined,
          () => {
            this.requestRender();
          },
        );
      }
    }
  }

  private syncLightVisual(
    visual: ObjectVisual,
    objData: SceneObjectData,
    isSelected: boolean,
  ): void {
    const lightData: LightData = objData.light ?? {
      lightType: 'point',
      color: '#fff3d6',
      intensity: 18,
      distance: 18,
      enabled: true,
      showIcon: true,
    };

    if (visual.pointLight) {
      visual.pointLight.color.set(lightData.color || '#fff3d6');
      visual.pointLight.intensity = lightData.enabled ? Math.max(0, lightData.intensity) : 0;
      visual.pointLight.distance = Math.max(0, lightData.distance);
      visual.pointLight.decay = 2;
    }

    if (visual.lightIconGroup) {
      visual.lightIconGroup.visible = lightData.showIcon !== false;
    }

    if (visual.lightPickMesh) {
      const mat = visual.lightPickMesh.material;
      mat.color.set(lightData.enabled ? lightData.color || '#fff3d6' : '#555b66');
      mat.opacity = lightData.enabled ? 0.95 : 0.45;
    }

    if (visual.lightWireLines) {
      const mat = visual.lightWireLines.material;
      mat.color.setHex(isSelected ? 0xff9900 : lightData.enabled ? 0xfbbf24 : 0x646b7a);
      mat.opacity = isSelected ? 1 : 0.72;
    }
  }

  private createObjectVisual(objData: SceneObjectData): ObjectVisual {
    const group = new THREE.Group();
    group.userData.objectId = objData.id;

    if (objData.objectType === 'light') {
      const lightCfg: LightData = objData.light ?? {
        lightType: 'point',
        color: '#fff3d6',
        intensity: 18,
        distance: 18,
        enabled: true,
        showIcon: true,
      };
      const pointLight = new THREE.PointLight(
        lightCfg.color || '#fff3d6',
        lightCfg.enabled ? lightCfg.intensity : 0,
        lightCfg.distance,
        2,
      );

      const lightIconGroup = new THREE.Group();
      const orbGeo = new THREE.SphereGeometry(0.16, 16, 12);
      const orbMat = new THREE.MeshBasicMaterial({
        color: lightCfg.color || '#fff3d6',
        transparent: true,
        opacity: 0.95,
      });
      const lightPickMesh = new THREE.Mesh(orbGeo, orbMat);
      lightPickMesh.userData.objectId = objData.id;

      // Build 3 orthogonal gizmo rings + cardinal rays so the light stands out cleanly
      const ringPts: THREE.Vector3[] = [];
      const segs = 28;
      const r = 0.28;
      for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * Math.PI * 2;
        const a1 = ((i + 1) / segs) * Math.PI * 2;
        ringPts.push(
          new THREE.Vector3(Math.cos(a0) * r, Math.sin(a0) * r, 0),
          new THREE.Vector3(Math.cos(a1) * r, Math.sin(a1) * r, 0),
          new THREE.Vector3(Math.cos(a0) * r, 0, Math.sin(a0) * r),
          new THREE.Vector3(Math.cos(a1) * r, 0, Math.sin(a1) * r),
          new THREE.Vector3(0, Math.cos(a0) * r, Math.sin(a0) * r),
          new THREE.Vector3(0, Math.cos(a1) * r, Math.sin(a1) * r),
        );
      }
      const rayInner = 0.34;
      const rayOuter = 0.48;
      const axes: [number, number, number][] = [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 1, 0],
        [0, -1, 0],
        [0, 0, 1],
        [0, 0, -1],
      ];
      for (const [ax, ay, az] of axes) {
        ringPts.push(
          new THREE.Vector3(ax * rayInner, ay * rayInner, az * rayInner),
          new THREE.Vector3(ax * rayOuter, ay * rayOuter, az * rayOuter),
        );
      }
      const lightWireGeo = new THREE.BufferGeometry().setFromPoints(ringPts);
      const lightWireMat = new THREE.LineBasicMaterial({
        color: 0xfbbf24,
        transparent: true,
        opacity: 0.78,
      });
      const lightWireLines = new THREE.LineSegments(lightWireGeo, lightWireMat);
      lightWireLines.userData.objectId = objData.id;

      lightIconGroup.add(lightPickMesh, lightWireLines);
      group.add(pointLight, lightIconGroup);

      const dummyClayMat = new THREE.MeshStandardMaterial();
      const dummySolid = new THREE.Mesh(new THREE.BufferGeometry(), dummyClayMat);
      dummySolid.visible = false;
      const dummyWire = new THREE.LineSegments(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial(),
      );
      dummyWire.visible = false;
      const dummyCollider = new THREE.Mesh(
        new THREE.BufferGeometry(),
        new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
      );

      const visual: ObjectVisual = {
        id: objData.id,
        objectType: 'light',
        group,
        solidMesh: dummySolid,
        clayMaterial: dummyClayMat,
        slotMaterialIds: [],
        faceOrientationFrontMesh: null,
        faceOrientationBackMesh: null,
        wireEdges: dummyWire,
        baseSolidCollider: dummyCollider,
        refPlaneMesh: null,
        refTexture: null,
        refImageSrc: null,
        pointLight,
        lightIconGroup,
        lightPickMesh,
        lightWireLines,
        triangleToFaceId: [],
        faceToTriangleRange: new Map(),
        baseTriangleToFaceId: [],
        baseFaceToTriangleRange: new Map(),
        baseEditableMesh: new EditableMesh(),
        editableMesh: new EditableMesh(),
        lastMeshData: null,
        shading: 'flat',
        materialId: null,
        modifiers: [],
        modifiersSignature: '',
        hasActiveModifiers: false,
        hasFaces: false,
        locked: objData.locked,
      };
      this.syncLightVisual(visual, objData, objData.id === this.selectedObjectId);
      return visual;
    }

    if (objData.objectType === 'reference_image' && objData.referenceImage) {
      const ref = objData.referenceImage;
      const aspect =
        ref.aspectRatio > 0 ? ref.aspectRatio : ref.naturalWidth / Math.max(1, ref.naturalHeight);
      const baseSize = 4;
      const width = aspect >= 1 ? baseSize : baseSize * aspect;
      const height = aspect >= 1 ? baseSize / Math.max(0.05, aspect) : baseSize;

      const planeGeo = new THREE.PlaneGeometry(width, height);
      const planeMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: ref.opacity,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: ref.depthMode !== 'front',
      });
      const refPlaneMesh = new THREE.Mesh(planeGeo, planeMat);
      refPlaneMesh.userData.objectId = objData.id;
      refPlaneMesh.renderOrder = ref.depthMode === 'front' ? 10 : -1;

      const hw = width / 2;
      const hh = height / 2;
      const borderGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-hw, -hh, 0),
        new THREE.Vector3(hw, -hh, 0),
        new THREE.Vector3(hw, -hh, 0),
        new THREE.Vector3(hw, hh, 0),
        new THREE.Vector3(hw, hh, 0),
        new THREE.Vector3(-hw, hh, 0),
        new THREE.Vector3(-hw, hh, 0),
        new THREE.Vector3(-hw, -hh, 0),
      ]);
      const wireMat = new THREE.LineBasicMaterial({ color: 0x525b6c });
      const wireEdges = new THREE.LineSegments(borderGeo, wireMat);
      wireEdges.userData.objectId = objData.id;

      // Unused placeholder solidMesh so ObjectVisual contract stays uniform
      const dummyClayMat = new THREE.MeshStandardMaterial();
      const dummySolid = new THREE.Mesh(new THREE.BufferGeometry(), dummyClayMat);
      dummySolid.visible = false;

      const dummyCollider = new THREE.Mesh(
        new THREE.BufferGeometry(),
        new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
      );

      group.add(refPlaneMesh, wireEdges);

      const visual: ObjectVisual = {
        id: objData.id,
        objectType: 'reference_image',
        group,
        solidMesh: dummySolid,
        clayMaterial: dummyClayMat,
        slotMaterialIds: [],
        faceOrientationFrontMesh: null,
        faceOrientationBackMesh: null,
        wireEdges,
        baseSolidCollider: dummyCollider,
        refPlaneMesh,
        refTexture: null,
        refImageSrc: null,
        pointLight: null,
        lightIconGroup: null,
        lightPickMesh: null,
        lightWireLines: null,
        triangleToFaceId: [],
        faceToTriangleRange: new Map(),
        baseTriangleToFaceId: [],
        baseFaceToTriangleRange: new Map(),
        baseEditableMesh: new EditableMesh(),
        editableMesh: new EditableMesh(),
        lastMeshData: null,
        shading: 'flat',
        materialId: null,
        modifiers: [],
        modifiersSignature: '',
        hasActiveModifiers: false,
        hasFaces: false,
        locked: objData.locked,
      };
      this.syncReferenceVisual(visual, objData, objData.id === this.selectedObjectId);
      return visual;
    }

    const solidMat = new THREE.MeshStandardMaterial({
      color: objData.material.color,
      roughness: objData.material.roughness,
      metalness: objData.material.metalness,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    const solidGeoInit = new THREE.BufferGeometry();
    const solidMesh = new THREE.Mesh(solidGeoInit, solidMat);
    solidMesh.castShadow = false;
    solidMesh.receiveShadow = false;
    solidMesh.userData.objectId = objData.id;

    const faceOrientationFrontMat = new THREE.MeshStandardMaterial({
      color: 0x2563eb,
      emissive: 0x0b2559,
      roughness: 0.62,
      metalness: 0.05,
      side: THREE.FrontSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    const faceOrientationFrontMesh = new THREE.Mesh(solidGeoInit, faceOrientationFrontMat);
    faceOrientationFrontMesh.visible = false;
    faceOrientationFrontMesh.userData.objectId = objData.id;

    const faceOrientationBackMat = new THREE.MeshStandardMaterial({
      color: 0xe03131,
      emissive: 0x5c0d0d,
      roughness: 0.62,
      metalness: 0.05,
      side: THREE.BackSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    const faceOrientationBackMesh = new THREE.Mesh(solidGeoInit, faceOrientationBackMat);
    faceOrientationBackMesh.visible = false;
    faceOrientationBackMesh.userData.objectId = objData.id;

    const wireMat = new THREE.LineBasicMaterial({
      color: 0xff9900,
    });
    const wireEdges = new THREE.LineSegments(new THREE.BufferGeometry(), wireMat);
    wireEdges.userData.objectId = objData.id;

    const outlineMaterial = new THREE.MeshBasicMaterial({
      color: 0xffc928,
      side: THREE.BackSide,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    });
    const selectionOutline = new THREE.Mesh(solidGeoInit, outlineMaterial);
    selectionOutline.visible = false;
    selectionOutline.renderOrder = 1;
    selectionOutline.frustumCulled = false;
    selectionOutline.userData.objectId = objData.id;

    const baseSolidCollider = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    );

    group.add(
      solidMesh,
      faceOrientationFrontMesh,
      faceOrientationBackMesh,
      wireEdges,
      selectionOutline,
    );

    const baseMesh = EditableMesh.fromJSON(objData.mesh);
    const modifiers = objData.modifiers ?? [];
    let evalMesh = baseMesh;
    let hasActiveModifiers = false;
    if (hasActiveViewportModifiers(modifiers)) {
      const ownerRef: ModifierTransformRef = {
        id: objData.id,
        position: objData.transform.position,
        rotation: objData.transform.rotation,
        scale: objData.transform.scale,
      };
      const evalRes = evaluateObjectModifiers(objData.mesh, modifiers, {
        ownerTransform: ownerRef,
        sceneTransformRefs: this.sceneTransformRefs,
      });
      hasActiveModifiers = evalRes.hasActiveModifiers;
      if (hasActiveModifiers) {
        evalMesh = EditableMesh.fromJSON(evalRes.mesh);
      }
    }

    const visual: ObjectVisual = {
      id: objData.id,
      objectType: objData.objectType,
      group,
      solidMesh,
      clayMaterial: solidMat,
      slotMaterialIds: [],
      faceOrientationFrontMesh,
      faceOrientationBackMesh,
      wireEdges,
      selectionOutline,
      baseSolidCollider,
      refPlaneMesh: null,
      refTexture: null,
      refImageSrc: null,
      pointLight: null,
      lightIconGroup: null,
      lightPickMesh: null,
      lightWireLines: null,
      triangleToFaceId: [],
      faceToTriangleRange: new Map(),
      baseTriangleToFaceId: [],
      baseFaceToTriangleRange: new Map(),
      baseEditableMesh: baseMesh,
      editableMesh: evalMesh,
      lastMeshData: objData.mesh,
      shading: objData.shading === 'smooth' ? 'smooth' : 'flat',
      materialId: objData.materialId ?? null,
      modifiers,
      modifiersSignature: this.buildModifiersSignature(objData, this.sceneTransformRefs),
      hasActiveModifiers,
      hasFaces: evalMesh.faces.length > 0,
      locked: objData.locked,
    };

    this.rebuildObjectGeometry(visual);
    return visual;
  }

  private isXraySelectionActive(): boolean {
    return (
      this.displayMode === 'xray' ||
      this.displayMode === 'wireframe' ||
      Boolean(this.settings?.xrayEditMode)
    );
  }

  private applyObjectDisplayMode(
    visual: ObjectVisual,
    isSelected: boolean,
    inEditOnThis: boolean,
    objData?: SceneObjectData,
  ): void {
    const isWireframe = this.displayMode === 'wireframe';
    const isXray = this.displayMode === 'xray';
    const isMaterial = this.displayMode === 'material';
    const xrayOpacity = Math.max(0.05, Math.min(0.95, 1 - this.xrayTransparency / 100));
    const faceOrientActive =
      this.showFaceOrientation &&
      visual.hasFaces &&
      visual.faceOrientationFrontMesh !== null &&
      visual.faceOrientationBackMesh !== null;

    visual.solidMesh.visible = !faceOrientActive && !isWireframe && visual.hasFaces;
    visual.solidMesh.castShadow = false;
    visual.solidMesh.receiveShadow = false;
    visual.solidMesh.renderOrder = 0;
    if (visual.selectionOutline) {
      visual.selectionOutline.visible = this.workMode === 'object' && isSelected && visual.hasFaces;
    }

    if (isMaterial && objData) {
      const slotIds =
        visual.slotMaterialIds.length > 0
          ? visual.slotMaterialIds
          : [objData.materialId ?? '__default__'];
      const slotMats = slotIds.map((sid) =>
        this.getMaterialForSlotId(sid, objData, visual.clayMaterial),
      );
      const nextMat: THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[] =
        slotMats.length <= 1 ? slotMats[0] : slotMats;
      const currentMat = visual.solidMesh.material;
      const sameMat =
        !Array.isArray(nextMat) && !Array.isArray(currentMat)
          ? currentMat === nextMat
          : Array.isArray(nextMat) &&
            Array.isArray(currentMat) &&
            nextMat.length === currentMat.length &&
            nextMat.every((m, idx) => currentMat[idx] === m);
      if (!sameMat) {
        visual.solidMesh.material = nextMat;
      }
    } else {
      if (visual.solidMesh.material !== visual.clayMaterial) {
        visual.solidMesh.material = visual.clayMaterial;
      }
      const solidMat = visual.clayMaterial;
      if (solidMat.transparent !== isXray) {
        solidMat.transparent = isXray;
        solidMat.needsUpdate = true;
      }
      solidMat.opacity = isXray ? xrayOpacity : 1;
      solidMat.depthWrite = !isXray;
      solidMat.depthTest = true;
      solidMat.roughness = 0.58;
      solidMat.metalness = 0.06;
      solidMat.polygonOffset = true;
      solidMat.polygonOffsetFactor = 1;
      solidMat.polygonOffsetUnits = 1;
      // Solid & X-Ray always render with neutral studio grey (independent of object material)
      solidMat.color.set(inEditOnThis ? '#8b919c' : '#8c929d');
      solidMat.emissive.setHex(0x000000);
    }

    if (visual.faceOrientationFrontMesh && visual.faceOrientationBackMesh) {
      visual.faceOrientationFrontMesh.visible = faceOrientActive;
      visual.faceOrientationBackMesh.visible = faceOrientActive;
      if (faceOrientActive) {
        const useTranslucent = isXray || isWireframe;
        const orientOpacity = isXray ? Math.max(0.18, xrayOpacity) : isWireframe ? 0.36 : 1;
        const frontMat = visual.faceOrientationFrontMesh.material;
        const backMat = visual.faceOrientationBackMesh.material;
        if (frontMat.transparent !== useTranslucent) {
          frontMat.transparent = useTranslucent;
          frontMat.needsUpdate = true;
        }
        if (backMat.transparent !== useTranslucent) {
          backMat.transparent = useTranslucent;
          backMat.needsUpdate = true;
        }
        frontMat.opacity = orientOpacity;
        backMat.opacity = orientOpacity;
        frontMat.depthTest = true;
        backMat.depthTest = true;
        frontMat.depthWrite = !useTranslucent;
        backMat.depthWrite = !useTranslucent;
        visual.faceOrientationFrontMesh.renderOrder = useTranslucent ? 1 : 0;
        visual.faceOrientationBackMesh.renderOrder = useTranslucent ? 1 : 0;
      }
    }

    const wireMat = visual.wireEdges.material;
    if (inEditOnThis) {
      if (visual.hasActiveModifiers && (isWireframe || isXray)) {
        // Show evaluated modifier wireframe subtly while Edit Mode overlay draws the base control cage
        visual.wireEdges.visible = true;
        wireMat.color.setHex(0x8a95a8);
        if (!wireMat.transparent) {
          wireMat.transparent = true;
          wireMat.needsUpdate = true;
        }
        wireMat.opacity = isWireframe ? 0.48 : 0.34;
        wireMat.depthTest = !isXray;
        wireMat.depthWrite = false;
        visual.wireEdges.renderOrder = 2;
      } else {
        visual.wireEdges.visible = false; // Handled cleanly by editOverlayGroup
      }
      return;
    }

    if (isWireframe) {
      visual.wireEdges.visible = true;
      wireMat.color.setHex(0x9aa3b2);
      const wireTransparent = true;
      if (wireMat.transparent !== wireTransparent) {
        wireMat.transparent = wireTransparent;
        wireMat.needsUpdate = true;
      }
      wireMat.opacity = 0.86;
      wireMat.depthTest = true;
      wireMat.depthWrite = false;
      visual.wireEdges.renderOrder = 2;
    } else if (isXray) {
      visual.wireEdges.visible = true;
      wireMat.color.setHex(visual.hasFaces ? 0x272d38 : 0xc0c6d0);
      const wireTransparent = visual.hasFaces;
      if (wireMat.transparent !== wireTransparent) {
        wireMat.transparent = wireTransparent;
        wireMat.needsUpdate = true;
      }
      wireMat.opacity = visual.hasFaces ? 0.55 : 1;
      wireMat.depthTest = visual.hasFaces;
      wireMat.depthWrite = false;
      visual.wireEdges.renderOrder = 2;
    } else if (faceOrientActive) {
      // Keep face topology edges clearly legible on top of Blue/Red orientation colors
      visual.wireEdges.visible = true;
      wireMat.color.setHex(0x14171f);
      const wireTransparent = true;
      if (wireMat.transparent !== wireTransparent) {
        wireMat.transparent = wireTransparent;
        wireMat.needsUpdate = true;
      }
      wireMat.opacity = 0.48;
      wireMat.depthTest = true;
      wireMat.depthWrite = false;
      visual.wireEdges.renderOrder = 2;
    } else {
      visual.wireEdges.visible = !visual.hasFaces;
      wireMat.color.setHex(!visual.hasFaces && isSelected ? 0xff9900 : 0xc0c6d0);
      const wireTransparent = false;
      if (wireMat.transparent !== wireTransparent) {
        wireMat.transparent = wireTransparent;
        wireMat.needsUpdate = true;
      }
      wireMat.opacity = 1;
      wireMat.depthTest = true;
      wireMat.depthWrite = !isSelected;
      visual.wireEdges.renderOrder = 1;
    }
  }

  private rebuildObjectGeometry(visual: ObjectVisual): void {
    if (
      visual.objectType === 'reference_image' ||
      visual.objectType === 'light' ||
      visual.objectType === 'camera' ||
      visual.objectType === 'empty'
    ) {
      return;
    }
    const mesh = visual.editableMesh;
    const triData = mesh.buildTriangulatedData(visual.shading, visual.materialId ?? '__default__');

    visual.hasFaces = triData.triangleToFaceId.length > 0;
    visual.triangleToFaceId = triData.triangleToFaceId;
    visual.faceToTriangleRange = triData.faceToTriangleRange;
    visual.slotMaterialIds = triData.materialIds;

    const solidGeo = new THREE.BufferGeometry();
    solidGeo.setAttribute('position', new THREE.BufferAttribute(triData.positions, 3));
    solidGeo.setAttribute('normal', new THREE.BufferAttribute(triData.normals, 3));
    if (triData.uvs) {
      solidGeo.setAttribute('uv', new THREE.BufferAttribute(triData.uvs, 2));
    }
    solidGeo.clearGroups();
    for (const grp of triData.materialGroups) {
      if (grp.count > 0) {
        solidGeo.addGroup(grp.start, grp.count, grp.materialIndex);
      }
    }
    solidGeo.computeBoundingBox();
    solidGeo.computeBoundingSphere();

    visual.solidMesh.geometry.dispose();
    visual.solidMesh.geometry = solidGeo;
    if (visual.selectionOutline) {
      visual.selectionOutline.geometry.dispose();
      const outlineGeometry = solidGeo.clone();
      const outlineCenter = solidGeo.boundingSphere?.center ?? new THREE.Vector3();
      outlineGeometry.translate(-outlineCenter.x, -outlineCenter.y, -outlineCenter.z);
      visual.selectionOutline.geometry = outlineGeometry;
      visual.selectionOutline.position.copy(outlineCenter);
      visual.selectionOutline.scale.setScalar(1.015);
    }
    if (visual.faceOrientationFrontMesh) {
      visual.faceOrientationFrontMesh.geometry = solidGeo;
    }
    if (visual.faceOrientationBackMesh) {
      visual.faceOrientationBackMesh.geometry = solidGeo;
    }
    const faceOrientActive =
      this.showFaceOrientation &&
      visual.hasFaces &&
      visual.faceOrientationFrontMesh !== null &&
      visual.faceOrientationBackMesh !== null;
    visual.solidMesh.visible =
      !faceOrientActive && visual.hasFaces && this.displayMode !== 'wireframe';
    if (visual.faceOrientationFrontMesh && visual.faceOrientationBackMesh) {
      visual.faceOrientationFrontMesh.visible = faceOrientActive;
      visual.faceOrientationBackMesh.visible = faceOrientActive;
    }

    // Topological edges
    const edgePositions = new Float32Array(mesh.edges.length * 6);
    let ptr = 0;
    for (const edge of mesh.edges) {
      const v0 = mesh.getVertex(edge.v0);
      const v1 = mesh.getVertex(edge.v1);
      if (!v0 || !v1) continue;
      edgePositions[ptr++] = v0.position[0];
      edgePositions[ptr++] = v0.position[1];
      edgePositions[ptr++] = v0.position[2];
      edgePositions[ptr++] = v1.position[0];
      edgePositions[ptr++] = v1.position[1];
      edgePositions[ptr++] = v1.position[2];
    }

    const wireGeo = new THREE.BufferGeometry();
    wireGeo.setAttribute('position', new THREE.BufferAttribute(edgePositions.subarray(0, ptr), 3));
    wireGeo.computeBoundingBox();
    wireGeo.computeBoundingSphere();
    visual.wireEdges.geometry.dispose();
    visual.wireEdges.geometry = wireGeo;

    if (visual.hasActiveModifiers) {
      const baseTriData = visual.baseEditableMesh.buildTriangulatedData();
      visual.baseTriangleToFaceId = baseTriData.triangleToFaceId;
      visual.baseFaceToTriangleRange = baseTriData.faceToTriangleRange;
      const baseGeo = new THREE.BufferGeometry();
      baseGeo.setAttribute('position', new THREE.BufferAttribute(baseTriData.positions, 3));
      baseGeo.computeBoundingBox();
      baseGeo.computeBoundingSphere();
      visual.baseSolidCollider.geometry.dispose();
      visual.baseSolidCollider.geometry = baseGeo;
    } else {
      visual.baseTriangleToFaceId = triData.triangleToFaceId;
      visual.baseFaceToTriangleRange = triData.faceToTriangleRange;
    }

    if (this.editOverlaySourceMesh === visual.baseEditableMesh) {
      this.editOverlaySourceMesh = null;
    }
  }

  private syncEditModeOverlays(): void {
    if (this.workMode !== 'edit' || !this.selectedObjectId) {
      this.editOverlayGroup.visible = false;
      this.editOverlaySourceMesh = null;
      this.proportionalRing.visible = false;
      this.proportionalRingVisible = false;
      return;
    }

    const visual = this.visuals.get(this.selectedObjectId);
    if (!visual) {
      this.editOverlayGroup.visible = false;
      this.editOverlaySourceMesh = null;
      this.proportionalRing.visible = false;
      this.proportionalRingVisible = false;
      return;
    }

    this.editOverlayGroup.visible = true;
    visual.group.updateMatrixWorld(true);
    this.editOverlayGroup.matrixAutoUpdate = false;
    this.editOverlayGroup.matrix.copy(visual.group.matrixWorld);
    this.editOverlayGroup.matrixWorld.copy(visual.group.matrixWorld);

    // Edit Mode always renders interactive vertices/edges/faces from BASE topology only
    const mesh = visual.baseEditableMesh;
    const xray = this.isXraySelectionActive();
    const isWireframe = this.displayMode === 'wireframe';
    const isXrayMode = this.displayMode === 'xray';
    const highContrastLight = isWireframe || (isXrayMode && this.xrayTransparency > 35);

    // 1. All Base Cage Edges
    const allEdgesMat = this.editAllEdgesLine.material as THREE.LineBasicMaterial;
    allEdgesMat.depthTest = !xray;
    allEdgesMat.color.setHex(
      visual.hasActiveModifiers
        ? highContrastLight
          ? 0xf59e0b
          : 0x1e2430
        : highContrastLight
          ? 0xc8d0dc
          : 0x111317,
    );
    allEdgesMat.opacity = isWireframe ? 0.88 : isXrayMode ? 0.76 : 0.85;
    if (this.editOverlaySourceMesh !== mesh) {
      this.editAllEdgesLine.geometry.dispose();
      if (!visual.hasActiveModifiers) {
        this.editAllEdgesLine.geometry = visual.wireEdges.geometry.clone();
      } else {
        const baseEdgePositions = new Float32Array(mesh.edges.length * 6);
        let bPtr = 0;
        for (const edge of mesh.edges) {
          const v0 = mesh.getVertex(edge.v0);
          const v1 = mesh.getVertex(edge.v1);
          if (!v0 || !v1) continue;
          baseEdgePositions[bPtr++] = v0.position[0];
          baseEdgePositions[bPtr++] = v0.position[1];
          baseEdgePositions[bPtr++] = v0.position[2];
          baseEdgePositions[bPtr++] = v1.position[0];
          baseEdgePositions[bPtr++] = v1.position[1];
          baseEdgePositions[bPtr++] = v1.position[2];
        }
        const cageGeo = new THREE.BufferGeometry();
        cageGeo.setAttribute(
          'position',
          new THREE.BufferAttribute(baseEdgePositions.subarray(0, bPtr), 3),
        );
        cageGeo.computeBoundingSphere();
        this.editAllEdgesLine.geometry = cageGeo;
      }
      this.editOverlaySourceMesh = mesh;
    }

    // Highlight selected + live box-select preview components in Edit Mode,
    // including coherent topology-derived edges, faces, and corner vertices
    const activeComponentIds = new Set<string>(this.selectedComponentIds);
    for (const id of this.boxSelectPreviewComponentIds) {
      activeComponentIds.add(id);
    }
    const derived = computeDerivedEditSelection(mesh, this.editSelectionMode, activeComponentIds);

    // 2. Selected + Derived Edges (or traversed Loop Cut ring edges during preview)
    const showLoopRingHighlight =
      this.loopCutPreviewMode && this.loopCutPreviewRingEdgeIds.size > 0;
    const displayEdgeIds = this.loopCutPreviewMode
      ? showLoopRingHighlight
        ? this.loopCutPreviewRingEdgeIds
        : new Set<string>()
      : derived.edgeIds;
    const selEdgeCoords: number[] = [];
    for (const eid of displayEdgeIds) {
      const edge = mesh.getEdge(eid);
      if (!edge) continue;
      const v0 = mesh.getVertex(edge.v0);
      const v1 = mesh.getVertex(edge.v1);
      if (!v0 || !v1) continue;
      selEdgeCoords.push(...v0.position, ...v1.position);
    }
    const selEdgeGeo = new LineSegmentsGeometry();
    selEdgeGeo.setPositions(selEdgeCoords);
    this.editSelectedEdgesLine.geometry.dispose();
    this.editSelectedEdgesLine.geometry = selEdgeGeo;
    this.editSelectedEdgesLine.material.color.setHex(showLoopRingHighlight ? 0x0ea5e9 : 0xff9900);
    this.editSelectedEdgesLine.visible = selEdgeCoords.length > 0;

    // Seam edges (vivid rose/magenta line + thick instanced bars)
    const seamCoords: number[] = [];
    const seamEdgePairs: { a: Vec3; b: Vec3 }[] = [];
    for (const edge of mesh.edges) {
      if (edge.isSeam) {
        const v0 = mesh.getVertex(edge.v0);
        const v1 = mesh.getVertex(edge.v1);
        if (v0 && v1) {
          seamCoords.push(...v0.position, ...v1.position);
          seamEdgePairs.push({ a: v0.position, b: v1.position });
        }
      }
    }
    const seamGeo = new THREE.BufferGeometry();
    seamGeo.setAttribute('position', new THREE.Float32BufferAttribute(seamCoords, 3));
    this.editSeamEdgesLine.geometry.dispose();
    this.editSeamEdgesLine.geometry = seamGeo;
    this.editSeamEdgesLine.visible = seamCoords.length > 0;

    if (!this.loopCutPreviewMode && seamEdgePairs.length > 0) {
      if (this.editSeamEdgeBars.instanceMatrix.count < seamEdgePairs.length) {
        const oldBar = this.editSeamEdgeBars;
        this.editOverlayGroup.remove(oldBar);
        const nextBar = new THREE.InstancedMesh(
          oldBar.geometry,
          oldBar.material,
          Math.max(16, seamEdgePairs.length * 2),
        );
        nextBar.frustumCulled = false;
        nextBar.renderOrder = 5;
        this.editSeamEdgeBars = nextBar;
        this.editOverlayGroup.add(nextBar);
      }
      const up = new THREE.Vector3(0, 1, 0);
      const dir = new THREE.Vector3();
      const mid = new THREE.Vector3();
      const scaleVec = new THREE.Vector3();
      seamEdgePairs.forEach((pair, idx) => {
        _v0.set(...pair.a);
        _v1.set(...pair.b);
        dir.subVectors(_v1, _v0);
        const len = dir.length();
        mid.addVectors(_v0, _v1).multiplyScalar(0.5);
        if (len > 1e-6) {
          dir.divideScalar(len);
          _quat.setFromUnitVectors(up, dir);
        } else {
          _quat.identity();
        }
        scaleVec.set(0.017, Math.max(len, 0.001), 0.017);
        _mat4A.compose(mid, _quat, scaleVec);
        this.editSeamEdgeBars.setMatrixAt(idx, _mat4A);
      });
      this.editSeamEdgeBars.count = seamEdgePairs.length;
      this.editSeamEdgeBars.instanceMatrix.needsUpdate = true;
      this.editSeamEdgeBars.visible = true;
    } else {
      this.editSeamEdgeBars.count = 0;
      this.editSeamEdgeBars.visible = false;
    }

    // 3. Selected + Derived Faces Overlay (or Loop Cut traversed quad faces during preview)
    const showLoopFaceHighlight = this.loopCutPreviewMode && this.loopCutPreviewFaceIds.size > 0;
    const displayFaceIds = this.loopCutPreviewMode
      ? showLoopFaceHighlight
        ? this.loopCutPreviewFaceIds
        : new Set<string>()
      : derived.faceIds;
    const selFacePositions: number[] = [];
    if (displayFaceIds.size > 0) {
      const solidPos = (
        visual.hasActiveModifiers ? visual.baseSolidCollider : visual.solidMesh
      ).geometry.getAttribute('position');
      if (solidPos) {
        for (const fid of displayFaceIds) {
          const range = visual.baseFaceToTriangleRange.get(fid);
          if (!range) continue;
          const startVert = range.start * 3;
          const endVert = (range.start + range.count) * 3;
          for (let vi = startVert; vi < endVert; vi++) {
            selFacePositions.push(solidPos.getX(vi), solidPos.getY(vi), solidPos.getZ(vi));
          }
        }
      }
    }
    const selFaceGeo = new THREE.BufferGeometry();
    selFaceGeo.setAttribute('position', new THREE.Float32BufferAttribute(selFacePositions, 3));
    this.editSelectedFacesMesh.geometry.dispose();
    this.editSelectedFacesMesh.geometry = selFaceGeo;
    this.editSelectedFacesMesh.visible = selFacePositions.length > 0;
    const selFacesMat = this.editSelectedFacesMesh.material as THREE.MeshBasicMaterial;
    selFacesMat.color.setHex(showLoopFaceHighlight ? 0x38bdf8 : 0xff9900);
    selFacesMat.depthTest = !xray;
    selFacesMat.opacity = showLoopFaceHighlight
      ? isWireframe
        ? 0.16
        : 0.22
      : isWireframe
        ? 0.28
        : isXrayMode
          ? 0.36
          : 0.42;

    // 4. Vertices Points (with Proportional Editing falloff weight gradient)
    const showUnselectedVertices = !this.loopCutPreviewMode && this.editSelectionMode === 'vertex';
    const propActive =
      this.proportionalSettings.enabled &&
      this.selectedComponentIds.size > 0 &&
      !this.loopCutPreviewMode;
    const activeWeights = propActive
      ? this.isAnyTransformDragging()
        ? this.proportionalDragWeights
        : this.getProportionalPreviewWeights(visual)
      : null;

    const unselVerts: number[] = [];
    const unselColors: number[] = [];
    const selVerts: number[] = [];
    const baseColorR = highContrastLight ? 0.859 : 0.071;
    const baseColorG = highContrastLight ? 0.886 : 0.078;
    const baseColorB = highContrastLight ? 0.925 : 0.094;

    for (const v of mesh.vertices) {
      if (!this.loopCutPreviewMode && derived.vertexIds.has(v.id)) {
        selVerts.push(...v.position);
      } else {
        const w = activeWeights ? (activeWeights.get(v.id) ?? 0) : 0;
        if (showUnselectedVertices || w > 0) {
          unselVerts.push(...v.position);
          if (w > 0) {
            const [r, g, b] = sampleProportionalWeightColor(w);
            unselColors.push(r, g, b);
          } else {
            unselColors.push(baseColorR, baseColorG, baseColorB);
          }
        }
      }
    }

    const unselGeo = new THREE.BufferGeometry();
    unselGeo.setAttribute('position', new THREE.Float32BufferAttribute(unselVerts, 3));
    unselGeo.setAttribute('color', new THREE.Float32BufferAttribute(unselColors, 3));
    this.editUnselectedVerticesPoints.geometry.dispose();
    this.editUnselectedVerticesPoints.geometry = unselGeo;
    const unselVertMat = this.editUnselectedVerticesPoints.material as THREE.PointsMaterial;
    unselVertMat.depthTest = !xray;
    unselVertMat.color.setHex(0xffffff);
    this.editUnselectedVerticesPoints.visible = unselVerts.length > 0;

    const selVertGeo = new THREE.BufferGeometry();
    selVertGeo.setAttribute('position', new THREE.Float32BufferAttribute(selVerts, 3));
    this.editSelectedVerticesPoints.geometry.dispose();
    this.editSelectedVerticesPoints.geometry = selVertGeo;
    const selVertMat = this.editSelectedVerticesPoints.material as THREE.PointsMaterial;
    selVertMat.size = this.editSelectionMode === 'vertex' ? 14 : 11;
    this.editSelectedVerticesPoints.visible = selVerts.length > 0;

    this.syncProportionalRadiusRing(visual);

    // 5. Loop Cut Preview Ring Bars + Intersection Dots
    if (this.loopCutPreviewMode && this.loopCutPreviewSegments.length > 0) {
      const segs = this.loopCutPreviewSegments;
      if (this.loopCutPreviewBars.instanceMatrix.count < segs.length) {
        const oldLoop = this.loopCutPreviewBars;
        this.editOverlayGroup.remove(oldLoop);
        const nextLoop = new THREE.InstancedMesh(
          oldLoop.geometry,
          oldLoop.material,
          Math.max(32, segs.length * 2),
        );
        nextLoop.frustumCulled = false;
        nextLoop.renderOrder = 8;
        this.loopCutPreviewBars = nextLoop;
        this.editOverlayGroup.add(nextLoop);
      }

      let totalSegLen = 0;
      for (const pair of segs) {
        const dx = pair[1][0] - pair[0][0];
        const dy = pair[1][1] - pair[0][1];
        const dz = pair[1][2] - pair[0][2];
        totalSegLen += Math.sqrt(dx * dx + dy * dy + dz * dz);
      }
      const avgSegLen = totalSegLen / Math.max(1, segs.length);
      const barThickness = Math.max(0.005, Math.min(0.03, avgSegLen * 0.016));

      const up = new THREE.Vector3(0, 1, 0);
      const dir = new THREE.Vector3();
      const mid = new THREE.Vector3();
      const scaleVec = new THREE.Vector3();
      const dotSeen = new Set<string>();
      const dotCoords: number[] = [];

      const pushDot = (p: Vec3) => {
        const key = `${p[0].toFixed(4)}|${p[1].toFixed(4)}|${p[2].toFixed(4)}`;
        if (dotSeen.has(key)) return;
        dotSeen.add(key);
        dotCoords.push(p[0], p[1], p[2]);
      };

      segs.forEach((pair, idx) => {
        _v0.set(...pair[0]);
        _v1.set(...pair[1]);
        dir.subVectors(_v1, _v0);
        const len = dir.length();
        mid.addVectors(_v0, _v1).multiplyScalar(0.5);
        if (len > 1e-6) {
          dir.divideScalar(len);
          _quat.setFromUnitVectors(up, dir);
        } else {
          _quat.identity();
        }
        scaleVec.set(barThickness, Math.max(len, 0.001), barThickness);
        _mat4A.compose(mid, _quat, scaleVec);
        this.loopCutPreviewBars.setMatrixAt(idx, _mat4A);
        pushDot(pair[0]);
        pushDot(pair[1]);
      });
      this.loopCutPreviewBars.count = segs.length;
      this.loopCutPreviewBars.instanceMatrix.needsUpdate = true;
      this.loopCutPreviewBars.visible = true;

      const dotGeo = new THREE.BufferGeometry();
      dotGeo.setAttribute('position', new THREE.Float32BufferAttribute(dotCoords, 3));
      this.loopCutPreviewPoints.geometry.dispose();
      this.loopCutPreviewPoints.geometry = dotGeo;
      this.loopCutPreviewPoints.visible = dotCoords.length > 0;
    } else {
      this.loopCutPreviewBars.count = 0;
      this.loopCutPreviewBars.visible = false;
      this.loopCutPreviewPoints.visible = false;
    }

    // 6. Slide Rail Visual Guides (for Vertex Slide / Edge Slide via G hold or Move->Slide)
    if (
      !this.loopCutPreviewMode &&
      (this.modalTransformMode === 'vertex_slide' || this.modalTransformMode === 'edge_slide')
    ) {
      const refMesh =
        (!this.modalTransformCommitOnRelease ? this.slideSessionBaseMesh : null) ??
        this.editDragStartMesh ??
        mesh;
      let guideSegments: [Vec3, Vec3][] = [];
      if (this.modalTransformMode === 'vertex_slide') {
        const activePlan = this.modalParametricVertexSlidePlan ?? this.slideSessionVertexSlidePlan;
        if (activePlan && activePlan.valid) {
          guideSegments = activePlan.guideSegments;
        } else {
          const vIds = refMesh.getVertexIdsFromSelection(
            this.editSelectionMode,
            this.selectedComponentIds,
          );
          guideSegments = buildVertexSlidePlan(refMesh, vIds).guideSegments;
        }
      } else {
        guideSegments = buildEdgeSlidePlan(refMesh, this.selectedComponentIds).guideSegments;
      }
      if (guideSegments.length > 0) {
        const coords: number[] = [];
        for (const [a, b] of guideSegments) {
          coords.push(a[0], a[1], a[2], b[0], b[1], b[2]);
        }
        const guideGeo = new THREE.BufferGeometry();
        guideGeo.setAttribute('position', new THREE.Float32BufferAttribute(coords, 3));
        this.slideGuideLines.geometry.dispose();
        this.slideGuideLines.geometry = guideGeo;
        this.slideGuideLines.visible = true;
      } else {
        this.slideGuideLines.visible = false;
      }
    } else {
      this.slideGuideLines.visible = false;
    }
  }

  private syncProportionalRadiusRing(visual: ObjectVisual): void {
    if (
      this.workMode !== 'edit' ||
      !this.proportionalSettings.enabled ||
      this.loopCutPreviewMode ||
      this.selectedComponentIds.size === 0
    ) {
      this.proportionalRing.visible = false;
      this.proportionalRingVisible = false;
      return;
    }

    let hasCenter = false;
    if (this.isGizmoDragging && this.editDragStartMesh) {
      _v0.copy(this.editGizmoAnchor.position);
      hasCenter = true;
    } else if (this.isTrackballDragging && this.editDragStartMesh) {
      _v0.copy(this.editDragStartAnchorPos);
      hasCenter = true;
    } else {
      const vertIds = visual.baseEditableMesh.getVertexIdsFromSelection(
        this.editSelectionMode,
        this.selectedComponentIds,
      );
      const centroidLocal = visual.baseEditableMesh.computeCentroid(vertIds);
      if (centroidLocal) {
        visual.group.updateMatrixWorld(true);
        _v0
          .set(centroidLocal[0], centroidLocal[1], centroidLocal[2])
          .applyMatrix4(visual.group.matrixWorld);
        hasCenter = true;
      }
    }

    if (!hasCenter) {
      this.proportionalRing.visible = false;
      this.proportionalRingVisible = false;
      return;
    }

    this.proportionalRing.position.copy(_v0);
    this.proportionalRing.scale.setScalar(this.proportionalSettings.radius);
    this.proportionalRing.quaternion.copy(this.activeCamera.quaternion);
    this.proportionalRing.visible = true;
    this.proportionalRingVisible = true;
  }

  private syncGizmoEnabledState(): void {
    if (this.activeDraggingGizmo) {
      this.transformControls.enabled = this.activeDraggingGizmo === this.transformControls;
      this.rotateGizmoControls.enabled = this.activeDraggingGizmo === this.rotateGizmoControls;
      this.scaleGizmoControls.enabled = this.activeDraggingGizmo === this.scaleGizmoControls;
      return;
    }

    const canShow =
      !this.suppressGizmo &&
      this.workMode !== 'sculpt' &&
      this.activeTool !== 'select' &&
      Boolean(this.selectedObjectId);
    this.transformControls.enabled = canShow;
    const isAll = canShow && this.activeTool === 'all';
    this.rotateGizmoControls.enabled = isAll;
    this.scaleGizmoControls.enabled = isAll;
  }

  private syncGizmoSettings(): void {
    const modeMap: Record<TransformTool, 'translate' | 'rotate' | 'scale'> = {
      select: 'translate',
      move: 'translate',
      rotate: 'rotate',
      scale: 'scale',
      all: 'translate',
    };
    const baseSize = this.settings?.gizmoSize ?? 1.25;
    const c = this.axisConstraint;
    const isAll = this.activeTool === 'all';

    this.transformControls.setMode(modeMap[this.activeTool]);
    this.transformControls.setSize(isAll ? baseSize * 1.38 : baseSize);
    this.transformControls.showX = c === 'free' || c === 'x';
    this.transformControls.showY = c === 'free' || c === 'y';
    this.transformControls.showZ = c === 'free' || c === 'z';
    this.transformControls.showXY = !isAll && c === 'free';
    this.transformControls.showYZ = !isAll && c === 'free';
    this.transformControls.showXZ = !isAll && c === 'free';
    this.transformControls.showE = !isAll && c === 'free';
    this.transformControls.showXYZE = !isAll && c === 'free';

    this.rotateGizmoControls.setMode('rotate');
    this.rotateGizmoControls.setSize(baseSize * 0.92);
    this.rotateGizmoControls.showX = c === 'free' || c === 'x';
    this.rotateGizmoControls.showY = c === 'free' || c === 'y';
    this.rotateGizmoControls.showZ = c === 'free' || c === 'z';
    this.rotateGizmoControls.showE = false;
    this.rotateGizmoControls.showXYZE = false;

    this.scaleGizmoControls.setMode('scale');
    this.scaleGizmoControls.setSize(baseSize * 0.54);
    this.scaleGizmoControls.showX = c === 'free' || c === 'x';
    this.scaleGizmoControls.showY = c === 'free' || c === 'y';
    this.scaleGizmoControls.showZ = c === 'free' || c === 'z';
    this.scaleGizmoControls.showXY = false;
    this.scaleGizmoControls.showYZ = false;
    this.scaleGizmoControls.showXZ = false;

    for (const ctrl of [
      this.transformControls,
      this.rotateGizmoControls,
      this.scaleGizmoControls,
    ]) {
      if (this.settings?.snapEnabled) {
        ctrl.setTranslationSnap(this.settings.snapTranslateStep);
        ctrl.setRotationSnap(THREE.MathUtils.degToRad(this.settings.snapRotateDeg));
        ctrl.setScaleSnap(this.settings.snapScaleStep);
      } else {
        ctrl.setTranslationSnap(null);
        ctrl.setRotationSnap(null);
        ctrl.setScaleSnap(null);
      }
    }
    this.syncGizmoEnabledState();
  }

  private detachAllGizmos(): void {
    this.multiGizmoTargetIds = [];
    this.transformControls.detach();
    this.rotateGizmoControls.detach();
    this.scaleGizmoControls.detach();
    this.syncGizmoEnabledState();
  }

  private attachGizmoTarget(target: THREE.Object3D): void {
    this.transformControls.attach(target);
    if (this.activeTool === 'all') {
      this.rotateGizmoControls.attach(target);
      this.scaleGizmoControls.attach(target);
    } else {
      this.rotateGizmoControls.detach();
      this.scaleGizmoControls.detach();
    }
    this.syncGizmoEnabledState();
  }

  private syncGizmoAttachment(): void {
    if (
      this.suppressGizmo ||
      this.workMode === 'sculpt' ||
      this.activeTool === 'select' ||
      !this.selectedObjectId
    ) {
      this.detachAllGizmos();
      return;
    }

    const visual = this.visuals.get(this.selectedObjectId);
    if (!visual || !visual.group.visible || visual.locked) {
      this.detachAllGizmos();
      return;
    }

    if (this.workMode === 'object') {
      const selectedIds = new Set(this.selectedObjectIds);
      selectedIds.add(this.selectedObjectId);
      const selectedVisuals = Array.from(selectedIds)
        .map((id) => this.visuals.get(id))
        .filter((item): item is ObjectVisual =>
          Boolean(item && item.group.visible && !item.locked),
        );

      if (selectedVisuals.length > 1) {
        const bounds = new THREE.Box3();
        const center = new THREE.Vector3();
        let hasBounds = false;
        for (const selectedVisual of selectedVisuals) {
          selectedVisual.group.updateMatrixWorld(true);
          const objectBounds = new THREE.Box3().setFromObject(selectedVisual.group);
          if (objectBounds.isEmpty()) continue;
          if (hasBounds) {
            bounds.union(objectBounds);
          } else {
            bounds.copy(objectBounds);
            hasBounds = true;
          }
        }

        if (hasBounds) {
          bounds.getCenter(center);
        } else {
          for (const selectedVisual of selectedVisuals) {
            center.add(selectedVisual.group.position);
          }
          center.divideScalar(selectedVisuals.length);
        }

        this.multiGizmoTargetIds = selectedVisuals.map((item) => item.id);
        this.multiSelectionGizmoPivot.position.copy(center);
        this.multiSelectionGizmoPivot.rotation.set(0, 0, 0);
        this.multiSelectionGizmoPivot.scale.set(1, 1, 1);
        this.multiSelectionGizmoPivot.updateMatrixWorld(true);
        this.attachGizmoTarget(this.multiSelectionGizmoPivot);
      } else {
        this.multiGizmoTargetIds = [];
        this.attachGizmoTarget(visual.group);
      }
      return;
    }

    this.multiGizmoTargetIds = [];

    // Edit Mode: attach to centroid of selected base vertices
    const vertIds = visual.baseEditableMesh.getVertexIdsFromSelection(
      this.editSelectionMode,
      this.selectedComponentIds,
    );
    if (vertIds.size === 0) {
      this.detachAllGizmos();
      return;
    }

    const centroidLocal = visual.baseEditableMesh.computeCentroid(vertIds);
    if (!centroidLocal) {
      this.detachAllGizmos();
      return;
    }

    visual.group.updateMatrixWorld(true);
    _v0
      .set(centroidLocal[0], centroidLocal[1], centroidLocal[2])
      .applyMatrix4(visual.group.matrixWorld);

    this.editGizmoAnchor.position.copy(_v0);
    this.editGizmoAnchor.quaternion.identity();
    this.editGizmoAnchor.scale.set(1, 1, 1);
    this.editGizmoAnchor.updateMatrixWorld(true);

    this.attachGizmoTarget(this.editGizmoAnchor);
  }

  public switchProjection(next: CameraProjection): void {
    if (this.projection === next) return;
    const prevCam = this.activeCamera;
    const target = this.orbitControls.target;
    const distance = prevCam.position.distanceTo(target);

    if (next === 'orthographic') {
      const aspect = Math.max(
        0.1,
        this.container.clientWidth / Math.max(1, this.container.clientHeight),
      );
      const frustumHeight =
        2 * distance * Math.tan(THREE.MathUtils.degToRad(this.perspectiveCamera.fov / 2));
      this.orthographicCamera.left = (-frustumHeight * aspect) / 2;
      this.orthographicCamera.right = (frustumHeight * aspect) / 2;
      this.orthographicCamera.top = frustumHeight / 2;
      this.orthographicCamera.bottom = -frustumHeight / 2;
      this.orthographicCamera.zoom = 1;
      this.orthographicCamera.position.copy(this.perspectiveCamera.position);
      this.orthographicCamera.quaternion.copy(this.perspectiveCamera.quaternion);
      this.orthographicCamera.updateProjectionMatrix();
      this.activeCamera = this.orthographicCamera;
    } else {
      this.perspectiveCamera.position.copy(this.orthographicCamera.position);
      this.perspectiveCamera.quaternion.copy(this.orthographicCamera.quaternion);
      this.perspectiveCamera.updateProjectionMatrix();
      this.activeCamera = this.perspectiveCamera;
    }

    this.projection = next;
    this.orbitControls.object = this.activeCamera;
    this.transformControls.camera = this.activeCamera;
    this.rotateGizmoControls.camera = this.activeCamera;
    this.scaleGizmoControls.camera = this.activeCamera;
    this.orbitControls.update();
    this.emitCameraPose();
    this.emitCameraMovement('projection');
    this.requestRender();
  }

  public setCameraPreset(preset: CameraPreset): void {
    const target = this.orbitControls.target.clone();
    if (preset === 'focus') {
      if (this.selectedObjectId) {
        const visual = this.visuals.get(this.selectedObjectId);
        if (visual) {
          target.copy(visual.group.position);
        } else {
          target.set(0, 0, 0);
        }
      } else {
        target.set(0, 0, 0);
      }
    }

    const currentDist = Math.max(
      2.5,
      this.activeCamera.position.distanceTo(this.orbitControls.target),
    );
    const offsetTuple = computeCameraPresetOffset(preset, currentDist);
    const offset = new THREE.Vector3(...offsetTuple);

    const desiredPos = target.clone().add(offset);
    if (this.isSoftwareGl) {
      this.activeCamera.position.copy(desiredPos);
      this.orbitControls.target.copy(target);
      this.orbitControls.update();
      this.emitCameraPose();
      this.emitCameraMovement('preset');
      this.requestRender();
    } else {
      this.cameraAnimTargetPos = desiredPos;
      this.cameraAnimTargetLook = target;
      this.lastAnimTime = performance.now();
      this.requestRender();
    }
  }

  private handleResize(): void {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    const aspect = width / height;

    this.perspectiveCamera.aspect = aspect;
    this.perspectiveCamera.updateProjectionMatrix();

    const orthoHeight = this.orthographicCamera.top - this.orthographicCamera.bottom;
    this.orthographicCamera.left = (-orthoHeight * aspect) / 2;
    this.orthographicCamera.right = (orthoHeight * aspect) / 2;
    this.orthographicCamera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
    this.requestRender();
  }

  public setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    if (!paused && !this.disposed) {
      this.handleResize();
      this.requestRender();
    }
  }

  public resetCameraToDefault(): void {
    if (this.disposed) return;
    this.cameraAnimTargetPos = null;
    this.cameraAnimTargetLook = null;
    this.orbitControls.target.set(0, 0, 0);
    this.perspectiveCamera.position.set(5.6, -6.2, 4.2);
    this.perspectiveCamera.lookAt(0, 0, 0);
    this.orthographicCamera.position.copy(this.perspectiveCamera.position);
    this.orthographicCamera.lookAt(0, 0, 0);
    this.orbitControls.update();
    this.emitCameraPose();
    if (!this.paused) {
      this.requestRender();
    }
  }

  public captureThumbnailDataUrl(width = 480, height = 320): string | null {
    if (this.disposed) return null;
    const tHelper = this.transformControls.getHelper();
    const rHelper = this.rotateGizmoControls.getHelper();
    const sHelper = this.scaleGizmoControls.getHelper();

    const prevTVis = tHelper.visible;
    const prevRVis = rHelper.visible;
    const prevSVis = sHelper.visible;
    const prevEditVis = this.editOverlayGroup.visible;
    const prevRingVis = this.proportionalRing.visible;
    const prevSculptCursorVis = this.sculptCursorGroup.visible;
    const prevSculptMirrorVis = this.sculptCursorMirrorGroup.visible;

    try {
      tHelper.visible = false;
      rHelper.visible = false;
      sHelper.visible = false;
      this.editOverlayGroup.visible = false;
      this.proportionalRing.visible = false;
      this.sculptCursorGroup.visible = false;
      this.sculptCursorMirrorGroup.visible = false;

      this.renderer.render(this.scene, this.activeCamera);
      return encodeProjectThumbnailFromCanvas(this.renderer.domElement, width, height);
    } catch {
      return null;
    } finally {
      tHelper.visible = prevTVis;
      rHelper.visible = prevRVis;
      sHelper.visible = prevSVis;
      this.editOverlayGroup.visible = prevEditVis;
      this.proportionalRing.visible = prevRingVis;
      this.sculptCursorGroup.visible = prevSculptCursorVis;
      this.sculptCursorMirrorGroup.visible = prevSculptMirrorVis;
      if (!this.paused) {
        this.requestRender();
      }
    }
  }

  public requestRender(): void {
    if (this.disposed || this.paused) return;
    if (this.renderBusy) {
      this.renderDirty = true;
      return;
    }
    this.renderBusy = true;

    this.frameId = requestAnimationFrame(() => {
      if (this.disposed) return;
      this.renderDirty = false;

      // Advance damped camera preset transitions
      let animating = false;
      if (this.cameraAnimTargetPos && this.cameraAnimTargetLook) {
        const now = performance.now();
        const dt = Math.min(0.05, Math.max(0.001, (now - this.lastAnimTime) / 1000));
        this.lastAnimTime = now;
        const lambda = 11;

        this.activeCamera.position.x = THREE.MathUtils.damp(
          this.activeCamera.position.x,
          this.cameraAnimTargetPos.x,
          lambda,
          dt,
        );
        this.activeCamera.position.y = THREE.MathUtils.damp(
          this.activeCamera.position.y,
          this.cameraAnimTargetPos.y,
          lambda,
          dt,
        );
        this.activeCamera.position.z = THREE.MathUtils.damp(
          this.activeCamera.position.z,
          this.cameraAnimTargetPos.z,
          lambda,
          dt,
        );

        this.orbitControls.target.x = THREE.MathUtils.damp(
          this.orbitControls.target.x,
          this.cameraAnimTargetLook.x,
          lambda,
          dt,
        );
        this.orbitControls.target.y = THREE.MathUtils.damp(
          this.orbitControls.target.y,
          this.cameraAnimTargetLook.y,
          lambda,
          dt,
        );
        this.orbitControls.target.z = THREE.MathUtils.damp(
          this.orbitControls.target.z,
          this.cameraAnimTargetLook.z,
          lambda,
          dt,
        );

        if (
          this.activeCamera.position.distanceTo(this.cameraAnimTargetPos) < 0.01 &&
          this.orbitControls.target.distanceTo(this.cameraAnimTargetLook) < 0.01
        ) {
          this.activeCamera.position.copy(this.cameraAnimTargetPos);
          this.orbitControls.target.copy(this.cameraAnimTargetLook);
          this.cameraAnimTargetPos = null;
          this.cameraAnimTargetLook = null;
          this.emitCameraMovement('preset');
        } else {
          animating = true;
        }
      }

      const controlsMoved = this.orbitControls.update();
      this.emitCameraPose();
      if (this.proportionalRingVisible) {
        this.proportionalRing.quaternion.copy(this.activeCamera.quaternion);
      }
      this.updateSculptCursorScreenSize();
      this.renderer.render(this.scene, this.activeCamera);

      const done = () => {
        this.renderBusy = false;
        if (this.renderDirty || animating || controlsMoved) {
          this.requestRender();
        }
      };

      if (this.isSoftwareGl) {
        this.afterDraw(done);
      } else {
        done();
      }
    });
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.resizeObserver.disconnect();

    const dom = this.renderer.domElement;
    this.gestureManager.dispose();
    dom.removeEventListener('webglcontextlost', this.onContextLost);
    dom.removeEventListener('wheel', this.onViewportWheel);
    dom.removeEventListener('pointerdown', this.onSculptPointerDown, {
      capture: true,
    });
    dom.removeEventListener('pointermove', this.onSculptPointerMove, {
      capture: true,
    });
    dom.removeEventListener('pointerup', this.onSculptPointerUp, {
      capture: true,
    });
    dom.removeEventListener('pointercancel', this.onSculptPointerUp, {
      capture: true,
    });
    dom.removeEventListener('pointerleave', this.onSculptPointerLeave);
    dom.removeEventListener('pointerdown', this.onLoopCutSlidePointerDown);
    dom.removeEventListener('pointermove', this.onLoopCutSlidePointerMove);
    dom.removeEventListener('pointerup', this.onLoopCutSlidePointerUp);
    dom.removeEventListener('pointercancel', this.onLoopCutSlidePointerUp);

    this.transformControls.dispose();
    this.rotateGizmoControls.dispose();
    this.scaleGizmoControls.dispose();
    if (this.wheelCameraCommitTimer !== null) {
      window.clearTimeout(this.wheelCameraCommitTimer);
      this.wheelCameraCommitTimer = null;
    }
    this.orbitControls.dispose();
    this.vertexDotTexture.dispose();
    this.loopCutPreviewPoints.geometry.dispose();
    (this.loopCutPreviewPoints.material as THREE.Material).dispose();
    this.loopCutPreviewBars.geometry.dispose();
    (this.loopCutPreviewBars.material as THREE.Material).dispose();
    this.proportionalRing.geometry.dispose();
    (this.proportionalRing.material as THREE.Material).dispose();
    this.sculptCursorRing.geometry.dispose();
    (this.sculptCursorRing.material as THREE.Material).dispose();
    this.sculptCursorCenter.geometry.dispose();
    (this.sculptCursorCenter.material as THREE.Material).dispose();
    this.sculptCursorMirrorGeometry.dispose();
    this.sculptCursorMirrorMaterial.dispose();
    this.mergeCursorMarker.geometry.dispose();
    (this.mergeCursorMarker.material as THREE.Material).dispose();
    this.slideGuideLines.geometry.dispose();
    (this.slideGuideLines.material as THREE.Material).dispose();
    this.editSeamEdgesLine.geometry.dispose();
    (this.editSeamEdgesLine.material as THREE.Material).dispose();
    (this.editSeamEdgeBars.material as THREE.Material).dispose();
    this.editSelectedEdgesLine.geometry.dispose();
    this.editSelectedEdgesLine.material.dispose();
    this.ngonHighlightMesh.geometry.dispose();
    (this.ngonHighlightMesh.material as THREE.Material).dispose();
    this.ngonHighlightEdges.geometry.dispose();
    (this.ngonHighlightEdges.material as THREE.Material).dispose();

    for (const visual of this.visuals.values()) {
      this.disposeObjectVisual(visual);
    }
    this.visuals.clear();
    for (const sharedMat of this.sharedMaterials.values()) {
      sharedMat.dispose();
    }
    this.sharedMaterials.clear();
    for (const entries of this.sharedMaterialTextures.values()) {
      Object.values(entries).forEach((entry) => entry?.texture.dispose());
    }
    this.sharedMaterialTextures.clear();
    this.materialAssetMap.clear();

    this.renderer.dispose();
    if (dom.parentElement === this.container) {
      this.container.removeChild(dom);
    }
  }
}
