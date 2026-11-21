/**
 * LOOPA Core — shared ecosystem types.
 * Pure TypeScript: no React, no three.js.
 */

/** The four specialised LOOPA apps that can open a project. */
export type LoopaAppId = 'modeler' | 'sculpt' | 'uvs' | 'materials';

/**
 * Areas of project data. Each app may only modify the areas it owns.
 * - structure: which objects/scenes/collections exist, their names and hierarchy
 * - topology: vertices/edges/faces connectivity of meshes
 * - shape: vertex positions and normals (surface form)
 * - transforms: object position/rotation/scale
 * - modifiers: non-destructive modifier stacks
 * - uvs: UV coordinates and seams
 * - materials: material library and material assignments
 */
export type ProjectDomain =
  | 'structure'
  | 'topology'
  | 'shape'
  | 'transforms'
  | 'modifiers'
  | 'uvs'
  | 'materials';

export interface EcosystemSessionRecord {
  appId: LoopaAppId;
  at: number;
  domains: ProjectDomain[];
}

/** Ecosystem metadata stored inside every LOOPA project. */
export interface ProjectEcosystemMeta {
  formatVersion: 1;
  /** Incremented every time an app session changes project data. */
  revision: number;
  lastAppId?: LoopaAppId;
  lastAppAt?: number;
  /** Most recent app sessions that changed data (newest last). */
  history: EcosystemSessionRecord[];
  /** objectId → topology signature at the moment its UVs were last worked on in LOOPA UVs. */
  uvBasis: Record<string, string>;
}
