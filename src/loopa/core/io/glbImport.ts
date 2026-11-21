import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  buildEditableMeshFromBufferGeometry,
  MAX_IMPORT_TRIANGLES,
  ProgressCallback,
  stripFileExtension,
  yieldToMainThread,
} from './meshUtils';
import { ImportedMeshPart, ObjImportResult } from './objImport';

export async function parseGlbBuffer(
  buffer: ArrayBuffer,
  fileName: string,
  options: {
    scale?: number;
    onProgress?: ProgressCallback;
  } = {},
): Promise<ObjImportResult> {
  if (buffer.byteLength === 0) {
    throw new Error('El archivo GLB está vacío.');
  }
  options.onProgress?.(0.08, 'Leyendo estructura GLB...');
  await yieldToMainThread();

  const gltf = await new Promise<{ scene: THREE.Object3D }>((resolve, reject) => {
    new GLTFLoader().parse(
      buffer,
      '',
      (result) => resolve(result as unknown as { scene: THREE.Object3D }),
      (error) => reject(error instanceof Error ? error : new Error(String(error))),
    );
  });

  const meshes: THREE.Mesh[] = [];
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((object) => {
    if (object instanceof THREE.Mesh) meshes.push(object);
  });
  if (meshes.length === 0) {
    throw new Error('El archivo GLB no contiene mallas 3D importables.');
  }

  const parts: ImportedMeshPart[] = [];
  const warnings: string[] = [];
  const scale = options.scale ?? 1;
  let triangleEstimate = 0;
  for (let i = 0; i < meshes.length; i++) {
    const source = meshes[i];
    source.updateWorldMatrix(true, false);
    const geometry = source.geometry.clone();
    geometry.applyMatrix4(source.matrixWorld);
    const position = geometry.getAttribute('position');
    const index = geometry.getIndex();
    const triangles = index
      ? Math.floor(index.count / 3)
      : position
        ? Math.floor(position.count / 3)
        : 0;
    triangleEstimate += triangles;
    if (triangleEstimate > MAX_IMPORT_TRIANGLES) {
      geometry.dispose();
      throw new Error(
        `El archivo GLB contiene más de ${MAX_IMPORT_TRIANGLES.toLocaleString()} triángulos y supera el límite seguro.`,
      );
    }
    const result = await buildEditableMeshFromBufferGeometry(geometry, {
      scale,
      onProgress: (progress, label) => {
        options.onProgress?.(
          0.15 + ((i + progress) / meshes.length) * 0.8,
          label,
        );
      },
    });
    geometry.dispose();
    const sourceMaterial = Array.isArray(source.material)
      ? source.material[0]
      : source.material;
    const color =
      sourceMaterial instanceof THREE.MeshStandardMaterial ||
      sourceMaterial instanceof THREE.MeshPhysicalMaterial
        ? `#${sourceMaterial.color.getHexString()}`
        : '#a0a0a0';
    parts.push({
      name: source.name || `GLB ${i + 1}`,
      mesh: result.mesh,
      material: {
        color,
        roughness:
          sourceMaterial instanceof THREE.MeshStandardMaterial ||
          sourceMaterial instanceof THREE.MeshPhysicalMaterial
            ? sourceMaterial.roughness
            : 0.55,
        metalness:
          sourceMaterial instanceof THREE.MeshStandardMaterial ||
          sourceMaterial instanceof THREE.MeshPhysicalMaterial
            ? sourceMaterial.metalness
            : 0,
      },
    });
    if (i > 0 && i % 5 === 0) await yieldToMainThread();
  }

  options.onProgress?.(1, 'GLB importado');
  return {
    baseName: stripFileExtension(fileName),
    parts,
    warnings,
    hadNormals: true,
    hadUvs: parts.some((part) =>
      part.mesh.faces.some((face) => (face.uvs?.length ?? 0) > 0),
    ),
    usedMtl: false,
  };
}
