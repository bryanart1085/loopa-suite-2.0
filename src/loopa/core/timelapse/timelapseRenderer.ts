import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EditableMesh, Vec3 } from '../mesh/EditableMesh';
import {
  buildTransformRefsFromObjects,
  evaluateObjectModifiers,
  hasActiveViewportModifiers,
} from '../modifiers/evaluateModifiers';
import { ModifierTransformRef } from '../modifiers/types';
import {
  DEFAULT_MATERIAL_COLOR,
  DEFAULT_MATERIAL_METALLIC,
  DEFAULT_MATERIAL_ROUGHNESS,
  resolveObjectMaterial,
} from '../project/hierarchy';
import {
  MaterialAsset,
  SceneObjectData,
  ViewportDisplayMode,
} from '../project/types';
import {
  HydratedTimelapseFrame,
  HydratedTimelapseObject,
  TimelapseCameraState,
} from './types';

function detectSoftwareWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
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

interface CachedGeometryBundle {
  solidGeometry: THREE.BufferGeometry;
  wireGeometry: THREE.BufferGeometry;
  hasFaces: boolean;
}

export interface TimelapseRendererOptions {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  pixelRatio?: number;
  showGrid?: boolean;
  showAxes?: boolean;
}

/**
 * Pure, reusable studio 3D renderer reproducing LOOPA's exact Z-up look
 * for both the interactive Timelapse player preview and offscreen MP4 export.
 */
export class TimelapseRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly perspectiveCamera: THREE.PerspectiveCamera;
  private readonly orthographicCamera: THREE.OrthographicCamera;
  private readonly worldGroup: THREE.Group;
  private readonly gridHelper: THREE.GridHelper;
  private readonly axesGroup: THREE.Group;
  private readonly envTexture: THREE.Texture | null;
  private readonly isSoftwareGl: boolean;

  private readonly geometryCache = new Map<string, CachedGeometryBundle>();
  private readonly textureCache = new Map<string, THREE.Texture>();
  private readonly materialCache = new Map<string, THREE.MeshStandardMaterial>();
  private readonly clayMaterial: THREE.MeshStandardMaterial;
  private readonly wireMaterial: THREE.LineBasicMaterial;
  private readonly wireBorderMaterial: THREE.LineBasicMaterial;

  private activeWidth = 1;
  private activeHeight = 1;
  private disposed = false;

  // Scratch objects reused every frame to avoid GC spikes during MP4 export
  private readonly _vA = new THREE.Vector3();
  private readonly _vB = new THREE.Vector3();
  private readonly _vTarget = new THREE.Vector3();
  private readonly _euler = new THREE.Euler();

  constructor(options: TimelapseRendererOptions) {
    this.isSoftwareGl = detectSoftwareWebGL();
    this.activeWidth = Math.max(2, Math.round(options.width));
    this.activeHeight = Math.max(2, Math.round(options.height));

    this.renderer = new THREE.WebGLRenderer({
      canvas: options.canvas,
      antialias: !this.isSoftwareGl,
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    const dpr =
      options.pixelRatio ??
      (typeof window !== 'undefined'
        ? Math.min(window.devicePixelRatio || 1, 2)
        : 1);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(this.activeWidth, this.activeHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1d1f24);
    this.scene.fog = new THREE.FogExp2(0x1d1f24, 0.011);

    // Z-up CAD cameras matching ViewportEngine
    const aspect = this.activeWidth / this.activeHeight;
    this.perspectiveCamera = new THREE.PerspectiveCamera(45, aspect, 0.05, 500);
    this.perspectiveCamera.up.set(0, 0, 1);

    const halfH = 5.3;
    this.orthographicCamera = new THREE.OrthographicCamera(
      -halfH * aspect,
      halfH * aspect,
      halfH,
      -halfH,
      -100,
      500,
    );
    this.orthographicCamera.up.set(0, 0, 1);

    try {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      const envScene = new RoomEnvironment();
      this.envTexture = pmrem.fromScene(envScene, 0.04).texture;
      this.scene.environment = this.envTexture;
      envScene.dispose();
      pmrem.dispose();
    } catch {
      this.envTexture = null;
    }

    const hemi = new THREE.HemisphereLight(0xa6bddb, 0x262930, 0.8);
    const keyLight = new THREE.DirectionalLight(0xfff5e8, 1.45);
    keyLight.position.set(7, -8, 12);
    const rimLight = new THREE.DirectionalLight(0xc2d4ff, 0.55);
    rimLight.position.set(-8, 7, 6);
    this.scene.add(hemi, keyLight, rimLight);

    // XY Studio Grid
    this.gridHelper = new THREE.GridHelper(32, 32, 0x3f444f, 0x2a2d35);
    this.gridHelper.rotation.x = Math.PI / 2;
    this.gridHelper.position.set(0, 0, -0.001);
    const gridMats = Array.isArray(this.gridHelper.material)
      ? this.gridHelper.material
      : [this.gridHelper.material];
    for (const m of gridMats) {
      m.transparent = true;
      m.opacity = 0.85;
      m.depthWrite = false;
    }
    this.gridHelper.renderOrder = -2;
    this.gridHelper.visible = options.showGrid !== false;
    this.scene.add(this.gridHelper);

    this.axesGroup = this.createAxesGroup();
    this.axesGroup.visible = options.showAxes !== false;
    this.scene.add(this.axesGroup);

    this.worldGroup = new THREE.Group();
    this.scene.add(this.worldGroup);

    this.clayMaterial = new THREE.MeshStandardMaterial({
      color: '#959ca8',
      roughness: 0.58,
      metalness: 0.06,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });

    this.wireMaterial = new THREE.LineBasicMaterial({
      color: 0x9aa3b2,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    });

    this.wireBorderMaterial = new THREE.LineBasicMaterial({
      color: 0x525b6c,
    });
  }

  private createAxesGroup(): THREE.Group {
    const group = new THREE.Group();
    group.renderOrder = -2;
    const len = 16;

    const addAxis = (
      a: [number, number, number],
      b: [number, number, number],
      color: number,
    ) => {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(...a),
        new THREE.Vector3(...b),
      ]);
      const mat = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
      });
      const line = new THREE.Line(geo, mat);
      line.renderOrder = -2;
      group.add(line);
    };

    addAxis([-len, 0, 0.001], [len, 0, 0.001], 0xe05252);
    addAxis([0, -len, 0.001], [0, len, 0.001], 0x52b852);
    addAxis([0, 0, -len], [0, 0, len], 0x48bce8);
    return group;
  }

  public resize(width: number, height: number, pixelRatio?: number): void {
    if (this.disposed) return;
    const w = Math.max(2, Math.round(width));
    const h = Math.max(2, Math.round(height));
    if (pixelRatio !== undefined) {
      this.renderer.setPixelRatio(pixelRatio);
    }
    this.activeWidth = w;
    this.activeHeight = h;
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    this.perspectiveCamera.aspect = aspect;
    this.perspectiveCamera.updateProjectionMatrix();
  }

  public setGridAndAxes(showGrid: boolean, showAxes: boolean): void {
    this.gridHelper.visible = showGrid;
    this.axesGroup.visible = showAxes;
  }

  private getOrBuildGeometry(
    obj: HydratedTimelapseObject,
    sceneRefs: ModifierTransformRef[],
  ): CachedGeometryBundle {
    const modifiersSig = JSON.stringify(obj.modifiers);
    const shading = obj.shading === 'smooth' ? 'smooth' : 'flat';
    const refsKey = obj.modifiers.some((m) => m.enabled && m.type === 'mirror')
      ? JSON.stringify(sceneRefs)
      : '';
    const cacheKey = `${obj.id}|${obj.meshHash ?? 'nomesh'}|${modifiersSig}|${shading}|${refsKey}`;
    const existing = this.geometryCache.get(cacheKey);
    if (existing) return existing;

    let evalMesh: EditableMesh;
    if (hasActiveViewportModifiers(obj.modifiers)) {
      const ownerRef: ModifierTransformRef = {
        id: obj.id,
        position: obj.transform.position,
        rotation: obj.transform.rotation,
        scale: obj.transform.scale,
      };
      const evalRes = evaluateObjectModifiers(obj.mesh, obj.modifiers, {
        ownerTransform: ownerRef,
        sceneTransformRefs: sceneRefs,
      });
      evalMesh = EditableMesh.fromJSON(evalRes.mesh);
    } else {
      evalMesh = EditableMesh.fromJSON(obj.mesh);
    }

    const triData = evalMesh.buildTriangulatedData(shading);
    const solidGeometry = new THREE.BufferGeometry();
    solidGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(triData.positions, 3),
    );
    solidGeometry.setAttribute(
      'normal',
      new THREE.BufferAttribute(triData.normals, 3),
    );
    if (triData.uvs) {
      solidGeometry.setAttribute('uv', new THREE.BufferAttribute(triData.uvs, 2));
    }
    solidGeometry.computeBoundingBox();
    solidGeometry.computeBoundingSphere();

    // Build edge wireframe segments directly from EditableMesh edges
    const edgeVerts: number[] = [];
    for (const e of evalMesh.edges) {
      const v0 = evalMesh.getVertex(e.v0);
      const v1 = evalMesh.getVertex(e.v1);
      if (!v0 || !v1) continue;
      edgeVerts.push(
        v0.position[0],
        v0.position[1],
        v0.position[2],
        v1.position[0],
        v1.position[1],
        v1.position[2],
      );
    }
    const wireGeometry = new THREE.BufferGeometry();
    wireGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(edgeVerts, 3),
    );

    const bundle: CachedGeometryBundle = {
      solidGeometry,
      wireGeometry,
      hasFaces: triData.triangleToFaceId.length > 0,
    };
    this.geometryCache.set(cacheKey, bundle);
    return bundle;
  }

  private getOrCreateMaterial(
    obj: HydratedTimelapseObject,
    materials: MaterialAsset[],
    displayMode: ViewportDisplayMode,
    xrayTransparency: number,
  ): THREE.MeshStandardMaterial {
    if (displayMode !== 'material') {
      const isXray = displayMode === 'xray';
      const xrayOpacity = Math.max(
        0.08,
        Math.min(0.95, 1 - xrayTransparency / 100),
      );
      if (this.clayMaterial.transparent !== isXray) {
        this.clayMaterial.transparent = isXray;
        this.clayMaterial.needsUpdate = true;
      }
      this.clayMaterial.opacity = isXray ? xrayOpacity : 1;
      this.clayMaterial.depthWrite = !isXray;
      return this.clayMaterial;
    }

    const fakeObj = {
      material: obj.material,
      materialId: obj.materialId,
    } as Pick<SceneObjectData, 'material' | 'materialId'> as SceneObjectData;
    const resolved = resolveObjectMaterial(fakeObj, materials);
    const color = resolved.baseColor || DEFAULT_MATERIAL_COLOR;
    const roughness = Number.isFinite(resolved.roughness)
      ? resolved.roughness
      : DEFAULT_MATERIAL_ROUGHNESS;
    const metalness = Number.isFinite(resolved.metallic)
      ? resolved.metallic
      : DEFAULT_MATERIAL_METALLIC;
    const opacity = resolved.opacity ?? 1;
    const emissive = resolved.emissiveColor ?? '#000000';
    const emissiveIntensity = resolved.emissiveIntensity ?? 0;

    const key = `${color}|${roughness}|${metalness}|${opacity}|${emissive}|${emissiveIntensity}`;
    const cached = this.materialCache.get(key);
    if (cached) return cached;

    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      transparent: opacity < 0.999,
      opacity,
      depthWrite: opacity >= 0.999,
      emissive: new THREE.Color(emissive),
      emissiveIntensity,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    this.materialCache.set(key, mat);
    return mat;
  }

  private getReferenceTexture(
    refHash: string,
    dataUrl: string,
  ): Promise<THREE.Texture | null> {
    const existing = this.textureCache.get(refHash);
    if (existing) return Promise.resolve(existing);
    if (!dataUrl) return Promise.resolve(null);

    return new Promise((resolve) => {
      const loader = new THREE.TextureLoader();
      loader.load(
        dataUrl,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = 4;
          tex.needsUpdate = true;
          this.textureCache.set(refHash, tex);
          resolve(tex);
        },
        undefined,
        () => resolve(null),
      );
    });
  }

  public async preloadFrameTextures(
    frame: HydratedTimelapseFrame,
  ): Promise<void> {
    const promises: Promise<unknown>[] = [];
    for (const obj of frame.objects) {
      if (obj.objectType === 'reference_image' && obj.referenceImage) {
        promises.push(
          this.getReferenceTexture(
            obj.referenceImage.refImageHash,
            obj.referenceImage.imageDataUrl,
          ),
        );
      }
    }
    if (promises.length > 0) {
      await Promise.all(promises);
    }
  }

  private clearWorldGroup(): void {
    while (this.worldGroup.children.length > 0) {
      const child = this.worldGroup.children[0];
      this.worldGroup.remove(child);
      child.traverse((node) => {
        if (node instanceof THREE.Mesh && node.userData.ephemeralGeo) {
          node.geometry.dispose();
          if (Array.isArray(node.material)) {
            node.material.forEach((m) => m.dispose());
          } else {
            node.material.dispose();
          }
        }
      });
    }
  }

  public renderFrame(
    frame: HydratedTimelapseFrame,
    cameraState: TimelapseCameraState,
    options?: {
      displayMode?: ViewportDisplayMode;
      xrayTransparency?: number;
    },
  ): void {
    if (this.disposed) return;

    const displayMode = options?.displayMode ?? 'solid';
    const xrayTransparency = options?.xrayTransparency ?? 50;
    const isWireframe = displayMode === 'wireframe';

    this.clearWorldGroup();

    const sceneRefs: ModifierTransformRef[] = buildTransformRefsFromObjects(
      frame.objects as unknown as SceneObjectData[],
    );

    for (const obj of frame.objects) {
      if (!obj.visible) continue;

      const group = new THREE.Group();
      group.position.set(
        obj.transform.position[0],
        obj.transform.position[1],
        obj.transform.position[2],
      );
      this._euler.set(
        obj.transform.rotation[0],
        obj.transform.rotation[1],
        obj.transform.rotation[2],
        'XYZ',
      );
      group.rotation.copy(this._euler);
      group.scale.set(
        obj.transform.scale[0],
        obj.transform.scale[1],
        obj.transform.scale[2],
      );

      if (obj.objectType === 'reference_image' && obj.referenceImage) {
        const ref = obj.referenceImage;
        const aspect =
          ref.aspectRatio > 0
            ? ref.aspectRatio
            : ref.naturalWidth / Math.max(1, ref.naturalHeight);
        const baseSize = 4;
        const w = aspect >= 1 ? baseSize : baseSize * aspect;
        const h = aspect >= 1 ? baseSize / Math.max(0.05, aspect) : baseSize;
        const planeGeo = new THREE.PlaneGeometry(w, h);
        const tex = this.textureCache.get(ref.refImageHash) ?? null;
        const planeMat = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          map: tex,
          transparent: true,
          opacity: ref.opacity,
          side: THREE.DoubleSide,
          depthWrite: false,
          depthTest: ref.depthMode !== 'front',
        });
        const planeMesh = new THREE.Mesh(planeGeo, planeMat);
        planeMesh.userData.ephemeralGeo = true;
        planeMesh.renderOrder = ref.depthMode === 'front' ? 10 : -1;
        group.add(planeMesh);
        this.worldGroup.add(group);
        continue;
      }

      const bundle = this.getOrBuildGeometry(obj, sceneRefs);
      if (!isWireframe && bundle.hasFaces) {
        const mat = this.getOrCreateMaterial(
          obj,
          frame.materials,
          displayMode,
          xrayTransparency,
        );
        const solidMesh = new THREE.Mesh(bundle.solidGeometry, mat);
        group.add(solidMesh);
      }

      if (isWireframe || displayMode === 'xray' || !bundle.hasFaces) {
        const line = new THREE.LineSegments(
          bundle.wireGeometry,
          bundle.hasFaces ? this.wireMaterial : this.wireBorderMaterial,
        );
        line.renderOrder = 2;
        group.add(line);
      }

      this.worldGroup.add(group);
    }

    const activeCam = this.applyCameraState(cameraState);
    this.renderer.render(this.scene, activeCam);
  }

  private applyCameraState(cam: TimelapseCameraState): THREE.Camera {
    const aspect = this.activeWidth / this.activeHeight;
    this._vA.set(cam.position[0], cam.position[1], cam.position[2]);
    this._vTarget.set(cam.target[0], cam.target[1], cam.target[2]);

    // Prevent degenerate zero-length lookAt vector
    if (this._vA.distanceToSquared(this._vTarget) < 1e-6) {
      this._vA.set(
        cam.target[0] + 5.6,
        cam.target[1] - 6.2,
        cam.target[2] + 4.2,
      );
    }

    if (cam.projection === 'orthographic') {
      const frustumH = Math.max(0.25, cam.orthoHeight || 10);
      this.orthographicCamera.left = (-frustumH * aspect) / 2;
      this.orthographicCamera.right = (frustumH * aspect) / 2;
      this.orthographicCamera.top = frustumH / 2;
      this.orthographicCamera.bottom = -frustumH / 2;
      this.orthographicCamera.zoom = 1;
      this.orthographicCamera.position.copy(this._vA);
      this.orthographicCamera.lookAt(this._vTarget);
      this.orthographicCamera.updateProjectionMatrix();
      this.orthographicCamera.updateMatrixWorld();
      return this.orthographicCamera;
    }

    this.perspectiveCamera.aspect = aspect;
    this.perspectiveCamera.position.copy(this._vA);
    this.perspectiveCamera.lookAt(this._vTarget);
    this.perspectiveCamera.updateProjectionMatrix();
    this.perspectiveCamera.updateMatrixWorld();
    return this.perspectiveCamera;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearWorldGroup();

    for (const bundle of this.geometryCache.values()) {
      bundle.solidGeometry.dispose();
      bundle.wireGeometry.dispose();
    }
    this.geometryCache.clear();

    for (const tex of this.textureCache.values()) {
      tex.dispose();
    }
    this.textureCache.clear();

    for (const mat of this.materialCache.values()) {
      mat.dispose();
    }
    this.materialCache.clear();

    this.clayMaterial.dispose();
    this.wireMaterial.dispose();
    this.wireBorderMaterial.dispose();

    this.gridHelper.geometry.dispose();
    const gridMats = Array.isArray(this.gridHelper.material)
      ? this.gridHelper.material
      : [this.gridHelper.material];
    for (const m of gridMats) m.dispose();

    this.axesGroup.traverse((child) => {
      if (child instanceof THREE.Line) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });

    if (this.envTexture) {
      this.envTexture.dispose();
    }
    this.renderer.dispose();
  }
}

/**
 * Computes a clean, fixed studio isometric framing centered around the final model
 * so timelapses with "Exclude camera movements" keep the whole creation cleanly framed.
 */
export function computeStableHeroCamera(
  objects: HydratedTimelapseObject[],
): TimelapseCameraState {
  const box = new THREE.Box3();
  const pt = new THREE.Vector3();
  const euler = new THREE.Euler();
  const mat = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3();

  let hasPoint = false;

  for (const obj of objects) {
    if (!obj.visible || obj.objectType === 'reference_image') continue;
    pos.set(
      obj.transform.position[0],
      obj.transform.position[1],
      obj.transform.position[2],
    );
    euler.set(
      obj.transform.rotation[0],
      obj.transform.rotation[1],
      obj.transform.rotation[2],
      'XYZ',
    );
    quat.setFromEuler(euler);
    scale.set(
      obj.transform.scale[0],
      obj.transform.scale[1],
      obj.transform.scale[2],
    );
    mat.compose(pos, quat, scale);

    for (const v of obj.mesh.vertices) {
      pt.set(v.position[0], v.position[1], v.position[2]).applyMatrix4(mat);
      box.expandByPoint(pt);
      hasPoint = true;
    }
  }

  if (!hasPoint || box.isEmpty()) {
    return {
      position: [5.6, -6.2, 4.2],
      target: [0, 0, 0],
      projection: 'perspective',
      orthoHeight: 10.6,
    };
  }

  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(1.2, size.length() * 0.5);
  const distance = Math.max(4.8, radius * 2.55);

  const dir = new THREE.Vector3(0.62, -0.68, 0.48).normalize();
  const camPos = center.clone().addScaledVector(dir, distance);

  return {
    position: [camPos.x, camPos.y, camPos.z],
    target: [center.x, center.y, center.z],
    projection: 'perspective',
    orthoHeight: distance * 0.85,
  };
}

/**
 * Smoothly interpolates two camera poses spherically around the look target
 * so orbit transitions never cut linearly through the mesh.
 */
export function interpolateCameraState(
  a: TimelapseCameraState,
  b: TimelapseCameraState,
  t: number,
): TimelapseCameraState {
  const k = Math.max(0, Math.min(1, t));
  if (k <= 0) return a;
  if (k >= 1) return b;

  // Smoothstep easing for cinematic camera transitions
  const e = k * k * (3 - 2 * k);

  const target: Vec3 = [
    a.target[0] + (b.target[0] - a.target[0]) * e,
    a.target[1] + (b.target[1] - a.target[1]) * e,
    a.target[2] + (b.target[2] - a.target[2]) * e,
  ];

  const va = new THREE.Vector3(
    a.position[0] - a.target[0],
    a.position[1] - a.target[1],
    a.position[2] - a.target[2],
  );
  const vb = new THREE.Vector3(
    b.position[0] - b.target[0],
    b.position[1] - b.target[1],
    b.position[2] - b.target[2],
  );

  const distA = Math.max(0.25, va.length());
  const distB = Math.max(0.25, vb.length());
  const dist = distA + (distB - distA) * e;

  const dirA = va.normalize();
  const dirB = vb.normalize();
  const dot = Math.max(-1, Math.min(1, dirA.dot(dirB)));
  const theta = Math.acos(dot);

  let dir: THREE.Vector3;
  if (theta < 1e-4) {
    dir = dirA.clone().lerp(dirB, e).normalize();
  } else if (theta > Math.PI - 1e-3) {
    const up = new THREE.Vector3(0, 0, 1);
    const orthoAxis = new THREE.Vector3().crossVectors(dirA, up);
    if (orthoAxis.lengthSq() < 1e-4) orthoAxis.set(1, 0, 0);
    orthoAxis.normalize();
    dir = dirA.clone().applyAxisAngle(orthoAxis, Math.PI * e).normalize();
  } else {
    const sinTheta = Math.sin(theta);
    const wA = Math.sin((1 - e) * theta) / sinTheta;
    const wB = Math.sin(e * theta) / sinTheta;
    dir = dirA.multiplyScalar(wA).add(dirB.multiplyScalar(wB)).normalize();
  }

  const posX = target[0] + dir.x * dist;
  const posY = target[1] + dir.y * dist;
  const posZ = target[2] + dir.z * dist;

  return {
    position: [posX, posY, posZ],
    target,
    projection: e < 0.5 ? a.projection : b.projection,
    orthoHeight: a.orthoHeight + (b.orthoHeight - a.orthoHeight) * e,
  };
}
