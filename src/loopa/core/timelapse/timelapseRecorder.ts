import { getActiveScene } from '../project/hierarchy';
import { ProjectData, SceneObjectData } from '../project/types';
import { RawSceneInput, RawSceneInputObject } from './timelapseStorage';
import { TimelapseCameraState } from './types';

export const DEFAULT_TIMELAPSE_CAMERA: TimelapseCameraState = {
  position: [5.6, -6.2, 4.2],
  target: [0, 0, 0],
  projection: 'perspective',
  orthoHeight: 10.6,
};

export function cloneCameraState(
  cam?: TimelapseCameraState | null,
): TimelapseCameraState {
  if (!cam) {
    return {
      position: [...DEFAULT_TIMELAPSE_CAMERA.position],
      target: [...DEFAULT_TIMELAPSE_CAMERA.target],
      projection: DEFAULT_TIMELAPSE_CAMERA.projection,
      orthoHeight: DEFAULT_TIMELAPSE_CAMERA.orthoHeight,
    };
  }
  return {
    position: [cam.position[0], cam.position[1], cam.position[2]],
    target: [cam.target[0], cam.target[1], cam.target[2]],
    projection: cam.projection === 'orthographic' ? 'orthographic' : 'perspective',
    orthoHeight:
      Number.isFinite(cam.orthoHeight) && cam.orthoHeight > 0.05
        ? cam.orthoHeight
        : DEFAULT_TIMELAPSE_CAMERA.orthoHeight,
  };
}

function cloneSceneObjectForSnapshot(obj: SceneObjectData): RawSceneInputObject {
  return {
    id: obj.id,
    name: obj.name,
    objectType: obj.objectType,
    primitiveType: obj.primitiveType,
    collectionId: obj.collectionId,
    visible: obj.visible,
    locked: obj.locked,
    transform: {
      position: [...obj.transform.position],
      rotation: [...obj.transform.rotation],
      scale: [...obj.transform.scale],
    },
    mesh: {
      vertices: obj.mesh.vertices.map((v) => ({
        id: v.id,
        position: [...v.position],
        ...(v.uv ? { uv: [v.uv[0], v.uv[1]] as [number, number] } : {}),
      })),
      edges: obj.mesh.edges.map((e) => ({
        id: e.id,
        v0: e.v0,
        v1: e.v1,
        ...(typeof e.bevelWeight === 'number'
          ? { bevelWeight: e.bevelWeight }
          : {}),
        ...(e.isSeam ? { isSeam: true } : {}),
      })),
      faces: obj.mesh.faces.map((f) => ({
        id: f.id,
        vertexIds: [...f.vertexIds],
        ...(f.uvs
          ? { uvs: f.uvs.map((uv) => [uv[0], uv[1]] as [number, number]) }
          : {}),
      })),
      nextVertexNum: obj.mesh.nextVertexNum ?? obj.mesh.vertices.length + 1,
      nextEdgeNum: obj.mesh.nextEdgeNum ?? obj.mesh.edges.length + 1,
      nextFaceNum: obj.mesh.nextFaceNum ?? obj.mesh.faces.length + 1,
    },
    material: { ...obj.material },
    ...(obj.materialId ? { materialId: obj.materialId } : {}),
    ...(obj.shading ? { shading: obj.shading } : {}),
    modifiers: obj.modifiers.map((m) => ({
      ...m,
      params: { ...(m.params as Record<string, unknown>) } as typeof m.params,
    })),
    ...(obj.referenceImage
      ? {
          referenceImage: {
            imageDataUrl: obj.referenceImage.imageDataUrl,
            fileName: obj.referenceImage.fileName,
            mimeType: obj.referenceImage.mimeType,
            naturalWidth: obj.referenceImage.naturalWidth,
            naturalHeight: obj.referenceImage.naturalHeight,
            opacity: obj.referenceImage.opacity,
            orientation: obj.referenceImage.orientation,
            depthMode: obj.referenceImage.depthMode,
            aspectRatio: obj.referenceImage.aspectRatio,
          },
        }
      : {}),
  };
}

export function extractRawSceneForTimelapse(project: ProjectData): RawSceneInput {
  const activeScene = getActiveScene(project);
  return {
    activeSceneId: activeScene.id,
    materials: (project.materials ?? []).map((m) => ({ ...m })),
    objects: activeScene.objects.map(cloneSceneObjectForSnapshot),
  };
}

/**
 * Filter negligible camera jitter while keeping intentional orbits, pans, zooms,
 * preset snaps, and projection toggles.
 */
export function shouldRecordCameraMovement(
  prev: TimelapseCameraState | null | undefined,
  next: TimelapseCameraState,
): boolean {
  if (!prev) return true;
  if (prev.projection !== next.projection) return true;

  if (
    prev.projection === 'orthographic' &&
    Math.abs(next.orthoHeight - prev.orthoHeight) /
      Math.max(0.1, prev.orthoHeight) >
      0.04
  ) {
    return true;
  }

  const dxT = next.target[0] - prev.target[0];
  const dyT = next.target[1] - prev.target[1];
  const dzT = next.target[2] - prev.target[2];
  const targetShift = Math.hypot(dxT, dyT, dzT);
  if (targetShift > 0.08) return true;

  const pvx = prev.position[0] - prev.target[0];
  const pvy = prev.position[1] - prev.target[1];
  const pvz = prev.position[2] - prev.target[2];
  const prevDist = Math.hypot(pvx, pvy, pvz);

  const nvx = next.position[0] - next.target[0];
  const nvy = next.position[1] - next.target[1];
  const nvz = next.position[2] - next.target[2];
  const nextDist = Math.hypot(nvx, nvy, nvz);

  if (prevDist > 1e-4 && Math.abs(nextDist - prevDist) / prevDist > 0.05) {
    return true;
  }

  if (prevDist > 1e-4 && nextDist > 1e-4) {
    const dot =
      (pvx * nvx + pvy * nvy + pvz * nvz) / (prevDist * nextDist);
    const clampedDot = Math.max(-1, Math.min(1, dot));
    const angleRad = Math.acos(clampedDot);
    if (angleRad > 0.045) return true; // ~2.6 deg
  }

  return false;
}

export function formatCameraSourceLabel(
  source: 'orbit' | 'preset' | 'projection',
  projection: TimelapseCameraState['projection'],
): string {
  if (source === 'projection') {
    return projection === 'orthographic'
      ? 'Vista ortográfica'
      : 'Vista en perspectiva';
  }
  if (source === 'preset') {
    return 'Cambio de vista de cámara';
  }
  return 'Movimiento de cámara';
}
