import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { MaterialAsset, SceneObjectData } from '../project/types';
import { analyzeExportTargets } from './objExport';
import {
  buildThreeMeshForExport,
  ProgressCallback,
  yieldToMainThread,
} from './meshUtils';

export interface GlbExportResult {
  data: ArrayBuffer;
  exportedCount: number;
  skippedObjects: Array<{ id: string; name: string; reason: string }>;
}

export async function exportObjectsToGlb(
  candidates: SceneObjectData[],
  options: {
    applyTransform?: boolean;
    exportScale?: number;
    materials?: MaterialAsset[];
    onProgress?: ProgressCallback;
  } = {},
): Promise<GlbExportResult> {
  const report = analyzeExportTargets(candidates);
  if (report.validMeshes.length === 0) {
    throw new Error(
      'No hay mallas 3D válidas para exportar (las referencias de imagen no se exportan como GLB).',
    );
  }

  const exportGroup = new THREE.Group();
  const createdMeshes: THREE.Mesh[] = [];
  for (let i = 0; i < report.validMeshes.length; i++) {
    const obj = report.validMeshes[i];
    const mesh = buildThreeMeshForExport(obj, {
      applyTransform: options.applyTransform ?? true,
      exportScale: options.exportScale ?? 1,
      materials: options.materials,
    });
    if (mesh) {
      mesh.name = obj.name;
      exportGroup.add(mesh);
      createdMeshes.push(mesh);
    }
    if (i > 0 && i % 5 === 0) {
      options.onProgress?.(
        0.2 + (i / report.validMeshes.length) * 0.5,
        `Preparando "${obj.name}"...`,
      );
      await yieldToMainThread();
    }
  }
  if (createdMeshes.length === 0) {
    throw new Error('Ninguno de los objetos seleccionados generó geometría exportable.');
  }

  exportGroup.updateMatrixWorld(true);
  options.onProgress?.(0.75, 'Generando archivo GLB...');
  const exporter = new GLTFExporter();
  const binary = await new Promise<ArrayBuffer>((resolve, reject) => {
    exporter.parse(
      exportGroup,
      (result) => {
        if (result instanceof ArrayBuffer) resolve(result);
        else reject(new Error('El exportador no produjo un GLB binario válido.'));
      },
      (error) => reject(error instanceof Error ? error : new Error(String(error))),
      { binary: true, onlyVisible: true },
    );
  });

  for (const mesh of createdMeshes) {
    mesh.geometry.dispose();
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((material) => material.dispose());
    } else {
      mesh.material.dispose();
    }
  }
  options.onProgress?.(1, 'GLB generado');
  return {
    data: binary,
    exportedCount: createdMeshes.length,
    skippedObjects: report.skippedObjects,
  };
}
