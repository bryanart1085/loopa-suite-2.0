import * as THREE from 'three';
import { EditableMesh } from '../mesh/EditableMesh';
import {
  createDefaultScene,
  createHierarchyId,
  createMaterialAsset,
  DEFAULT_MATERIAL_COLOR,
  DEFAULT_MATERIAL_METALLIC,
  DEFAULT_MATERIAL_NAME,
  DEFAULT_MATERIAL_ROUGHNESS,
  resolveObjectMaterial,
  syncProjectMaterialsAndObjects,
  toMaterialSlot,
} from '../project/hierarchy';
import { encodeProjectThumbnailFromCanvas } from '../project/thumbnail';
import { MaterialAsset, ProjectData, SceneObjectData } from '../project/types';
import { ImportedMeshPart } from './objImport';
import { StlImportResult } from './stlImport';

/**
 * Generates an offscreen 3D WebGL thumbnail for an array of SceneObjectData
 * framed automatically around the combined bounding box in Z-up space.
 * Returns null cleanly if WebGL is unavailable (e.g., headless environments).
 */
export function generateOffscreenProjectThumbnail(
  objects: SceneObjectData[],
  materials: MaterialAsset[] = [],
  width = 480,
  height = 320,
): string | null {
  if (typeof document === 'undefined' || objects.length === 0) return null;

  let renderer: THREE.WebGLRenderer | null = null;
  const geometries: THREE.BufferGeometry[] = [];
  const threeMaterials: THREE.Material[] = [];

  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(width, height, false);
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor('#18191c', 1);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#18191c');

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.01, 5000);
    camera.up.set(0, 0, 1);

    const hemi = new THREE.HemisphereLight('#f2f6ff', '#262b34', 1.15);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight('#ffffff', 1.7);
    keyLight.position.set(6, -7, 10);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight('#9ec7ff', 0.65);
    rimLight.position.set(-7, 6, 4);
    scene.add(rimLight);

    const group = new THREE.Group();
    const box = new THREE.Box3();
    let hasGeometry = false;

    for (const obj of objects) {
      if (obj.objectType !== 'mesh' || !obj.visible) continue;
      const editable = EditableMesh.fromJSON(obj.mesh);
      const tri = editable.buildTriangulatedData(obj.shading ?? 'flat');
      if (tri.positions.length === 0) continue;

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(tri.positions, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(tri.normals, 3));
      geometries.push(geo);

      const matAsset = resolveObjectMaterial(obj, materials);
      const mat = new THREE.MeshStandardMaterial({
        color: matAsset.baseColor,
        metalness: matAsset.metallic,
        roughness: matAsset.roughness,
        side: THREE.DoubleSide,
      });
      threeMaterials.push(mat);

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(...obj.transform.position);
      mesh.rotation.set(...obj.transform.rotation);
      mesh.scale.set(...obj.transform.scale);
      mesh.updateMatrixWorld(true);
      group.add(mesh);

      const meshBox = new THREE.Box3().setFromObject(mesh);
      if (!meshBox.isEmpty()) {
        box.union(meshBox);
        hasGeometry = true;
      }
    }

    if (!hasGeometry || box.isEmpty()) {
      return null;
    }

    scene.add(group);

    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    const radius = Math.max(0.25, size.length() * 0.5);
    const fovRad = THREE.MathUtils.degToRad(camera.fov);
    const dist = (radius / Math.sin(fovRad * 0.5)) * 1.15;

    const dir = new THREE.Vector3(0.72, -0.78, 0.54).normalize();
    camera.position.copy(center).addScaledVector(dir, dist);
    camera.near = Math.max(0.001, dist * 0.01);
    camera.far = Math.max(500, dist * 12);
    camera.lookAt(center);
    camera.updateProjectionMatrix();

    renderer.render(scene, camera);
    return encodeProjectThumbnailFromCanvas(canvas, width, height);
  } catch {
    return null;
  } finally {
    for (const geo of geometries) geo.dispose();
    for (const mat of threeMaterials) mat.dispose();
    renderer?.dispose();
  }
}

export function buildImportedModelProjectData(params: {
  projectName: string;
  folderId?: string | null;
  objParts?: ImportedMeshPart[];
  stlResult?: StlImportResult;
}): ProjectData {
  const now = Date.now();
  const baseScene = createDefaultScene('Scene', false);
  const collectionId = baseScene.activeCollectionId;

  const defaultMat = createMaterialAsset({
    id: 'mat_default',
    name: DEFAULT_MATERIAL_NAME,
    baseColor: DEFAULT_MATERIAL_COLOR,
    metallic: DEFAULT_MATERIAL_METALLIC,
    roughness: DEFAULT_MATERIAL_ROUGHNESS,
  });

  const materials: MaterialAsset[] = [defaultMat];
  const matByKey = new Map<string, MaterialAsset>();
  const objects: SceneObjectData[] = [];

  if (params.objParts && params.objParts.length > 0) {
    for (const part of params.objParts) {
      let assignedMat = defaultMat;
      if (part.materialInfo) {
        const existing = matByKey.get(part.materialInfo.key);
        if (existing) {
          assignedMat = existing;
        } else {
          const created = createMaterialAsset({
            name: part.materialInfo.name,
            baseColor: part.materialInfo.baseColor,
            metallic: part.materialInfo.metallic,
            roughness: part.materialInfo.roughness,
          });
          materials.push(created);
          matByKey.set(part.materialInfo.key, created);
          assignedMat = created;
        }
      }

      objects.push({
        id: createHierarchyId('obj'),
        name: part.name,
        objectType: 'mesh',
        primitiveType: 'custom',
        collectionId,
        visible: true,
        locked: false,
        transform: {
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
        mesh: part.mesh.toJSON(),
        materialId: assignedMat.id,
        material: toMaterialSlot(assignedMat),
        shading: 'flat',
        modifiers: [],
      });
    }
  } else if (params.stlResult) {
    objects.push({
      id: createHierarchyId('obj'),
      name: params.stlResult.name,
      objectType: 'mesh',
      primitiveType: 'custom',
      collectionId,
      visible: true,
      locked: false,
      transform: {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
      mesh: params.stlResult.mesh.toJSON(),
      materialId: defaultMat.id,
      material: toMaterialSlot(defaultMat),
      shading: 'flat',
      modifiers: [],
    });
  }

  const cleanName = params.projectName.trim() || 'Modelo Importado';
  const thumbnailDataUrl = generateOffscreenProjectThumbnail(objects, materials);

  const project: ProjectData = {
    version: 2,
    coordinateSystem: 'z-up',
    id: createHierarchyId('proj'),
    name: cleanName,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    folderId: params.folderId ?? null,
    thumbnailDataUrl,
    thumbnailUpdatedAt: thumbnailDataUrl ? now : undefined,
    activeSceneId: baseScene.id,
    materials,
    scenes: [
      {
        ...baseScene,
        objects,
      },
    ],
  };

  return syncProjectMaterialsAndObjects(project);
}
