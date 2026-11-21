/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ProjectData, SceneData, SceneObjectData, MaterialAsset } from './project/types';
import { SerializedEditableMesh } from './mesh/EditableMesh';
import { CoreEventMap, CoreEventListener, ILoopaCoreService } from './loopaCoreTypes';

/**
 * LoopaCoreSession manages the centralized project state, scenes, objects,
 * geometry, materials, and cross-application communication events for the LOOPA ecosystem.
 */
class LoopaCoreSessionService implements ILoopaCoreService {
  private activeProject: ProjectData | null = null;
  private listeners: Map<keyof CoreEventMap, Set<Function>> = new Map();

  constructor() {
    const events: (keyof CoreEventMap)[] = [
      'project:loaded',
      'project:saved',
      'scene:changed',
      'object:selected',
      'mesh:updated',
      'material:updated',
      'transform:changed',
    ];
    events.forEach((ev) => this.listeners.set(ev, new Set()));
  }

  public getActiveProject(): ProjectData | null {
    return this.activeProject;
  }

  public setActiveProject(project: ProjectData): void {
    this.activeProject = project;
    this.emit('project:loaded', {
      projectId: project.id,
      name: project.name,
    });
  }

  public subscribe<K extends keyof CoreEventMap>(
    event: K,
    listener: CoreEventListener<K>
  ): () => void {
    const set = this.listeners.get(event);
    if (set) {
      set.add(listener);
    }
    return () => {
      const s = this.listeners.get(event);
      if (s) {
        s.delete(listener);
      }
    };
  }

  public emit<K extends keyof CoreEventMap>(event: K, payload: CoreEventMap[K]): void {
    const set = this.listeners.get(event);
    if (set) {
      set.forEach((listener) => {
        try {
          listener(payload);
        } catch (err) {
          console.error(`Error in LOOPA CORE event listener for ${event}:`, err);
        }
      });
    }
  }

  public getObjectById(objectId: string): SceneObjectData | undefined {
    if (!this.activeProject) return undefined;
    for (const scene of this.activeProject.scenes) {
      const found = scene.objects.find((o) => o.id === objectId);
      if (found) return found;
    }
    return undefined;
  }

  public getMaterialById(materialId: string): MaterialAsset | undefined {
    if (!this.activeProject) return undefined;
    return this.activeProject.materials?.find((m) => m.id === materialId);
  }

  public updateObjectMesh(objectId: string, mesh: SerializedEditableMesh): boolean {
    const obj = this.getObjectById(objectId);
    if (!obj || obj.objectType !== 'mesh') return false;
    obj.mesh = mesh;
    this.emit('mesh:updated', { objectId, mesh });
    return true;
  }
}

export const loopaCore = new LoopaCoreSessionService();
