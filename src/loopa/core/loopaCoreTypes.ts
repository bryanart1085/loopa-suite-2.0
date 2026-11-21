/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ProjectData, SceneData, SceneObjectData, CollectionData, MaterialAsset } from './project/types';
import { SerializedEditableMesh } from './mesh/EditableMesh';

export type CoreAppId = 'modeler' | 'sculpt' | 'uvs' | 'materials';

export interface CoreEventMap {
  'project:loaded': { projectId: string; name: string };
  'project:saved': { projectId: string };
  'scene:changed': { scene: SceneData };
  'object:selected': { objectIds: string[] };
  'mesh:updated': { objectId: string; mesh: SerializedEditableMesh };
  'material:updated': { materialId: string; material: MaterialAsset };
  'transform:changed': { objectId: string };
}

export type CoreEventListener<K extends keyof CoreEventMap> = (payload: CoreEventMap[K]) => void;

export interface ILoopaCoreService {
  getActiveProject(): ProjectData | null;
  setActiveProject(project: ProjectData): void;
  subscribe<K extends keyof CoreEventMap>(event: K, listener: CoreEventListener<K>): () => void;
  emit<K extends keyof CoreEventMap>(event: K, payload: CoreEventMap[K]): void;
}
