import * as THREE from 'three';
import { EditableMesh, Vec3 } from './EditableMesh';
import { SculptBrushType, SculptSettings, SculptSymmetryAxes } from '../project/types';

export interface SculptBrushDescriptor {
  id: SculptBrushType;
  label: string;
  shortLabel: string;
  description: string;
  accentColor: string;
}

export const SCULPT_BRUSH_DEFS: SculptBrushDescriptor[] = [
  {
    id: 'draw',
    label: 'Draw (Dibujar)',
    shortLabel: 'Draw',
    description: 'Eleva o hunde la superficie suavemente siguiendo la normal.',
    accentColor: '#5ecd6e',
  },
  {
    id: 'smooth',
    label: 'Smooth (Suavizar)',
    shortLabel: 'Smooth',
    description: 'Relaja y suaviza irregularidades promediando vértices vecinos.',
    accentColor: '#38bdf8',
  },
  {
    id: 'grab',
    label: 'Grab (Agarrar)',
    shortLabel: 'Grab',
    description: 'Arrastra y deforma zonas de la malla libremente en el espacio.',
    accentColor: '#f59e0b',
  },
  {
    id: 'clay',
    label: 'Clay (Arcilla)',
    shortLabel: 'Clay',
    description: 'Rellena cavidades y añade volumen nivelado hacia un plano.',
    accentColor: '#fb7185',
  },
  {
    id: 'inflate',
    label: 'Inflate (Inflar)',
    shortLabel: 'Inflate',
    description: 'Expande o contrae cada vértice a lo largo de su normal propia.',
    accentColor: '#a78bfa',
  },
  {
    id: 'crease',
    label: 'Crease (Pliegue)',
    shortLabel: 'Crease',
    description: 'Marca surcos profundos y pellizca bordes hacia el centro.',
    accentColor: '#f43f5e',
  },
  {
    id: 'flatten',
    label: 'Flatten (Aplanar)',
    shortLabel: 'Flatten',
    description: 'Nivela la geometría proyectándola sobre el plano tangente.',
    accentColor: '#2dd4bf',
  },
  {
    id: 'pinch',
    label: 'Pinch (Pellizcar)',
    shortLabel: 'Pinch',
    description: 'Atrae vértices tangencialmente para afilar aristas y pliegues.',
    accentColor: '#fbbf24',
  },
  {
    id: 'draw_sharp',
    label: 'Draw Sharp (Trazo afilado)',
    shortLabel: 'Sharp',
    description: 'Esculpe crestas o hendiduras estrechas de perfil marcado.',
    accentColor: '#818cf8',
  },
  {
    id: 'clay_strips',
    label: 'Clay Strips (Tiras)',
    shortLabel: 'Strips',
    description: 'Deposita bandas planas de arcilla siguiendo la dirección del trazo.',
    accentColor: '#fb923c',
  },
];

export const DEFAULT_SCULPT_SETTINGS: SculptSettings = {
  brush: 'draw',
  radius: 0.45,
  strength: 0.45,
  invert: false,
  symmetry: { x: false, y: false, z: false },
  strokeSmoothing: 0.35,
};

interface GrabCapturedVertex {
  vertexId: string;
  weight: number;
  sx: number;
  sy: number;
  sz: number;
}

export interface SculptStrokeSession {
  objectId: string;
  beforeMesh: EditableMesh;
  workingMesh: EditableMesh;
  settings: SculptSettings;
  matrixWorld: THREE.Matrix4;
  matrixWorldInv: THREE.Matrix4;
  adjacency: Map<string, string[]>;
  lastWorldHit: THREE.Vector3;
  lastWorldNormal: THREE.Vector3;
  grabStartWorldHit: THREE.Vector3;
  grabCaptured: GrabCapturedVertex[];
  grabInitialLocalPositions: Map<string, Vec3>;
  hasModified: boolean;
}

function getSymmetryCombinations(sym: SculptSymmetryAxes): [number, number, number][] {
  const xs = sym.x ? [1, -1] : [1];
  const ys = sym.y ? [1, -1] : [1];
  const zs = sym.z ? [1, -1] : [1];
  const combos: [number, number, number][] = [];
  for (const sx of xs) {
    for (const sy of ys) {
      for (const sz of zs) {
        combos.push([sx, sy, sz]);
      }
    }
  }
  return combos;
}

function smoothFalloff(dist: number, radius: number): number {
  if (dist >= radius || radius <= 1e-6) return 0;
  const t = dist / radius;
  const inv = 1 - t * t;
  return inv * inv;
}

function sharpFalloff(dist: number, radius: number): number {
  if (dist >= radius || radius <= 1e-6) return 0;
  const t = 1 - dist / radius;
  return Math.pow(t, 2.6);
}

function buildVertexAdjacency(mesh: EditableMesh): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const v of mesh.vertices) {
    const neighbors = mesh.getConnectedVertices(v.id);
    if (neighbors.length > 0) {
      adj.set(v.id, Array.from(new Set(neighbors)));
    } else {
      adj.set(v.id, []);
    }
  }
  return adj;
}

export function createSculptStrokeSession(params: {
  objectId: string;
  mesh: EditableMesh;
  matrixWorld: THREE.Matrix4;
  settings: SculptSettings;
  worldHit: THREE.Vector3;
  worldNormal: THREE.Vector3;
}): SculptStrokeSession {
  const beforeMesh = params.mesh.clone();
  const workingMesh = params.mesh.clone();
  const matrixWorld = params.matrixWorld.clone();
  const matrixWorldInv = new THREE.Matrix4().copy(matrixWorld).invert();
  const adjacency = buildVertexAdjacency(workingMesh);

  const grabInitialLocalPositions = new Map<string, Vec3>();
  for (const v of workingMesh.vertices) {
    grabInitialLocalPositions.set(v.id, [v.position[0], v.position[1], v.position[2]]);
  }

  const grabCaptured: GrabCapturedVertex[] = [];
  if (params.settings.brush === 'grab') {
    const localHit = params.worldHit.clone().applyMatrix4(matrixWorldInv);
    const combos = getSymmetryCombinations(params.settings.symmetry);
    const r = Math.max(0.02, params.settings.radius);
    const vWorld = new THREE.Vector3();
    const symCenterWorld = new THREE.Vector3();

    for (const v of workingMesh.vertices) {
      vWorld.set(v.position[0], v.position[1], v.position[2]).applyMatrix4(matrixWorld);
      let bestW = 0;
      let bestCombo: [number, number, number] = [1, 1, 1];
      for (const [sx, sy, sz] of combos) {
        symCenterWorld
          .set(localHit.x * sx, localHit.y * sy, localHit.z * sz)
          .applyMatrix4(matrixWorld);
        const dist = vWorld.distanceTo(symCenterWorld);
        const w = smoothFalloff(dist, r);
        if (w > bestW) {
          bestW = w;
          bestCombo = [sx, sy, sz];
        }
      }
      if (bestW > 1e-5) {
        grabCaptured.push({
          vertexId: v.id,
          weight: bestW,
          sx: bestCombo[0],
          sy: bestCombo[1],
          sz: bestCombo[2],
        });
      }
    }
  }

  return {
    objectId: params.objectId,
    beforeMesh,
    workingMesh,
    settings: {
      ...params.settings,
      symmetry: { ...params.settings.symmetry },
    },
    matrixWorld,
    matrixWorldInv,
    adjacency,
    lastWorldHit: params.worldHit.clone(),
    lastWorldNormal: params.worldNormal.clone().normalize(),
    grabStartWorldHit: params.worldHit.clone(),
    grabCaptured,
    grabInitialLocalPositions,
    hasModified: false,
  };
}

function applyGrabMove(
  session: SculptStrokeSession,
  worldPoint: THREE.Vector3,
): boolean {
  if (session.grabCaptured.length === 0) return false;
  const worldDelta = new THREE.Vector3().subVectors(
    worldPoint,
    session.grabStartWorldHit,
  );
  // Convert world displacement vector into object local vector (ignoring translation)
  const localOrigin = new THREE.Vector3(0, 0, 0).applyMatrix4(session.matrixWorldInv);
  const localTip = worldDelta.clone().applyMatrix4(session.matrixWorldInv);
  const localDelta = localTip.sub(localOrigin);

  const strengthScale = Math.min(1, 0.35 + session.settings.strength * 0.65);

  for (const item of session.grabCaptured) {
    const v = session.workingMesh.getVertex(item.vertexId);
    const init = session.grabInitialLocalPositions.get(item.vertexId);
    if (!v || !init) continue;
    const f = item.weight * strengthScale;
    v.position[0] = init[0] + localDelta.x * item.sx * f;
    v.position[1] = init[1] + localDelta.y * item.sy * f;
    v.position[2] = init[2] + localDelta.z * item.sz * f;
  }

  session.hasModified = true;
  session.lastWorldHit.copy(worldPoint);
  return true;
}

function applySurfaceDab(
  session: SculptStrokeSession,
  dabWorldHit: THREE.Vector3,
  dabWorldNormal: THREE.Vector3,
  dabWorldDir: THREE.Vector3,
): boolean {
  const { workingMesh, settings, matrixWorld, matrixWorldInv, adjacency } = session;
  const brush = settings.brush;
  const radius = Math.max(0.02, settings.radius);
  const strength = Math.max(0.01, Math.min(1, settings.strength));
  const sign = settings.invert ? -1 : 1;

  const combos = getSymmetryCombinations(settings.symmetry);
  const localHitBase = dabWorldHit.clone().applyMatrix4(matrixWorldInv);

  // Convert direction vectors (normal & stroke tangent) into local space safely
  const normalMatInv = new THREE.Matrix3().setFromMatrix4(matrixWorldInv).transpose();
  const originLocal = new THREE.Vector3(0, 0, 0).applyMatrix4(matrixWorldInv);
  const dirTipLocal = dabWorldDir.clone().applyMatrix4(matrixWorldInv);
  const localStrokeDirBase = dirTipLocal.sub(originLocal);
  if (localStrokeDirBase.lengthSq() > 1e-8) {
    localStrokeDirBase.normalize();
  } else {
    localStrokeDirBase.set(1, 0, 0);
  }

  const localNormalBase = dabWorldNormal.clone().applyMatrix3(normalMatInv).normalize();
  if (localNormalBase.lengthSq() < 1e-8) {
    localNormalBase.set(0, 0, 1);
  }

  // Snapshot positions for smooth/clay/flatten/etc. so dab evaluation is order-independent
  const readPos = new Map<string, Vec3>();
  for (const v of workingMesh.vertices) {
    readPos.set(v.id, [v.position[0], v.position[1], v.position[2]]);
  }

  // Precompute mirror centers in world & local space
  const mirrors = combos.map(([sx, sy, sz]) => {
    const lHit = new THREE.Vector3(
      localHitBase.x * sx,
      localHitBase.y * sy,
      localHitBase.z * sz,
    );
    const wHit = lHit.clone().applyMatrix4(matrixWorld);
    const lNorm = new THREE.Vector3(
      localNormalBase.x * sx,
      localNormalBase.y * sy,
      localNormalBase.z * sz,
    ).normalize();
    const lDir = new THREE.Vector3(
      localStrokeDirBase.x * sx,
      localStrokeDirBase.y * sy,
      localStrokeDirBase.z * sz,
    );
    if (lDir.lengthSq() > 1e-8) lDir.normalize();
    // Side vector perpendicular to lNorm and lDir
    const lSide = new THREE.Vector3().crossVectors(lNorm, lDir);
    if (lSide.lengthSq() > 1e-8) lSide.normalize();

    // Estimate local scale along normal so world displacement matches radius cleanly
    const worldNormEnd = wHit.clone().add(
      lNorm.clone().applyMatrix3(new THREE.Matrix3().setFromMatrix4(matrixWorld).transpose().invert()).normalize(),
    );
    const localScaleFactor = 1 / Math.max(0.05, worldNormEnd.applyMatrix4(matrixWorldInv).sub(lHit).length());

    return { sx, sy, sz, lHit, wHit, lNorm, lDir, lSide, localScaleFactor };
  });

  // Accumulate displacements per vertex across mirror instances, avoiding double-strength on symmetry seams
  const vWorld = new THREE.Vector3();
  const vLocal = new THREE.Vector3();
  const deltaAccum = new Map<string, [number, number, number]>();
  const weightSum = new Map<string, number>();
  const maxWeight = new Map<string, number>();

  const addDelta = (vid: string, dx: number, dy: number, dz: number, w: number) => {
    const prev = deltaAccum.get(vid);
    if (prev) {
      prev[0] += dx;
      prev[1] += dy;
      prev[2] += dz;
      weightSum.set(vid, (weightSum.get(vid) ?? 0) + w);
      maxWeight.set(vid, Math.max(maxWeight.get(vid) ?? 0, w));
    } else {
      deltaAccum.set(vid, [dx, dy, dz]);
      weightSum.set(vid, w);
      maxWeight.set(vid, w);
    }
  };

  for (const m of mirrors) {
    // Gather vertices inside world radius of this mirror hit
    const affected: { vid: string; dist: number; p: Vec3 }[] = [];
    for (const v of workingMesh.vertices) {
      const p = readPos.get(v.id)!;
      vWorld.set(p[0], p[1], p[2]).applyMatrix4(matrixWorld);
      const dist = vWorld.distanceTo(m.wHit);
      if (dist < radius) {
        affected.push({ vid: v.id, dist, p });
      }
    }
    if (affected.length === 0) continue;

    // For Clay & Flatten: compute average local plane position & normal inside brush
    let planeOrigin = m.lHit.clone();
    let planeNormal = m.lNorm.clone();
    if (brush === 'clay' || brush === 'flatten') {
      let cx = 0;
      let cy = 0;
      let cz = 0;
      let wTotal = 0;
      for (const item of affected) {
        const w = smoothFalloff(item.dist, radius);
        cx += item.p[0] * w;
        cy += item.p[1] * w;
        cz += item.p[2] * w;
        wTotal += w;
      }
      if (wTotal > 1e-6) {
        planeOrigin.set(cx / wTotal, cy / wTotal, cz / wTotal);
      }
    }

    const baseDispWorld = radius * strength * 0.24;

    for (const item of affected) {
      const { vid, dist, p } = item;
      const fSmooth = smoothFalloff(dist, radius);
      if (fSmooth <= 1e-5) continue;

      if (brush === 'draw') {
        const mag = baseDispWorld * sign * fSmooth * m.localScaleFactor;
        addDelta(vid, m.lNorm.x * mag, m.lNorm.y * mag, m.lNorm.z * mag, fSmooth);
      } else if (brush === 'draw_sharp') {
        const fSharp = sharpFalloff(dist, radius);
        const mag = radius * strength * 0.34 * sign * fSharp * m.localScaleFactor;
        addDelta(vid, m.lNorm.x * mag, m.lNorm.y * mag, m.lNorm.z * mag, fSharp);
      } else if (brush === 'inflate') {
        const vn = workingMesh.computeVertexNormal(vid);
        const mag = baseDispWorld * sign * fSmooth * m.localScaleFactor;
        addDelta(vid, vn[0] * mag, vn[1] * mag, vn[2] * mag, fSmooth);
      } else if (brush === 'smooth') {
        const neighbors = adjacency.get(vid);
        if (!neighbors || neighbors.length === 0) continue;
        let ax = 0;
        let ay = 0;
        let az = 0;
        let count = 0;
        for (const nid of neighbors) {
          const np = readPos.get(nid);
          if (np) {
            ax += np[0];
            ay += np[1];
            az += np[2];
            count++;
          }
        }
        if (count === 0) continue;
        const factor = Math.min(0.85, strength * 0.65) * fSmooth;
        addDelta(
          vid,
          (ax / count - p[0]) * factor,
          (ay / count - p[1]) * factor,
          (az / count - p[2]) * factor,
          fSmooth,
        );
      } else if (brush === 'flatten') {
        vLocal.set(p[0], p[1], p[2]);
        const signedDist = vLocal.clone().sub(planeOrigin).dot(planeNormal);
        const factor = Math.min(0.85, strength * 0.62) * fSmooth;
        const shift = -signedDist * factor;
        addDelta(
          vid,
          planeNormal.x * shift,
          planeNormal.y * shift,
          planeNormal.z * shift,
          fSmooth,
        );
      } else if (brush === 'clay') {
        vLocal.set(p[0], p[1], p[2]);
        const targetPlane = planeOrigin
          .clone()
          .addScaledVector(planeNormal, sign * radius * strength * 0.22 * m.localScaleFactor);
        const signedDist = vLocal.clone().sub(targetPlane).dot(planeNormal);
        // Pull toward offset target plane smoothly
        const factor = Math.min(0.8, strength * 0.58) * fSmooth;
        const shift = -signedDist * factor;
        addDelta(
          vid,
          planeNormal.x * shift,
          planeNormal.y * shift,
          planeNormal.z * shift,
          fSmooth,
        );
      } else if (brush === 'clay_strips') {
        vLocal.set(p[0], p[1], p[2]).sub(m.lHit);
        // Strip box-like profile: stronger inside core cross-section along stroke direction
        const along = Math.abs(vLocal.dot(m.lDir));
        const across = Math.abs(vLocal.dot(m.lSide));
        const rLocal = radius * m.localScaleFactor;
        const boxFactor =
          Math.max(0, 1 - Math.pow(along / Math.max(1e-5, rLocal), 3)) *
          Math.max(0, 1 - Math.pow(across / Math.max(1e-5, rLocal * 0.85), 3));
        const fStrip = Math.max(fSmooth * 0.35, boxFactor);
        const targetPlane = m.lHit
          .clone()
          .addScaledVector(m.lNorm, sign * radius * strength * 0.24 * m.localScaleFactor);
        const signedDist = new THREE.Vector3(p[0], p[1], p[2])
          .sub(targetPlane)
          .dot(m.lNorm);
        const shift = -signedDist * Math.min(0.85, strength * 0.65) * fStrip;
        addDelta(vid, m.lNorm.x * shift, m.lNorm.y * shift, m.lNorm.z * shift, fStrip);
      } else if (brush === 'pinch') {
        vLocal.set(p[0], p[1], p[2]).sub(m.lHit);
        const normalProj = vLocal.dot(m.lNorm);
        // Vector pointing tangentially from hit center to vertex
        const radialTan = vLocal.addScaledVector(m.lNorm, -normalProj);
        const factor = strength * 0.38 * fSmooth * -sign;
        addDelta(
          vid,
          radialTan.x * factor,
          radialTan.y * factor,
          radialTan.z * factor,
          fSmooth,
        );
      } else if (brush === 'crease') {
        const fSharp = sharpFalloff(dist, radius);
        // Carve inward (negative normal when not inverted) + pinch tangentially
        const depthMag = -sign * radius * strength * 0.24 * fSharp * m.localScaleFactor;
        vLocal.set(p[0], p[1], p[2]).sub(m.lHit);
        const normalProj = vLocal.dot(m.lNorm);
        const radialTan = vLocal.addScaledVector(m.lNorm, -normalProj);
        const pinchFactor = strength * 0.28 * fSmooth;
        addDelta(
          vid,
          m.lNorm.x * depthMag - radialTan.x * pinchFactor,
          m.lNorm.y * depthMag - radialTan.y * pinchFactor,
          m.lNorm.z * depthMag - radialTan.z * pinchFactor,
          Math.max(fSmooth, fSharp),
        );
      }
    }
  }

  let changed = false;
  for (const [vid, d] of deltaAccum.entries()) {
    const v = workingMesh.getVertex(vid);
    if (!v) continue;
    const sumW = weightSum.get(vid) ?? 1;
    const maxW = maxWeight.get(vid) ?? 1;
    // Normalize overlap between mirror spheres so centerline seams never double-spike
    const normScale = sumW > maxW + 1e-5 ? maxW / sumW : 1;
    const dx = d[0] * normScale;
    const dy = d[1] * normScale;
    const dz = d[2] * normScale;
    if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 1e-8) {
      v.position[0] += dx;
      v.position[1] += dy;
      v.position[2] += dz;
      changed = true;
    }
  }

  if (changed) {
    session.hasModified = true;
  }
  return changed;
}

export function stepSculptStroke(
  session: SculptStrokeSession,
  rawWorldHit: THREE.Vector3,
  rawWorldNormal: THREE.Vector3,
  isInitialDab = false,
): boolean {
  if (session.settings.brush === 'grab') {
    if (isInitialDab) return false;
    return applyGrabMove(session, rawWorldHit);
  }

  const smoothing = Math.max(0, Math.min(0.92, session.settings.strokeSmoothing));
  const lerpAlpha = isInitialDab ? 1 : 1 - smoothing * 0.78;
  const targetHit = isInitialDab
    ? rawWorldHit.clone()
    : session.lastWorldHit.clone().lerp(rawWorldHit, lerpAlpha);
  const targetNorm = rawWorldNormal.clone().normalize();

  if (isInitialDab) {
    const dir = new THREE.Vector3(1, 0, 0);
    const modified = applySurfaceDab(session, targetHit, targetNorm, dir);
    session.lastWorldHit.copy(targetHit);
    session.lastWorldNormal.copy(targetNorm);
    return modified;
  }

  const moveVec = new THREE.Vector3().subVectors(targetHit, session.lastWorldHit);
  const moveLen = moveVec.length();
  const spacing = Math.max(0.015, session.settings.radius * 0.24);
  const steps = Math.min(10, Math.max(1, Math.ceil(moveLen / spacing)));
  const moveDir = moveLen > 1e-6 ? moveVec.clone().divideScalar(moveLen) : new THREE.Vector3(1, 0, 0);

  let anyModified = false;
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    const pt = session.lastWorldHit.clone().lerp(targetHit, t);
    const nrm = session.lastWorldNormal.clone().lerp(targetNorm, t).normalize();
    if (applySurfaceDab(session, pt, nrm, moveDir)) {
      anyModified = true;
    }
  }

  session.lastWorldHit.copy(targetHit);
  session.lastWorldNormal.copy(targetNorm);
  return anyModified;
}
