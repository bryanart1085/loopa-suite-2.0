/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Box } from 'lucide-react';
import { EditableMesh } from '../core/mesh/EditableMesh';
import {
  computeDerivedEditSelection,
  EditSelectionMode,
} from '../core/mesh/operations';
import {
  MaterialAsset,
  ObjectShadingMode,
  ObjectTransform,
} from '../core/project/types';
import { UVIsland, UVSelectionState } from '../core/uv/types';
import { sync3DSelectionFromUV } from '../core/uv/uvOperations';

interface UVSync3DViewportProps {
  objectId?: string | null;
  objectName?: string | null;
  mesh: EditableMesh;
  objectTransform?: ObjectTransform;
  materialAsset?: MaterialAsset | null;
  shading?: ObjectShadingMode;
  showChecker: boolean;
  uvSelection: UVSelectionState;
  islands: UVIsland[];
  multiSelectActive?: boolean;
  onPick3DComponent: (
    mode: EditSelectionMode,
    id: string,
    additive: boolean,
  ) => void;
}

export interface UVSync3DViewportHandle {
  resetCamera: () => void;
}

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
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(20,22,27,0.85)';
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createCheckerTexture(): THREE.CanvasTexture {
  const size = 512;
  const cell = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  for (let y = 0; y < size; y += cell) {
    for (let x = 0; x < size; x += cell) {
      const isDark = (x / cell + y / cell) % 2 === 0;
      ctx.fillStyle = isDark ? '#2c313b' : '#5ecd6e';
      ctx.fillRect(x, y, cell, cell);
      ctx.strokeStyle = '#181a1f';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, cell, cell);
    }
  }
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('0,0', 10, 24);
  ctx.fillText('1,0', 466, 24);
  ctx.fillText('0,1', 10, 496);
  ctx.fillText('1,1', 466, 496);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
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
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-6) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export const UVSync3DViewport = forwardRef<
  UVSync3DViewportHandle,
  UVSync3DViewportProps
>(({
  objectId,
  objectName,
  mesh,
  objectTransform,
  materialAsset,
  shading = 'flat',
  showChecker,
  uvSelection,
  islands,
  multiSelectActive = false,
  onPick3DComponent,
}, ref) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneObjectsRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    modelGroup: THREE.Group;
    solidMesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    wireEdges: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
    seamEdges: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
    selectedFacesMesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    selectedEdgesLine: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
    unselectedVerts: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
    selectedVerts: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
    checkerTexture: THREE.CanvasTexture;
    dotTexture: THREE.CanvasTexture;
    triangleToFaceId: string[];
    faceToTriangleRange: Map<string, { start: number; count: number }>;
    renderDirty: boolean;
  } | null>(null);
  const materialTextureRef = useRef<THREE.Texture | null>(null);
  const latestShowCheckerRef = useRef(showChecker);
  latestShowCheckerRef.current = showChecker;

  const latestPickPropsRef = useRef({
    mesh,
    uvMode: uvSelection.mode,
    multiSelectActive,
    onPick3DComponent,
  });
  latestPickPropsRef.current = {
    mesh,
    uvMode: uvSelection.mode,
    multiSelectActive,
    onPick3DComponent,
  };

  const synced3D = useMemo(
    () => sync3DSelectionFromUV(mesh, uvSelection, islands),
    [islands, mesh, uvSelection],
  );

  const derived3D = useMemo(
    () => computeDerivedEditSelection(mesh, synced3D.mode, synced3D.ids),
    [mesh, synced3D.ids, synced3D.mode],
  );

  const resetCameraToModel = useCallback(() => {
    const ctx = sceneObjectsRef.current;
    if (!ctx) return;
    ctx.modelGroup.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(ctx.solidMesh);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3(2, 2, 2);
    if (!box.isEmpty()) {
      box.getCenter(center);
      box.getSize(size);
    }
    const radius = Math.max(0.8, size.length() * 0.5);
    const dist = Math.max(2.6, radius * 2.5);
    ctx.controls.target.copy(center);
    ctx.camera.position.set(
      center.x + dist * 0.65,
      center.y - dist * 0.72,
      center.z + dist * 0.52,
    );
    ctx.controls.update();
    ctx.renderDirty = true;
  }, []);

  useImperativeHandle(
    ref,
    () => ({ resetCamera: resetCameraToModel }),
    [resetCameraToModel],
  );

  // Initialize Three.js WebGL scene once
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftGl = detectSoftwareWebGL();
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftGl,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(
      isSoftGl ? 1 : Math.min(window.devicePixelRatio || 1, 2),
    );
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.touchAction = 'none';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x14161b);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(44, width / height, 0.05, 400);
    camera.up.set(0, 0, 1);
    camera.position.set(3.2, -3.5, 2.5);
    camera.lookAt(0, 0, 0);

    const hemi = new THREE.HemisphereLight(0xb2c7e3, 0x262930, 0.85);
    scene.add(hemi);
    const keyLight = new THREE.DirectionalLight(0xfff5e8, 1.4);
    keyLight.position.set(6, -7, 10);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0xc2d4ff, 0.55);
    rimLight.position.set(-7, 6, 5);
    scene.add(rimLight);

    const grid = new THREE.GridHelper(16, 16, 0x383d48, 0x242730);
    grid.rotation.x = Math.PI / 2;
    grid.position.set(0, 0, -0.002);
    const gridMats = Array.isArray(grid.material)
      ? grid.material
      : [grid.material];
    for (const m of gridMats) {
      m.transparent = true;
      m.opacity = 0.7;
      m.depthWrite = false;
    }
    scene.add(grid);

    const modelGroup = new THREE.Group();
    scene.add(modelGroup);

    const checkerTexture = createCheckerTexture();
    const dotTexture = createVertexDotTexture();

    const solidMesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshStandardMaterial({
        color: 0xa1a7b3,
        roughness: 0.55,
        metalness: 0.08,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      }),
    );

    const wireEdges = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: 0x111317,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
      }),
    );
    wireEdges.renderOrder = 2;

    const seamEdges = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: 0xff2e63,
        depthTest: false,
        depthWrite: false,
      }),
    );
    seamEdges.renderOrder = 4;

    const selectedFacesMesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({
        color: 0xff9900,
        transparent: true,
        opacity: 0.44,
        side: THREE.DoubleSide,
        depthTest: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    selectedFacesMesh.renderOrder = 3;

    const selectedEdgesLine = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: 0xff9900,
        depthTest: false,
        depthWrite: false,
      }),
    );
    selectedEdgesLine.renderOrder = 5;

    const unselectedVerts = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial({
        color: 0xd1d5db,
        size: 8,
        sizeAttenuation: false,
        map: dotTexture,
        alphaTest: 0.45,
        depthTest: true,
        depthWrite: false,
      }),
    );
    unselectedVerts.renderOrder = 6;

    const selectedVerts = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial({
        color: 0xff9900,
        size: 13,
        sizeAttenuation: false,
        map: dotTexture,
        alphaTest: 0.45,
        depthTest: false,
        depthWrite: false,
      }),
    );
    selectedVerts.renderOrder = 7;

    modelGroup.add(
      solidMesh,
      selectedFacesMesh,
      wireEdges,
      seamEdges,
      selectedEdgesLine,
      unselectedVerts,
      selectedVerts,
    );

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftGl;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.78;
    controls.zoomSpeed = 0.9;
    controls.panSpeed = 0.85;
    controls.minDistance = 0.5;
    controls.maxDistance = 80;
    controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };

    const ctx = {
      renderer,
      scene,
      camera,
      controls,
      modelGroup,
      solidMesh,
      wireEdges,
      seamEdges,
      selectedFacesMesh,
      selectedEdgesLine,
      unselectedVerts,
      selectedVerts,
      checkerTexture,
      dotTexture,
      triangleToFaceId: [] as string[],
      faceToTriangleRange: new Map<string, { start: number; count: number }>(),
      renderDirty: true,
    };
    sceneObjectsRef.current = ctx;

    controls.addEventListener('change', () => {
      ctx.renderDirty = true;
    });

    // Pointer tap picking without interfering with OrbitControls drag / multi-touch
    let activeTapPointerId: number | null = null;
    let tapStartX = 0;
    let tapStartY = 0;
    let tapStartTime = 0;
    let multiTouchSeen = false;
    const activePointers = new Set<number>();
    const raycaster = new THREE.Raycaster();

    const onPointerDown = (e: PointerEvent) => {
      activePointers.add(e.pointerId);
      if (activePointers.size > 1) {
        multiTouchSeen = true;
        activeTapPointerId = null;
        return;
      }
      if (e.button > 0) return;
      multiTouchSeen = false;
      activeTapPointerId = e.pointerId;
      tapStartX = e.clientX;
      tapStartY = e.clientY;
      tapStartTime = performance.now();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerId !== activeTapPointerId) return;
      if (Math.hypot(e.clientX - tapStartX, e.clientY - tapStartY) > 7) {
        activeTapPointerId = null;
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      activePointers.delete(e.pointerId);
      const isCandidate =
        !multiTouchSeen &&
        e.pointerId === activeTapPointerId &&
        performance.now() - tapStartTime < 450 &&
        Math.hypot(e.clientX - tapStartX, e.clientY - tapStartY) <= 7;
      if (activePointers.size === 0) {
        activeTapPointerId = null;
        multiTouchSeen = false;
      }
      if (!isCandidate) return;

      const {
        mesh: currMesh,
        uvMode,
        multiSelectActive: multi,
        onPick3DComponent: pickCb,
      } = latestPickPropsRef.current;

      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;
      const ndcX = (localX / rect.width) * 2 - 1;
      const ndcY = -(localY / rect.height) * 2 + 1;
      const additive = e.shiftKey || multi;

      ctx.modelGroup.updateMatrixWorld(true);
      const worldMat = ctx.modelGroup.matrixWorld;
      const projVec = new THREE.Vector3();
      const projB = new THREE.Vector3();

      if (uvMode === 'vertex') {
        const threshold = e.pointerType === 'touch' ? 24 : 15;
        let bestId: string | null = null;
        let bestScore = Infinity;
        for (const v of currMesh.vertices) {
          projVec.set(v.position[0], v.position[1], v.position[2]);
          projVec.applyMatrix4(worldMat).project(ctx.camera);
          if (projVec.z < -1 || projVec.z > 1) continue;
          const sx = ((projVec.x + 1) * 0.5) * rect.width;
          const sy = ((-projVec.y + 1) * 0.5) * rect.height;
          const dist = Math.hypot(sx - localX, sy - localY);
          if (dist <= threshold) {
            const score = dist + projVec.z * 2.5;
            if (score < bestScore) {
              bestScore = score;
              bestId = v.id;
            }
          }
        }
        if (bestId) {
          pickCb('vertex', bestId, additive);
          return;
        }
      } else if (uvMode === 'edge') {
        const threshold = e.pointerType === 'touch' ? 22 : 14;
        let bestId: string | null = null;
        let bestScore = Infinity;
        for (const edge of currMesh.edges) {
          const va = currMesh.getVertex(edge.v0);
          const vb = currMesh.getVertex(edge.v1);
          if (!va || !vb) continue;
          projVec
            .set(va.position[0], va.position[1], va.position[2])
            .applyMatrix4(worldMat)
            .project(ctx.camera);
          projB
            .set(vb.position[0], vb.position[1], vb.position[2])
            .applyMatrix4(worldMat)
            .project(ctx.camera);
          if (
            (projVec.z < -1 && projB.z < -1) ||
            (projVec.z > 1 && projB.z > 1)
          ) {
            continue;
          }
          const ax = ((projVec.x + 1) * 0.5) * rect.width;
          const ay = ((-projVec.y + 1) * 0.5) * rect.height;
          const bx = ((projB.x + 1) * 0.5) * rect.width;
          const by = ((-projB.y + 1) * 0.5) * rect.height;
          const dist = distToSegment2D(localX, localY, ax, ay, bx, by);
          if (dist <= threshold) {
            const depth = (projVec.z + projB.z) * 0.5;
            const score = dist + depth * 2.5;
            if (score < bestScore) {
              bestScore = score;
              bestId = edge.id;
            }
          }
        }
        if (bestId) {
          pickCb('edge', bestId, additive);
          return;
        }
      }

      // Face / Island picking (or fallback hit)
      raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), ctx.camera);
      const hits = raycaster.intersectObject(ctx.solidMesh, false);
      const hitFaceIdx = hits.length > 0 ? hits[0].faceIndex : undefined;
      if (typeof hitFaceIdx === 'number') {
        const faceId = ctx.triangleToFaceId[hitFaceIdx];
        if (faceId) {
          pickCb('face', faceId, additive);
        }
      }
    };

    const onPointerCancel = (e: PointerEvent) => {
      activePointers.delete(e.pointerId);
      if (e.pointerId === activeTapPointerId) activeTapPointerId = null;
      if (activePointers.size === 0) multiTouchSeen = false;
    };

    const dom = renderer.domElement;
    dom.addEventListener('pointerdown', onPointerDown);
    dom.addEventListener('pointermove', onPointerMove);
    dom.addEventListener('pointerup', onPointerUp);
    dom.addEventListener('pointercancel', onPointerCancel);

    const resizeObserver = new ResizeObserver(() => {
      const w = Math.max(1, container.clientWidth);
      const h = Math.max(1, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      ctx.renderDirty = true;
    });
    resizeObserver.observe(container);

    let rafId = 0;
    let timerId = 0;
    let disposed = false;

    const tick = () => {
      if (disposed) return;
      if (controls.enableDamping) {
        if (controls.update()) ctx.renderDirty = true;
      }
      if (ctx.renderDirty) {
        ctx.renderDirty = false;
        renderer.render(scene, camera);
      }
      if (isSoftGl) {
        timerId = window.setTimeout(tick, 45);
      } else {
        rafId = requestAnimationFrame(tick);
      }
    };
    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      clearTimeout(timerId);
      resizeObserver.disconnect();
      dom.removeEventListener('pointerdown', onPointerDown);
      dom.removeEventListener('pointermove', onPointerMove);
      dom.removeEventListener('pointerup', onPointerUp);
      dom.removeEventListener('pointercancel', onPointerCancel);
      controls.dispose();
      solidMesh.geometry.dispose();
      solidMesh.material.dispose();
      wireEdges.geometry.dispose();
      wireEdges.material.dispose();
      seamEdges.geometry.dispose();
      seamEdges.material.dispose();
      selectedFacesMesh.geometry.dispose();
      selectedFacesMesh.material.dispose();
      selectedEdgesLine.geometry.dispose();
      selectedEdgesLine.material.dispose();
      unselectedVerts.geometry.dispose();
      unselectedVerts.material.dispose();
      selectedVerts.geometry.dispose();
      selectedVerts.material.dispose();
      checkerTexture.dispose();
      dotTexture.dispose();
      renderer.dispose();
      if (dom.parentElement === container) {
        container.removeChild(dom);
      }
      sceneObjectsRef.current = null;
    };
  }, []);

  // Sync mesh geometry, seams, material, and checker preview
  useEffect(() => {
    const ctx = sceneObjectsRef.current;
    if (!ctx) return;

    if (objectTransform) {
      ctx.modelGroup.position.set(0, 0, 0);
      ctx.modelGroup.rotation.set(...objectTransform.rotation);
      ctx.modelGroup.scale.set(...objectTransform.scale);
    } else {
      ctx.modelGroup.position.set(0, 0, 0);
      ctx.modelGroup.rotation.set(0, 0, 0);
      ctx.modelGroup.scale.set(1, 1, 1);
    }

    const triData = mesh.buildTriangulatedData(shading);
    const solidGeo = new THREE.BufferGeometry();
    solidGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(triData.positions, 3),
    );
    solidGeo.setAttribute(
      'normal',
      new THREE.BufferAttribute(triData.normals, 3),
    );
    if (triData.uvs) {
      solidGeo.setAttribute('uv', new THREE.BufferAttribute(triData.uvs, 2));
    }
    solidGeo.computeBoundingSphere();

    ctx.solidMesh.geometry.dispose();
    ctx.solidMesh.geometry = solidGeo;
    ctx.triangleToFaceId = triData.triangleToFaceId;
    ctx.faceToTriangleRange = triData.faceToTriangleRange;

    const mat = ctx.solidMesh.material;
    if (showChecker) {
      mat.map = ctx.checkerTexture;
      mat.color.setHex(0xffffff);
      mat.metalness = 0.04;
      mat.roughness = 0.65;
    } else if (materialAsset) {
      mat.map = materialTextureRef.current;
      mat.color.set(
        materialAsset.textureDataUrl ? '#ffffff' : materialAsset.baseColor,
      );
      mat.metalness = materialAsset.metallic;
      mat.roughness = materialAsset.roughness;
    } else {
      mat.map = null;
      mat.color.setHex(0x9ca3af);
      mat.metalness = 0.08;
      mat.roughness = 0.55;
    }
    mat.needsUpdate = true;

    // Wireframe & Seam lines
    const wirePos: number[] = [];
    const seamPos: number[] = [];
    for (const edge of mesh.edges) {
      const va = mesh.getVertex(edge.v0);
      const vb = mesh.getVertex(edge.v1);
      if (!va || !vb) continue;
      wirePos.push(...va.position, ...vb.position);
      if (edge.isSeam) {
        seamPos.push(...va.position, ...vb.position);
      }
    }
    const wireGeo = new THREE.BufferGeometry();
    wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(wirePos, 3));
    ctx.wireEdges.geometry.dispose();
    ctx.wireEdges.geometry = wireGeo;

    const seamGeo = new THREE.BufferGeometry();
    seamGeo.setAttribute('position', new THREE.Float32BufferAttribute(seamPos, 3));
    ctx.seamEdges.geometry.dispose();
    ctx.seamEdges.geometry = seamGeo;
    ctx.seamEdges.visible = seamPos.length > 0;

    ctx.renderDirty = true;
  }, [materialAsset, mesh, objectTransform, shading, showChecker]);

  useEffect(() => {
    const previousTexture = materialTextureRef.current;
    if (previousTexture) {
      previousTexture.dispose();
      materialTextureRef.current = null;
    }

    const dataUrl = materialAsset?.textureDataUrl;
    const ctx = sceneObjectsRef.current;
    if (!dataUrl) {
      if (ctx && !latestShowCheckerRef.current) {
        ctx.solidMesh.material.map = null;
        ctx.solidMesh.material.needsUpdate = true;
        ctx.renderDirty = true;
      }
      return;
    }

    let disposed = false;
    let texture: THREE.Texture;
    texture = new THREE.TextureLoader().load(
      dataUrl,
      () => {
        if (disposed || materialTextureRef.current !== texture) return;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;
        const current = sceneObjectsRef.current;
        if (!current) return;
        if (!latestShowCheckerRef.current) {
          current.solidMesh.material.map = texture;
          current.solidMesh.material.color.set('#ffffff');
          current.solidMesh.material.needsUpdate = true;
        }
        current.renderDirty = true;
      },
      undefined,
      (error) => {
        if (disposed || materialTextureRef.current !== texture) return;
        console.error(
          `No se pudo cargar la textura "${materialAsset.textureName ?? materialAsset.name}".`,
          error,
        );
        materialTextureRef.current = null;
        const current = sceneObjectsRef.current;
        if (current && !latestShowCheckerRef.current) {
          current.solidMesh.material.map = null;
          current.solidMesh.material.color.set(materialAsset.baseColor);
          current.solidMesh.material.needsUpdate = true;
          current.renderDirty = true;
        }
        texture.dispose();
      },
    );
    texture.colorSpace = THREE.SRGBColorSpace;
    materialTextureRef.current = texture;
    if (ctx && !latestShowCheckerRef.current) {
      ctx.solidMesh.material.map = texture;
      ctx.solidMesh.material.needsUpdate = true;
      ctx.renderDirty = true;
    }

    return () => {
      disposed = true;
      if (materialTextureRef.current === texture) {
        materialTextureRef.current = null;
      }
      texture.dispose();
    };
  }, [materialAsset?.textureDataUrl]);

  // Auto-frame when switching selected object
  useEffect(() => {
    resetCameraToModel();
  }, [objectId]);

  // Sync live 3D selection highlight overlays whenever UV selection or mesh changes
  useEffect(() => {
    const ctx = sceneObjectsRef.current;
    if (!ctx) return;

    // 1. Selected Faces
    const facePos: number[] = [];
    if (derived3D.faceIds.size > 0) {
      const solidPos = ctx.solidMesh.geometry.getAttribute('position');
      if (solidPos) {
        for (const fid of derived3D.faceIds) {
          const range = ctx.faceToTriangleRange.get(fid);
          if (!range) continue;
          const startVert = range.start * 3;
          const endVert = (range.start + range.count) * 3;
          for (let i = startVert; i < endVert; i++) {
            facePos.push(solidPos.getX(i), solidPos.getY(i), solidPos.getZ(i));
          }
        }
      }
    }
    const selFaceGeo = new THREE.BufferGeometry();
    selFaceGeo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(facePos, 3),
    );
    ctx.selectedFacesMesh.geometry.dispose();
    ctx.selectedFacesMesh.geometry = selFaceGeo;
    ctx.selectedFacesMesh.visible = facePos.length > 0;

    // 2. Selected Edges
    const edgePos: number[] = [];
    for (const eid of derived3D.edgeIds) {
      const edge = mesh.getEdge(eid);
      if (!edge) continue;
      const va = mesh.getVertex(edge.v0);
      const vb = mesh.getVertex(edge.v1);
      if (!va || !vb) continue;
      edgePos.push(...va.position, ...vb.position);
    }
    const selEdgeGeo = new THREE.BufferGeometry();
    selEdgeGeo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(edgePos, 3),
    );
    ctx.selectedEdgesLine.geometry.dispose();
    ctx.selectedEdgesLine.geometry = selEdgeGeo;
    ctx.selectedEdgesLine.visible = edgePos.length > 0;

    // 3. Vertices
    const unselPos: number[] = [];
    const selPos: number[] = [];
    const showUnselDots = uvSelection.mode === 'vertex';
    for (const v of mesh.vertices) {
      if (derived3D.vertexIds.has(v.id)) {
        selPos.push(...v.position);
      } else if (showUnselDots) {
        unselPos.push(...v.position);
      }
    }

    const unselGeo = new THREE.BufferGeometry();
    unselGeo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(unselPos, 3),
    );
    ctx.unselectedVerts.geometry.dispose();
    ctx.unselectedVerts.geometry = unselGeo;
    ctx.unselectedVerts.visible = unselPos.length > 0;

    const selVertGeo = new THREE.BufferGeometry();
    selVertGeo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(selPos, 3),
    );
    ctx.selectedVerts.geometry.dispose();
    ctx.selectedVerts.geometry = selVertGeo;
    ctx.selectedVerts.visible = selPos.length > 0;

    ctx.renderDirty = true;
  }, [derived3D, mesh, uvSelection.mode]);

  return (
    <div
      data-testid="uv-sync-3d-viewport"
      className="relative flex-1 min-h-0 min-w-0 flex flex-col bg-[#14161b] border-t md:border-t-0 md:border-l border-[#2b2e36] overflow-hidden select-none"
    >
      {/* Three.js Canvas Mount */}
      <div
        ref={mountRef}
        className="relative flex-1 min-h-0 w-full"
        style={{
          touchAction: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
        }}
      >
        <div className="pointer-events-none absolute top-2 left-2 z-10 flex items-center gap-1.5 px-2 py-1 rounded bg-[#111317]/80 border border-[#2a2e38] text-[10px] font-semibold text-[#cbd5e1]">
          <Box className="w-3 h-3 text-[#38bdf8]" />
          Mundo 3D{objectName ? ` · ${objectName}` : ''}
        </div>
        <div
          data-testid="uv-sync-3d-count"
          className="pointer-events-none absolute top-2 right-2 z-10 px-2 py-1 rounded bg-[#111317]/80 border border-[#2a2e38] text-[10px] font-mono-tabular text-[#ff9900] font-semibold"
        >
          {synced3D.ids.size} sel.
        </div>
        <div className="pointer-events-none absolute bottom-2 left-2 px-2 py-0.5 rounded bg-[#111317]/80 border border-[#2a2e38] text-[10px] text-[#9ca3af]">
          Sincronizado con Editor UV · Toca para seleccionar
        </div>
      </div>
    </div>
  );
});
