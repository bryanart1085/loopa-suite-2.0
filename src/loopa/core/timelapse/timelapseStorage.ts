import { SerializedEditableMesh } from '../mesh/EditableMesh';
import {
  copyTimelapseStoresForProject,
  deleteTimelapseStoresForProject,
  openProjectsDb,
  STORE_TIMELAPSE_BLOBS,
  STORE_TIMELAPSE_META,
  STORE_TIMELAPSE_STEPS,
} from '../project/storage';
import {
  HydratedTimelapseFrame,
  HydratedTimelapseObject,
  TimelapseBlobKind,
  TimelapseBlobRecord,
  TimelapseCameraState,
  TimelapseObjectSnapshot,
  TimelapseProjectMeta,
  TimelapseSceneSnapshot,
  TimelapseStep,
  TimelapseStepKind,
} from './types';

export interface RawSceneInputObject {
  id: string;
  name: string;
  objectType: TimelapseObjectSnapshot['objectType'];
  primitiveType: TimelapseObjectSnapshot['primitiveType'];
  collectionId: string;
  visible: boolean;
  locked: boolean;
  transform: TimelapseObjectSnapshot['transform'];
  mesh: SerializedEditableMesh;
  material: TimelapseObjectSnapshot['material'];
  materialId?: string;
  shading?: TimelapseObjectSnapshot['shading'];
  modifiers: TimelapseObjectSnapshot['modifiers'];
  referenceImage?: {
    imageDataUrl: string;
    fileName: string;
    mimeType: string;
    naturalWidth: number;
    naturalHeight: number;
    opacity: number;
    orientation: NonNullable<
      TimelapseObjectSnapshot['referenceImage']
    >['orientation'];
    depthMode: NonNullable<
      TimelapseObjectSnapshot['referenceImage']
    >['depthMode'];
    aspectRatio: number;
  };
}

export interface RawSceneInput {
  activeSceneId: string;
  materials: TimelapseSceneSnapshot['materials'];
  objects: RawSceneInputObject[];
}

export interface AppendTimelapseStepInput {
  projectId: string;
  kind: TimelapseStepKind;
  opType: string;
  label: string;
  timestamp?: number;
  camera: TimelapseCameraState;
  scene?: RawSceneInput;
  autoRecordEnabled?: boolean;
}

// Per-project async write serializer to prevent sequence races
const projectWriteQueues = new Map<string, Promise<unknown>>();

// In-memory cache of blob hashes already known to be persisted for each project
const knownBlobHashesByProject = new Map<string, Set<string>>();

// Memory fallback when IndexedDB is unavailable (e.g., restricted environments or unit tests)
const memoryMetaStore = new Map<string, TimelapseProjectMeta>();
const memoryStepsStore = new Map<string, TimelapseStep>();
const memoryBlobsStore = new Map<string, TimelapseBlobRecord>();

function enqueueForProject<T>(
  projectId: string,
  task: () => Promise<T>,
): Promise<T> {
  const prev = projectWriteQueues.get(projectId) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(task);
  projectWriteQueues.set(projectId, next);
  next.finally(() => {
    if (projectWriteQueues.get(projectId) === next) {
      projectWriteQueues.delete(projectId);
    }
  });
  return next;
}

/**
 * Dual 32-bit FNV-1a (64-bit hex digest) synchronous content hash.
 * Fast enough (<0.4ms on typical meshes) to run without blocking UI frames.
 */
export function hashStringFast64(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c + (i & 0xff);
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

function measureStringBytes(str: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str).byteLength;
  }
  return str.length * 2;
}

async function compressString(
  text: string,
): Promise<{ compressed: boolean; payload: Uint8Array | string; byteLength: number }> {
  if (
    text.length < 768 ||
    typeof CompressionStream === 'undefined' ||
    typeof Blob === 'undefined'
  ) {
    return {
      compressed: false,
      payload: text,
      byteLength: measureStringBytes(text),
    };
  }
  try {
    const stream = new Blob([text])
      .stream()
      .pipeThrough(new CompressionStream('gzip'));
    const ab = await new Response(stream).arrayBuffer();
    const bytes = new Uint8Array(ab);
    return {
      compressed: true,
      payload: bytes,
      byteLength: bytes.byteLength,
    };
  } catch {
    return {
      compressed: false,
      payload: text,
      byteLength: measureStringBytes(text),
    };
  }
}

async function decompressRecordPayload(
  rec: TimelapseBlobRecord,
): Promise<string | null> {
  if (!rec.compressed) {
    if (typeof rec.payload === 'string') return rec.payload;
    if (rec.payload instanceof Uint8Array && typeof TextDecoder !== 'undefined') {
      return new TextDecoder().decode(rec.payload);
    }
    return null;
  }
  if (!(rec.payload instanceof Uint8Array)) {
    return typeof rec.payload === 'string' ? rec.payload : null;
  }
  if (typeof DecompressionStream !== 'undefined' && typeof Blob !== 'undefined') {
    try {
      const copy = new Uint8Array(rec.payload);
      const stream = new Blob([copy])
        .stream()
        .pipeThrough(new DecompressionStream('gzip'));
      return await new Response(stream).text();
    } catch {
      return null;
    }
  }
  return null;
}

function makeStepId(projectId: string, seq: number): string {
  return `${projectId}::${String(seq).padStart(7, '0')}`;
}

function makeBlobId(projectId: string, hash: string): string {
  return `${projectId}::${hash}`;
}

export function createEmptyTimelapseMeta(
  projectId: string,
  enabled = true,
): TimelapseProjectMeta {
  const now = Date.now();
  return {
    projectId,
    enabled,
    paused: false,
    stepCount: 0,
    modelStepCount: 0,
    cameraStepCount: 0,
    nextSeq: 0,
    lastCameraPose: null,
    totalEstimatedBytes: 0,
    createdAt: now,
    updatedAt: now,
  };
}

async function idbGetMeta(
  projectId: string,
): Promise<TimelapseProjectMeta | null> {
  const db = await openProjectsDb();
  if (!db || !db.objectStoreNames.contains(STORE_TIMELAPSE_META)) {
    return memoryMetaStore.get(projectId) ?? null;
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_TIMELAPSE_META, 'readonly');
      const req = tx.objectStore(STORE_TIMELAPSE_META).get(projectId);
      req.onsuccess = () =>
        resolve(
          (req.result as TimelapseProjectMeta | undefined) ??
            memoryMetaStore.get(projectId) ??
            null,
        );
      req.onerror = () => resolve(memoryMetaStore.get(projectId) ?? null);
    } catch {
      resolve(memoryMetaStore.get(projectId) ?? null);
    }
  });
}

async function idbPutMeta(meta: TimelapseProjectMeta): Promise<void> {
  memoryMetaStore.set(meta.projectId, meta);
  const db = await openProjectsDb();
  if (!db || !db.objectStoreNames.contains(STORE_TIMELAPSE_META)) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_TIMELAPSE_META, 'readwrite');
      tx.objectStore(STORE_TIMELAPSE_META).put(meta);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function getTimelapseMeta(
  projectId: string,
): Promise<TimelapseProjectMeta | null> {
  if (!projectId) return null;
  return idbGetMeta(projectId);
}

export async function getAllTimelapseMetas(): Promise<TimelapseProjectMeta[]> {
  const db = await openProjectsDb();
  if (!db || !db.objectStoreNames.contains(STORE_TIMELAPSE_META)) {
    return Array.from(memoryMetaStore.values());
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_TIMELAPSE_META, 'readonly');
      const req = tx.objectStore(STORE_TIMELAPSE_META).getAll();
      req.onsuccess = () =>
        resolve(
          Array.isArray(req.result)
            ? (req.result as TimelapseProjectMeta[])
            : [],
        );
      req.onerror = () => resolve(Array.from(memoryMetaStore.values()));
    } catch {
      resolve(Array.from(memoryMetaStore.values()));
    }
  });
}

export async function getTotalTimelapseStorageBytes(): Promise<{
  totalBytes: number;
  projectCount: number;
}> {
  const metas = await getAllTimelapseMetas();
  let totalBytes = 0;
  let projectCount = 0;
  for (const m of metas) {
    if (m.stepCount > 0 || m.totalEstimatedBytes > 0) {
      totalBytes += m.totalEstimatedBytes;
      projectCount++;
    }
  }
  return { totalBytes, projectCount };
}

export async function updateTimelapseMeta(
  projectId: string,
  patch: Partial<
    Pick<TimelapseProjectMeta, 'enabled' | 'paused' | 'lastCameraPose'>
  >,
): Promise<TimelapseProjectMeta> {
  return enqueueForProject(projectId, async () => {
    const curr =
      (await idbGetMeta(projectId)) ?? createEmptyTimelapseMeta(projectId);
    const next: TimelapseProjectMeta = {
      ...curr,
      ...patch,
      updatedAt: Date.now(),
    };
    await idbPutMeta(next);
    return next;
  });
}

export async function listTimelapseSteps(
  projectId: string,
): Promise<TimelapseStep[]> {
  if (!projectId) return [];
  const db = await openProjectsDb();
  if (!db || !db.objectStoreNames.contains(STORE_TIMELAPSE_STEPS)) {
    return Array.from(memoryStepsStore.values())
      .filter((s) => s.projectId === projectId)
      .sort((a, b) => a.seq - b.seq);
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_TIMELAPSE_STEPS, 'readonly');
      const idx = tx.objectStore(STORE_TIMELAPSE_STEPS).index('by_projectId');
      const req = idx.getAll(projectId);
      req.onsuccess = () => {
        const list = Array.isArray(req.result)
          ? (req.result as TimelapseStep[])
          : [];
        list.sort((a, b) => a.seq - b.seq);
        resolve(list);
      };
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

async function loadExistingBlobHashSet(projectId: string): Promise<Set<string>> {
  const cached = knownBlobHashesByProject.get(projectId);
  if (cached) return cached;

  const set = new Set<string>();
  const db = await openProjectsDb();
  if (db && db.objectStoreNames.contains(STORE_TIMELAPSE_BLOBS)) {
    const keys = await new Promise<string[]>((resolve) => {
      try {
        const tx = db.transaction(STORE_TIMELAPSE_BLOBS, 'readonly');
        const idx = tx.objectStore(STORE_TIMELAPSE_BLOBS).index('by_projectId');
        const req = idx.getAllKeys(projectId);
        req.onsuccess = () =>
          resolve(
            Array.isArray(req.result) ? req.result.map((k) => String(k)) : [],
          );
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
    const prefix = `${projectId}::`;
    for (const k of keys) {
      if (k.startsWith(prefix)) set.add(k.slice(prefix.length));
    }
  } else {
    for (const b of memoryBlobsStore.values()) {
      if (b.projectId === projectId) set.add(b.hash);
    }
  }
  knownBlobHashesByProject.set(projectId, set);
  return set;
}

export async function appendTimelapseStep(
  input: AppendTimelapseStepInput,
): Promise<{ step: TimelapseStep; meta: TimelapseProjectMeta } | null> {
  const { projectId } = input;
  if (!projectId || input.autoRecordEnabled === false) return null;

  return enqueueForProject(projectId, async () => {
    const now = input.timestamp ?? Date.now();
    const meta =
      (await idbGetMeta(projectId)) ??
      createEmptyTimelapseMeta(projectId, input.autoRecordEnabled ?? true);

    const knownHashes = await loadExistingBlobHashSet(projectId);
    const pendingBlobs: TimelapseBlobRecord[] = [];
    let addedBytes = 0;

    let sceneSnapshot: TimelapseSceneSnapshot | undefined;

    if (input.scene) {
      const snapshotObjects: TimelapseObjectSnapshot[] = [];

      for (const obj of input.scene.objects) {
        let meshHash: string | undefined;
        if (obj.objectType !== 'reference_image') {
          const serializedMesh = JSON.stringify(obj.mesh);
          meshHash = hashStringFast64(`m:${serializedMesh}`);
          if (!knownHashes.has(meshHash)) {
            knownHashes.add(meshHash);
            const packed = await compressString(serializedMesh);
            addedBytes += packed.byteLength;
            pendingBlobs.push({
              id: makeBlobId(projectId, meshHash),
              projectId,
              hash: meshHash,
              kind: 'mesh',
              compressed: packed.compressed,
              byteLength: packed.byteLength,
              payload: packed.payload,
            });
          }
        }

        let refSnapshot: TimelapseObjectSnapshot['referenceImage'];
        if (obj.referenceImage) {
          const dataUrl = obj.referenceImage.imageDataUrl;
          const refHash = hashStringFast64(`r:${dataUrl}`);
          if (!knownHashes.has(refHash)) {
            knownHashes.add(refHash);
            // DataURL is already image-compressed (JPEG/PNG); avoid wasting CPU re-gzipping
            const rawBytes = measureStringBytes(dataUrl);
            addedBytes += rawBytes;
            pendingBlobs.push({
              id: makeBlobId(projectId, refHash),
              projectId,
              hash: refHash,
              kind: 'ref_image',
              compressed: false,
              byteLength: rawBytes,
              payload: dataUrl,
            });
          }
          refSnapshot = {
            refImageHash: refHash,
            fileName: obj.referenceImage.fileName,
            mimeType: obj.referenceImage.mimeType,
            naturalWidth: obj.referenceImage.naturalWidth,
            naturalHeight: obj.referenceImage.naturalHeight,
            opacity: obj.referenceImage.opacity,
            orientation: obj.referenceImage.orientation,
            depthMode: obj.referenceImage.depthMode,
            aspectRatio: obj.referenceImage.aspectRatio,
          };
        }

        snapshotObjects.push({
          id: obj.id,
          name: obj.name,
          objectType: obj.objectType,
          primitiveType: obj.primitiveType,
          collectionId: obj.collectionId,
          visible: obj.visible,
          locked: obj.locked,
          transform: obj.transform,
          ...(meshHash ? { meshHash } : {}),
          material: obj.material,
          ...(obj.materialId ? { materialId: obj.materialId } : {}),
          ...(obj.shading ? { shading: obj.shading } : {}),
          modifiers: obj.modifiers,
          ...(refSnapshot ? { referenceImage: refSnapshot } : {}),
        });
      }

      sceneSnapshot = {
        activeSceneId: input.scene.activeSceneId,
        materials: input.scene.materials,
        objects: snapshotObjects,
      };
    }

    const seq = meta.nextSeq;
    const step: TimelapseStep = {
      id: makeStepId(projectId, seq),
      projectId,
      seq,
      timestamp: now,
      kind: input.kind,
      opType: input.opType,
      label: input.label,
      camera: input.camera,
      ...(sceneSnapshot ? { scene: sceneSnapshot } : {}),
    };

    const stepJsonBytes = measureStringBytes(JSON.stringify(step));
    addedBytes += stepJsonBytes;

    const nextMeta: TimelapseProjectMeta = {
      ...meta,
      stepCount: meta.stepCount + 1,
      modelStepCount:
        meta.modelStepCount + (input.kind === 'camera' ? 0 : 1),
      cameraStepCount:
        meta.cameraStepCount + (input.kind === 'camera' ? 1 : 0),
      nextSeq: seq + 1,
      lastCameraPose: input.camera,
      totalEstimatedBytes: meta.totalEstimatedBytes + addedBytes,
      updatedAt: now,
    };

    // Write blobs, step, and meta together in one IDB transaction when available
    memoryStepsStore.set(step.id, step);
    for (const b of pendingBlobs) {
      memoryBlobsStore.set(b.id, b);
    }
    memoryMetaStore.set(projectId, nextMeta);

    const db = await openProjectsDb();
    if (
      db &&
      db.objectStoreNames.contains(STORE_TIMELAPSE_META) &&
      db.objectStoreNames.contains(STORE_TIMELAPSE_STEPS) &&
      db.objectStoreNames.contains(STORE_TIMELAPSE_BLOBS)
    ) {
      await new Promise<void>((resolve) => {
        try {
          const tx = db.transaction(
            [
              STORE_TIMELAPSE_META,
              STORE_TIMELAPSE_STEPS,
              STORE_TIMELAPSE_BLOBS,
            ],
            'readwrite',
          );
          const blobsStore = tx.objectStore(STORE_TIMELAPSE_BLOBS);
          for (const b of pendingBlobs) {
            blobsStore.put(b);
          }
          tx.objectStore(STORE_TIMELAPSE_STEPS).put(step);
          tx.objectStore(STORE_TIMELAPSE_META).put(nextMeta);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
          tx.onabort = () => resolve();
        } catch {
          resolve();
        }
      });
    }

    return { step, meta: nextMeta };
  });
}

async function fetchBlobsByHashes(
  projectId: string,
  hashes: string[],
  blobCache: Map<string, string>,
): Promise<void> {
  const missing = hashes.filter((h) => !blobCache.has(makeBlobId(projectId, h)));
  if (missing.length === 0) return;

  const db = await openProjectsDb();
  if (!db || !db.objectStoreNames.contains(STORE_TIMELAPSE_BLOBS)) {
    for (const h of missing) {
      const id = makeBlobId(projectId, h);
      const memRec = memoryBlobsStore.get(id);
      if (memRec) {
        const text = await decompressRecordPayload(memRec);
        if (text !== null) blobCache.set(id, text);
      }
    }
    return;
  }

  const records = await new Promise<(TimelapseBlobRecord | undefined)[]>(
    (resolve) => {
      try {
        const tx = db.transaction(STORE_TIMELAPSE_BLOBS, 'readonly');
        const store = tx.objectStore(STORE_TIMELAPSE_BLOBS);
        const results: (TimelapseBlobRecord | undefined)[] = new Array(
          missing.length,
        );
        let done = 0;
        missing.forEach((h, idx) => {
          const id = makeBlobId(projectId, h);
          const req = store.get(id);
          req.onsuccess = () => {
            results[idx] =
              (req.result as TimelapseBlobRecord | undefined) ??
              memoryBlobsStore.get(id);
            done++;
            if (done === missing.length) resolve(results);
          };
          req.onerror = () => {
            results[idx] = memoryBlobsStore.get(id);
            done++;
            if (done === missing.length) resolve(results);
          };
        });
      } catch {
        resolve([]);
      }
    },
  );

  await Promise.all(
    records.map(async (rec) => {
      if (!rec) return;
      const text = await decompressRecordPayload(rec);
      if (text !== null) {
        blobCache.set(rec.id, text);
      }
    }),
  );
}

const EMPTY_SERIALIZED_MESH: SerializedEditableMesh = {
  vertices: [],
  edges: [],
  faces: [],
  nextVertexNum: 1,
  nextEdgeNum: 1,
  nextFaceNum: 1,
};

export function createBlobCache(): Map<string, string> {
  return new Map<string, string>();
}

export function findSceneSnapshotAtStepIndex(
  steps: TimelapseStep[],
  targetIndex: number,
): TimelapseSceneSnapshot | null {
  const clamped = Math.max(0, Math.min(steps.length - 1, targetIndex));
  for (let i = clamped; i >= 0; i--) {
    if (steps[i]?.scene) return steps[i].scene!;
  }
  for (let i = clamped + 1; i < steps.length; i++) {
    if (steps[i]?.scene) return steps[i].scene!;
  }
  return null;
}

export async function hydrateTimelapseFrameAtIndex(
  projectId: string,
  steps: TimelapseStep[],
  index: number,
  blobCache: Map<string, string>,
): Promise<HydratedTimelapseFrame | null> {
  if (steps.length === 0) return null;
  const clamped = Math.max(0, Math.min(steps.length - 1, index));
  const step = steps[clamped];
  const sceneSnap = findSceneSnapshotAtStepIndex(steps, clamped);
  if (!sceneSnap) return null;

  const hashes: string[] = [];
  for (const obj of sceneSnap.objects) {
    if (obj.meshHash) hashes.push(obj.meshHash);
    if (obj.referenceImage?.refImageHash) {
      hashes.push(obj.referenceImage.refImageHash);
    }
  }

  await fetchBlobsByHashes(projectId, hashes, blobCache);

  const objects: HydratedTimelapseObject[] = sceneSnap.objects.map((obj) => {
    let mesh = EMPTY_SERIALIZED_MESH;
    if (obj.meshHash) {
      const rawMesh = blobCache.get(makeBlobId(projectId, obj.meshHash));
      if (rawMesh) {
        try {
          mesh = JSON.parse(rawMesh) as SerializedEditableMesh;
        } catch {
          mesh = EMPTY_SERIALIZED_MESH;
        }
      }
    }

    let referenceImage: HydratedTimelapseObject['referenceImage'];
    if (obj.referenceImage) {
      const dataUrl =
        blobCache.get(
          makeBlobId(projectId, obj.referenceImage.refImageHash),
        ) ?? '';
      referenceImage = {
        ...obj.referenceImage,
        imageDataUrl: dataUrl,
      };
    }

    return {
      id: obj.id,
      name: obj.name,
      objectType: obj.objectType,
      primitiveType: obj.primitiveType,
      collectionId: obj.collectionId,
      visible: obj.visible,
      locked: obj.locked,
      transform: obj.transform,
      mesh,
      meshHash: obj.meshHash,
      material: obj.material,
      materialId: obj.materialId,
      shading: obj.shading,
      modifiers: obj.modifiers,
      referenceImage,
    };
  });

  return {
    step,
    materials: sceneSnap.materials,
    objects,
    camera: step.camera,
  };
}

export async function clearTimelapseForProject(
  projectId: string,
): Promise<void> {
  if (!projectId) return;
  await enqueueForProject(projectId, async () => {
    knownBlobHashesByProject.delete(projectId);
    memoryMetaStore.delete(projectId);
    for (const [k, s] of memoryStepsStore.entries()) {
      if (s.projectId === projectId) memoryStepsStore.delete(k);
    }
    for (const [k, b] of memoryBlobsStore.entries()) {
      if (b.projectId === projectId) memoryBlobsStore.delete(k);
    }
    await deleteTimelapseStoresForProject(projectId);
  });
}

export async function copyTimelapseForProject(
  sourceProjectId: string,
  targetProjectId: string,
): Promise<void> {
  if (
    !sourceProjectId ||
    !targetProjectId ||
    sourceProjectId === targetProjectId
  ) {
    return;
  }
  await enqueueForProject(sourceProjectId, async () => {
    const srcMeta = memoryMetaStore.get(sourceProjectId);
    if (srcMeta) {
      memoryMetaStore.set(targetProjectId, {
        ...srcMeta,
        projectId: targetProjectId,
        updatedAt: Date.now(),
      });
    }
    const sourcePrefix = `${sourceProjectId}::`;
    for (const s of Array.from(memoryStepsStore.values())) {
      if (s.projectId !== sourceProjectId) continue;
      const suffix = s.id.startsWith(sourcePrefix)
        ? s.id.slice(sourcePrefix.length)
        : String(s.seq);
      const nextId = `${targetProjectId}::${suffix}`;
      memoryStepsStore.set(nextId, {
        ...s,
        id: nextId,
        projectId: targetProjectId,
      });
    }
    for (const b of Array.from(memoryBlobsStore.values())) {
      if (b.projectId !== sourceProjectId) continue;
      const suffix = b.id.startsWith(sourcePrefix)
        ? b.id.slice(sourcePrefix.length)
        : `${b.kind}:${b.hash}`;
      const nextId = `${targetProjectId}::${suffix}`;
      memoryBlobsStore.set(nextId, {
        ...b,
        id: nextId,
        projectId: targetProjectId,
      });
    }

    await copyTimelapseStoresForProject(sourceProjectId, targetProjectId);
    knownBlobHashesByProject.delete(targetProjectId);
  });
}

export function formatTimelapseBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
