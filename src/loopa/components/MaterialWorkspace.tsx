/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Palette } from 'lucide-react';
import { EditSelectionMode } from '../core/mesh/operations';
import {
  MaterialAsset,
  ObjectShadingMode,
  SceneObjectData,
  ViewportDisplayMode,
  WorkMode,
} from '../core/project/types';
import { MaterialPanel } from './MaterialPanel';

interface MaterialWorkspaceProps {
  objects: SceneObjectData[];
  selectedObject: SceneObjectData | null;
  selectedObjectId: string | null;
  selectedObjectIds: Set<string>;
  materials: MaterialAsset[];
  displayMode: ViewportDisplayMode;
  workMode?: WorkMode;
  editSelectionMode?: EditSelectionMode;
  selectedComponentIds?: Set<string>;
  reserveTopLeftCorner?: boolean;
  onSelectObject: (id: string) => void;
  onSetObjectShading: (objectId: string, shading: ObjectShadingMode) => void;
  onSetDisplayMode: (mode: ViewportDisplayMode) => void;
  onCreateMaterial: (
    initial?: Partial<Omit<MaterialAsset, 'id'>>,
    assignToSelected?: boolean,
  ) => MaterialAsset;
  onRenameMaterial: (materialId: string, name: string) => void;
  onPushMaterialHistory: () => void;
  onUpdateMaterial: (
    materialId: string,
    patch: Partial<Omit<MaterialAsset, 'id'>>,
    recordHistory?: boolean,
  ) => void;
  onDuplicateMaterial: (
    materialId: string,
    assignToSelected?: boolean,
  ) => MaterialAsset | null;
  onDeleteMaterial: (materialId: string) => { ok: boolean; error?: string };
  onAssignMaterialToObjects: (objectIds: string[], materialId: string) => void;
  getMaterialUsageSummary?: (materialId: string) => {
    objectCount: number;
    faceCount: number;
  };
  onAssignMaterialToFaces?: (
    objectId: string,
    faceIds: Set<string>,
    materialId: string,
  ) => void;
  onUnassignMaterialFromFaces?: (objectId: string, faceIds: Set<string>) => void;
  onSelectFacesByMaterial?: (objectId: string, materialId: string) => void;
  onReturnToLayout: () => void;
}

export const MaterialWorkspace: React.FC<MaterialWorkspaceProps> = ({
  objects,
  selectedObject,
  selectedObjectId,
  selectedObjectIds,
  materials,
  displayMode,
  workMode = 'object',
  editSelectionMode = 'vertex',
  selectedComponentIds,
  reserveTopLeftCorner = false,
  onSelectObject,
  onSetObjectShading,
  onSetDisplayMode,
  onCreateMaterial,
  onRenameMaterial,
  onPushMaterialHistory,
  onUpdateMaterial,
  onDuplicateMaterial,
  onDeleteMaterial,
  onAssignMaterialToObjects,
  getMaterialUsageSummary,
  onAssignMaterialToFaces,
  onUnassignMaterialFromFaces,
  onSelectFacesByMaterial,
  onReturnToLayout,
}) => {
  return (
    <aside
      data-testid="material-workspace-panel"
      className="w-80 shrink-0 h-full bg-[#16181d] border-r border-[#2b2e36] flex flex-col overflow-hidden z-20"
    >
      {reserveTopLeftCorner && (
        <div
          aria-hidden="true"
          className="h-12 shrink-0 border-b border-[#272b34] bg-[#16181d]"
        />
      )}

      {/* Workspace Header */}
      <div className="px-3 py-2.5 border-b border-[#272b34] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Palette className="w-4 h-4 text-[#a78bfa] shrink-0" />
          <span className="text-xs font-bold text-[#f3f4f6] truncate">
            Editor de materiales
          </span>
        </div>
        <button
          type="button"
          onClick={onReturnToLayout}
          className="h-7 px-2 rounded bg-[#22252d] hover:bg-[#2c313b] border border-[#323640] text-[11px] font-medium text-[#cbd5e1]"
        >
          Layout
        </button>
      </div>

      {/* Existing Real PBR MaterialPanel */}
      <div className="flex-1 min-h-0 flex flex-col p-3">
        <MaterialPanel
          materials={materials}
          selectedObject={selectedObject}
          selectedObjectIds={selectedObjectIds}
          objects={objects}
          displayMode={displayMode}
          workMode={workMode}
          editSelectionMode={editSelectionMode}
          selectedComponentIds={selectedComponentIds}
          getMaterialUsageSummary={getMaterialUsageSummary}
          onCreateMaterial={onCreateMaterial}
          onRenameMaterial={onRenameMaterial}
          onPushMaterialHistory={onPushMaterialHistory}
          onUpdateMaterial={onUpdateMaterial}
          onDuplicateMaterial={onDuplicateMaterial}
          onDeleteMaterial={onDeleteMaterial}
          onAssignMaterialToObjects={onAssignMaterialToObjects}
          onAssignMaterialToFaces={onAssignMaterialToFaces}
          onUnassignMaterialFromFaces={onUnassignMaterialFromFaces}
          onSelectFacesByMaterial={onSelectFacesByMaterial}
        />
      </div>
    </aside>
  );
};
