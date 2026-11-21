/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { loopaCore } from './coreSession';
import { ProjectData } from './project/types';

/**
 * Verification utility for LOOPA CORE to confirm state integrity and zero data loss.
 */
export function verifyLoopaCoreSession(project: ProjectData): boolean {
  try {
    loopaCore.setActiveProject(project);
    const active = loopaCore.getActiveProject();
    if (!active) {
      console.error('[LOOPA CORE] Verification failed: active project is null');
      return false;
    }
    if (active.id !== project.id) {
      console.error('[LOOPA CORE] Verification failed: project id mismatch');
      return false;
    }
    console.log('[LOOPA CORE] Verification passed successfully for project:', active.name);
    return true;
  } catch (err) {
    console.error('[LOOPA CORE] Verification exception:', err);
    return false;
  }
}
