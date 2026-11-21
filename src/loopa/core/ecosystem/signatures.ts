/**
 * LOOPA Core — change detection between apps.
 *
 * Computes compact signatures of every data area of a project so the ecosystem
 * can tell which areas an app session changed, warn when an app touched data
 * it does not own, and detect UVs that may be stale after geometry changes.
 */
import type { ProjectData, SceneObjectData } from '../project/types';
import { appCanModify, isLoopaAppId } from './apps';
import type {
  EcosystemSessionRecord,
  LoopaAppId,
  ProjectDomain,
  ProjectEcosystemMeta,
} from './types';

const HISTORY_LIMIT = 30;

class Fnv {
  private h = 0x811c9dc5;
  int(n: number): void {
    this.h ^= n & 0xff;
    this.h = Math.imul(this.h, 0x01000193);
    this.h ^= (n >>> 8) & 0xff;
    this.h = Math.imul(this.h, 0x01000193);
    this.h ^= (n >>> 16) & 0xff;
    this.h = Math.imul(this.h, 0x01000193);
    this.h ^= (n >>> 24) & 0xff;
    this.h = Math.imul(this.h, 0x01000193);
  }
  num(n: number | undefined): void {
    if (typeof n !== 'number' || !Number.isFinite(n)) {
      this.int(0x7fc00000);
      return;
    }
    const v = Math.round(n * 1e5);
    this.int(v | 0);
    this.int(Math.floor(v / 4294967296) | 0);
  }
  str(s: string | undefined): void {
    const text = s ?? '';
    this.int(text.length);
    for (let i = 0; i < text.length; i++) this.int(text.charCodeAt(i));
  }
  vec(v: ArrayLike<number> | undefined): void {
    if (!v) {
      this.int(-1);
      return;
    }
    this.int(v.length);
    for (let i = 0; i < v.length; i++) this.num(v[i]);
  }
  done(): string {
    return (this.h >>> 0).toString(16).padStart(8, '0');
  }
}

export interface ObjectSignature {
  topology: string;
  shape: string;
  uvs: string;
  materials: string;
  transform: string;
  modifiers: string;
}

export interface ProjectSignature {
  structure: string;
  materialLibrary: string;
  objects: Record<string, ObjectSignature>;
}

function allObjects(project: ProjectData): SceneObjectData[] {
  return project.scenes.flatMap((s) => s.objects);
}

export function computeObjectSignature(obj: SceneObjectData): ObjectSignature {
  const mesh = obj.mesh ?? { vertices: [], edges: [], faces: [] };
  const topo = new Fnv();
  const shape = new Fnv();
  const uv = new Fnv();
  const mat = new Fnv();

  topo.int(mesh.vertices.length);
  for (const v of mesh.vertices) {
    topo.str(v.id);
    shape.vec(v.position);
    shape.vec(v.normal);
    uv.vec(v.uv);
  }
  topo.int(mesh.faces.length);
  for (const f of mesh.faces) {
    topo.str(f.id);
    topo.int(f.vertexIds.length);
    for (const id of f.vertexIds) topo.str(id);
    if (f.normals) for (const n of f.normals) shape.vec(n);
    uv.int(f.uvs ? f.uvs.length : -1);
    if (f.uvs) for (const c of f.uvs) uv.vec(c);
    mat.str(f.materialId);
  }
  for (const e of mesh.edges) {
    uv.int(e.isSeam ? 1 : 0);
  }
  mat.str(obj.materialId);
  mat.str(JSON.stringify(obj.material ?? null));

  const tr = new Fnv();
  tr.vec(obj.transform?.position);
  tr.vec(obj.transform?.rotation);
  tr.vec(obj.transform?.scale);

  const mod = new Fnv();
  mod.str(JSON.stringify(obj.modifiers ?? []));
  mod.str(obj.shading);

  return {
    topology: topo.done(),
    shape: shape.done(),
    uvs: uv.done(),
    materials: mat.done(),
    transform: tr.done(),
    modifiers: mod.done(),
  };
}

export function computeProjectSignature(project: ProjectData): ProjectSignature {
  const structure = new Fnv();
  const objects: Record<string, ObjectSignature> = {};
  for (const scene of project.scenes) {
    structure.str(scene.id);
    structure.str(scene.name);
    for (const c of scene.collections) {
      structure.str(c.id);
      structure.str(c.name);
      structure.str(c.parentId ?? '');
    }
    for (const obj of scene.objects) {
      structure.str(obj.id);
      structure.str(obj.name);
      structure.str(obj.collectionId);
      objects[obj.id] = computeObjectSignature(obj);
    }
  }
  const lib = new Fnv();
  lib.str(JSON.stringify(project.materials ?? []));
  return { structure: structure.done(), materialLibrary: lib.done(), objects };
}

const DOMAIN_ORDER: ProjectDomain[] = [
  'structure',
  'topology',
  'shape',
  'transforms',
  'modifiers',
  'uvs',
  'materials',
];

/**
 * Which data areas differ between two signatures.
 * UV and per-face material changes on objects whose topology changed are treated
 * as consequences of the topology edit, not as separate edits.
 */
export function diffProjectSignatures(
  before: ProjectSignature,
  after: ProjectSignature,
): ProjectDomain[] {
  const changed = new Set<ProjectDomain>();
  if (before.structure !== after.structure) changed.add('structure');
  if (before.materialLibrary !== after.materialLibrary) changed.add('materials');
  for (const [id, a] of Object.entries(after.objects)) {
    const b = before.objects[id];
    if (!b) continue;
    const topologyChanged = b.topology !== a.topology;
    if (topologyChanged) changed.add('topology');
    if (b.shape !== a.shape) changed.add('shape');
    if (b.transform !== a.transform) changed.add('transforms');
    if (b.modifiers !== a.modifiers) changed.add('modifiers');
    if (!topologyChanged && b.uvs !== a.uvs) changed.add('uvs');
    if (!topologyChanged && b.materials !== a.materials) changed.add('materials');
  }
  return DOMAIN_ORDER.filter((d) => changed.has(d));
}

export function findDomainViolations(appId: LoopaAppId, changed: ProjectDomain[]): ProjectDomain[] {
  return changed.filter((d) => !appCanModify(appId, d));
}

export function createEmptyEcosystemMeta(): ProjectEcosystemMeta {
  return { formatVersion: 1, revision: 0, history: [], uvBasis: {} };
}

/** Objects whose topology changed after their UVs were last worked on in LOOPA UVs. */
export function findStaleUvObjects(
  project: ProjectData,
  meta: ProjectEcosystemMeta | undefined,
  signature: ProjectSignature = computeProjectSignature(project),
): { id: string; name: string }[] {
  if (!meta) return [];
  const stale: { id: string; name: string }[] = [];
  for (const obj of allObjects(project)) {
    const basis = meta.uvBasis[obj.id];
    const sig = signature.objects[obj.id];
    if (basis && sig && basis !== sig.topology) stale.push({ id: obj.id, name: obj.name });
  }
  return stale;
}

export interface SessionResult {
  meta: ProjectEcosystemMeta;
  changed: ProjectDomain[];
  violations: ProjectDomain[];
  staleUvObjects: { id: string; name: string }[];
}

/**
 * Close an app session: record what it changed, refresh the UV basis when
 * leaving LOOPA UVs, and report violations and stale UVs. Idempotent when
 * called again with the resulting signature as the new baseline.
 */
export function finalizeAppSession(
  project: ProjectData,
  appId: LoopaAppId,
  baseline: ProjectSignature,
  now: number = Date.now(),
): SessionResult {
  const current = computeProjectSignature(project);
  const prev = project.ecosystem ?? createEmptyEcosystemMeta();
  const changed = diffProjectSignatures(baseline, current);
  const violations = findDomainViolations(appId, changed);

  const uvBasis: Record<string, string> = {};
  for (const [id, topo] of Object.entries(prev.uvBasis)) {
    if (current.objects[id]) uvBasis[id] = topo;
  }
  if (appId === 'uvs') {
    for (const obj of allObjects(project)) {
      const sig = current.objects[obj.id];
      if (sig && obj.objectType === 'mesh' && obj.mesh?.faces?.length) uvBasis[obj.id] = sig.topology;
    }
  }

  const history: EcosystemSessionRecord[] = changed.length
    ? [...prev.history, { appId, at: now, domains: changed }].slice(-HISTORY_LIMIT)
    : prev.history;

  const meta: ProjectEcosystemMeta = {
    formatVersion: 1,
    revision: prev.revision + (changed.length ? 1 : 0),
    lastAppId: appId,
    lastAppAt: now,
    history,
    uvBasis,
  };
  return {
    meta,
    changed,
    violations,
    staleUvObjects: findStaleUvObjects(project, meta, current),
  };
}

const DOMAINS = new Set<string>(DOMAIN_ORDER);

/** Validate ecosystem metadata read from storage or an imported file. */
export function sanitizeEcosystemMeta(raw: unknown): ProjectEcosystemMeta | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Partial<ProjectEcosystemMeta>;
  const history = Array.isArray(r.history)
    ? r.history
        .filter(
          (h): h is EcosystemSessionRecord =>
            Boolean(h) && isLoopaAppId(h.appId) && typeof h.at === 'number' && Array.isArray(h.domains),
        )
        .map((h) => ({
          appId: h.appId,
          at: h.at,
          domains: h.domains.filter((d): d is ProjectDomain => DOMAINS.has(d)),
        }))
        .slice(-HISTORY_LIMIT)
    : [];
  const uvBasis: Record<string, string> = {};
  if (r.uvBasis && typeof r.uvBasis === 'object') {
    for (const [k, v] of Object.entries(r.uvBasis)) if (typeof v === 'string') uvBasis[k] = v;
  }
  return {
    formatVersion: 1,
    revision: typeof r.revision === 'number' && r.revision >= 0 ? Math.floor(r.revision) : 0,
    ...(isLoopaAppId(r.lastAppId) ? { lastAppId: r.lastAppId } : {}),
    ...(typeof r.lastAppAt === 'number' ? { lastAppAt: r.lastAppAt } : {}),
    history,
    uvBasis,
  };
}
