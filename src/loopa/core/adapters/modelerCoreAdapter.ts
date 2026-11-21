/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { loopaCore } from '../coreSession';
import { ProjectData } from '../project/types';

/**
 * ModelerCoreAdapter bridges the existing LOOPA Modeler store and ViewportEngine
 * to LOOPA CORE, allowing Modeler to act as the first integrated app in the ecosystem.
 */
export class ModelerCoreAdapter {
  private static initialized = false;

  public static initialize(): void {
    if (ModelerCoreAdapter.initialized) return;
    ModelerCoreAdapter.initialized = true;

    // Listen to core project events if needed
    loopaCore.subscribe('project:loaded', (payload) => {
      console.log(`[LOOPA CORE] Project loaded in ecosystem: ${payload.name} (${payload.projectId})`);
    });
  }

  public static syncProject(projectData: ProjectData): void {
    if (!projectData) return;
    loopaCore.setActiveProject(projectData);
  }
}
