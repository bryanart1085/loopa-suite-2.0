import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Palette,
  Plus,
} from 'lucide-react';
import { EditSelectionMode } from '../core/mesh/operations';
import {
  clampMaterialFactor,
  getObjectMaterialSlotsSummary,
  normalizeHexColor,
} from '../core/project/hierarchy';
import {
  MaterialAsset,
  SceneObjectData,
  ViewportDisplayMode,
  WorkMode,
} from '../core/project/types';
import { NumericFieldInput } from './NumericFieldInput';

interface MaterialPanelProps {
  materials: MaterialAsset[];
  selectedObject: SceneObjectData | null;
  selectedObjectIds?: Set<string>;
  objects: SceneObjectData[];
  displayMode: ViewportDisplayMode;
  workMode?: WorkMode;
  editSelectionMode?: EditSelectionMode;
  selectedComponentIds?: Set<string>;
  getMaterialUsageSummary?: (materialId: string) => {
    objectCount: number;
    faceCount: number;
  };
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
  onAssignMaterialToFaces?: (
    objectId: string,
    faceIds: Set<string>,
    materialId: string,
  ) => void;
  onUnassignMaterialFromFaces?: (objectId: string, faceIds: Set<string>) => void;
  onSelectFacesByMaterial?: (objectId: string, materialId: string) => void;
}

export const MaterialPanel: React.FC<MaterialPanelProps> = ({
  materials,
  selectedObject,
  selectedObjectIds,
  objects,
  displayMode,
  workMode = 'object',
  editSelectionMode = 'vertex',
  selectedComponentIds,
  getMaterialUsageSummary,
  onCreateMaterial,
  onRenameMaterial,
  onPushMaterialHistory,
  onUpdateMaterial,
  onDuplicateMaterial,
  onDeleteMaterial,
  onAssignMaterialToObjects,
  onAssignMaterialToFaces,
  onUnassignMaterialFromFaces,
  onSelectFacesByMaterial,
}) => {
  const targetMeshIds = useMemo(() => {
    const meshIdSet = new Set(
      objects.filter((object) => object.objectType === 'mesh').map((object) => object.id),
    );
    const ids = Array.from(selectedObjectIds ?? []).filter((id) => meshIdSet.has(id));
    if (ids.length === 0 && selectedObject && meshIdSet.has(selectedObject.id)) {
      ids.push(selectedObject.id);
    }
    return ids;
  }, [objects, selectedObject, selectedObjectIds]);

  const primaryMesh = useMemo(() => {
    if (selectedObject?.objectType === 'mesh') return selectedObject;
    return targetMeshIds.length > 0
      ? objects.find((object) => object.id === targetMeshIds[0]) ?? null
      : null;
  }, [objects, selectedObject, targetMeshIds]);

  const [editingMaterialId, setEditingMaterialId] = useState(
    () => primaryMesh?.materialId ?? materials[0]?.id ?? '',
  );

  const primaryMaterialId = materials.find(
    (material) => material.id === primaryMesh?.materialId,
  )?.id;

  useEffect(() => {
    if (primaryMaterialId) setEditingMaterialId(primaryMaterialId);
  }, [primaryMesh?.id, primaryMaterialId]);

  useEffect(() => {
    if (!materials.some((material) => material.id === editingMaterialId)) {
      setEditingMaterialId(materials[0]?.id ?? '');
    }
  }, [editingMaterialId, materials]);

  const activeMaterial =
    materials.find((material) => material.id === editingMaterialId) ?? null;
  const [nameDraft, setNameDraft] = useState(activeMaterial?.name ?? '');

  useEffect(() => {
    setNameDraft(activeMaterial?.name ?? '');
  }, [activeMaterial?.id, activeMaterial?.name]);

  const usageCounts = useMemo(() => {
    const counts = new Map<string, { objectCount: number; faceCount: number }>();
    for (const material of materials) {
      const usage = getMaterialUsageSummary?.(material.id);
      counts.set(material.id, {
        objectCount: usage?.objectCount ?? 0,
        faceCount: usage?.faceCount ?? 0,
      });
    }
    return counts;
  }, [getMaterialUsageSummary, materials]);

  const objectSlotsSummary = useMemo(
    () => (primaryMesh ? getObjectMaterialSlotsSummary(primaryMesh, materials) : []),
    [materials, primaryMesh],
  );
  const selectedFaceCount =
    workMode === 'edit' && editSelectionMode === 'face'
      ? selectedComponentIds?.size ?? 0
      : 0;
  const canAssignToFaces =
    Boolean(primaryMesh) &&
    !primaryMesh?.locked &&
    workMode === 'edit' &&
    editSelectionMode === 'face' &&
    selectedFaceCount > 0 &&
    Boolean(activeMaterial) &&
    Boolean(onAssignMaterialToFaces);
  const canAssignToObject =
    Boolean(primaryMesh) &&
    !primaryMesh?.locked &&
    workMode === 'object' &&
    targetMeshIds.length > 0 &&
    Boolean(activeMaterial);
  const previewStyle = activeMaterial
    ? {
        background: `radial-gradient(circle at 32% 28%, rgba(255,255,255,${Math.max(
          0.08,
          (1 - activeMaterial.roughness) * (0.42 + activeMaterial.metallic * 0.4),
        ).toFixed(2)}) 0%, ${activeMaterial.baseColor} 36%, #0c0e12 100%)`,
      }
    : undefined;

  const createMaterial = () => {
    let number = materials.length + 1;
    let name = `Material ${String(number).padStart(2, '0')}`;
    while (materials.some((material) => material.name === name)) {
      number++;
      name = `Material ${String(number).padStart(2, '0')}`;
    }

    const created = onCreateMaterial(
      {
        name,
        baseColor: '#5ecd6e',
        metallic: 0.08,
        roughness: 0.5,
        opacity: 1,
      },
      false,
    );
    setEditingMaterialId(created.id);
  };

  const commitName = () => {
    if (!activeMaterial) return;
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setNameDraft(activeMaterial.name);
    } else if (trimmed !== activeMaterial.name) {
      onRenameMaterial(activeMaterial.id, trimmed);
    }
  };

  const assignmentMessage = !activeMaterial
    ? 'Crea o selecciona un material antes de asignarlo.'
    : !primaryMesh
      ? 'Selecciona un objeto de malla para asignarle el material.'
      : primaryMesh.locked
        ? 'Desbloquea el objeto para poder modificar sus materiales.'
        : workMode === 'edit' && editSelectionMode !== 'face'
          ? 'Cambia al modo de selección de Caras para asignar el material.'
          : workMode === 'edit' && selectedFaceCount === 0
            ? 'Selecciona primero una o más caras del objeto.'
            : workMode === 'edit'
              ? `${selectedFaceCount} cara(s) seleccionada(s) para «${activeMaterial.name}».`
                  : workMode === 'object'
                    ? 'El material seleccionado se aplicará a todo el objeto.'
                    : 'Cambia a Modo Objeto o Modo Edición para asignar el material.';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto cad-scroll space-y-3">
        {displayMode !== 'material' && (
          <p
            role="status"
            className="rounded-md border border-[#5ecd6e]/25 bg-[#16261a] px-2.5 py-2 text-[10px] leading-snug text-[#cbd5e1]"
          >
            Activa la vista de material para ver color, metalicidad y rugosidad en el visor.
          </p>
        )}

        <button
          type="button"
          data-testid="open-create-material-btn"
          onClick={createMaterial}
          className="flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-[#5ecd6e]/60 bg-[#49b459] px-3 py-2 text-xs font-bold uppercase tracking-wide text-[#111215] transition-colors hover:bg-[#5ecd6e]"
        >
          <Plus className="h-4 w-4" />
          <span>+ NUEVO</span>
        </button>

        <section aria-labelledby="materials-list-heading" className="space-y-1.5">
          <div className="flex items-center justify-between">
            <h2
              id="materials-list-heading"
              className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#aeb4c0]"
            >
              <Palette className="h-3.5 w-3.5 text-[#5ecd6e]" />
              Materiales
            </h2>
            <span className="text-[10px] font-mono-tabular text-[#7c8391]">
              {materials.length}
            </span>
          </div>

          {materials.length === 0 ? (
            <p className="rounded-md border border-dashed border-[#323846] px-2.5 py-3 text-center text-[11px] text-[#8e95a2]">
              Crea un material para comenzar.
            </p>
          ) : (
            <div className="max-h-48 space-y-1 overflow-y-auto cad-scroll pr-0.5">
              {materials.map((material) => {
                const isSelected = activeMaterial?.id === material.id;
                const usage = usageCounts.get(material.id) ?? {
                  objectCount: 0,
                  faceCount: 0,
                };
                const slot = objectSlotsSummary.find(
                  (entry) => entry.materialId === material.id,
                );

                return (
                  <div
                    key={material.id}
                    className={`flex min-h-10 items-center gap-1.5 rounded-md border px-1.5 transition-colors ${
                      isSelected
                        ? 'border-[#5ecd6e]/65 bg-[#252a35]'
                        : 'border-[#262a33] bg-[#121418] hover:bg-[#1a1d24]'
                    }`}
                  >
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      data-testid={`select-material-${material.id}`}
                      onClick={() => setEditingMaterialId(material.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 px-1 py-1.5 text-left"
                    >
                      <span
                        className={`h-4 w-4 shrink-0 rounded-full border border-white/25 ${
                          isSelected ? 'ring-2 ring-[#5ecd6e]/60 ring-offset-1 ring-offset-[#252a35]' : ''
                        }`}
                        style={{
                          backgroundColor: material.baseColor,
                          opacity: material.opacity ?? 1,
                        }}
                      />
                      <span className="truncate text-xs font-medium text-[#f3f4f6]">
                        {material.name}
                      </span>
                      {isSelected && (
                        <Check
                          aria-label="Seleccionado"
                          className="h-3.5 w-3.5 shrink-0 text-[#5ecd6e]"
                        />
                      )}
                    </button>

                    <span
                      className="min-w-7 text-center text-[10px] font-mono-tabular text-[#8e95a2]"
                      title={`${usage.objectCount} ${
                        usage.objectCount === 1 ? 'objeto' : 'objetos'
                      } · ${usage.faceCount} ${
                        usage.faceCount === 1 ? 'cara' : 'caras'
                      }`}
                    >
                      {slot?.faceCount ?? usage.faceCount}c
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section
          aria-labelledby="material-properties-heading"
          className="space-y-3 rounded-lg border border-[#272b34] bg-[#121418] p-2.5"
        >
          <h2
            id="material-properties-heading"
            className="text-[11px] font-semibold uppercase tracking-wider text-[#aeb4c0]"
          >
            Propiedades
          </h2>

          {activeMaterial ? (
            <>
              <div className="flex items-center gap-2.5">
                <div
                  className="h-9 w-9 shrink-0 rounded-full border border-white/20 shadow-inner"
                  style={previewStyle}
                  aria-hidden="true"
                />
                <label className="min-w-0 flex-1 space-y-1">
                  <span className="block text-[10px] font-semibold uppercase tracking-wider text-[#8e95a2]">
                    Nombre
                  </span>
                  <input
                    type="text"
                    aria-label="Nombre del material"
                    value={nameDraft}
                    onChange={(event) => setNameDraft(event.target.value)}
                    onBlur={commitName}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        commitName();
                        event.currentTarget.blur();
                      } else if (event.key === 'Escape') {
                        setNameDraft(activeMaterial.name);
                        event.currentTarget.blur();
                      }
                    }}
                    className="h-9 w-full rounded border border-[#2f3440] bg-[#181b22] px-2 text-xs font-medium text-[#f3f4f6] outline-none focus:border-[#5ecd6e]"
                  />
                </label>
              </div>

              <label className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-[#2f3440] bg-[#181b22] px-2.5 py-1.5">
                <span className="text-[11px] font-medium text-[#cbd5e1]">
                  Color base
                </span>
                <input
                  type="color"
                  aria-label="Color base"
                  data-testid="active-material-color-input"
                  value={normalizeHexColor(activeMaterial.baseColor)}
                  onPointerDown={onPushMaterialHistory}
                  onChange={(event) =>
                    onUpdateMaterial(
                      activeMaterial.id,
                      { baseColor: normalizeHexColor(event.target.value) },
                      false,
                    )
                  }
                  className="h-9 w-14 cursor-pointer rounded border border-[#3b4250] bg-[#111317] p-0.5"
                />
              </label>

              {(
                [
                  {
                    key: 'roughness',
                    label: 'Rugosidad',
                    value: activeMaterial.roughness,
                  },
                  {
                    key: 'metallic',
                    label: 'Metalicidad',
                    value: activeMaterial.metallic,
                  },
                  {
                    key: 'opacity',
                    label: 'Opacidad',
                    value: activeMaterial.opacity ?? 1,
                  },
                ] as const
              ).map((property) => {
                const value = property.value;

                return (
                  <div key={property.key} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <label
                        htmlFor={`material-${property.key}-${activeMaterial.id}`}
                        className="text-[11px] font-medium text-[#cbd5e1]"
                      >
                        {property.label}
                      </label>
                      <NumericFieldInput
                        ariaLabel={`Valor de ${property.label}`}
                        value={value}
                        decimals={2}
                        onCommit={(nextValue) =>
                          onUpdateMaterial(
                            activeMaterial.id,
                            {
                              [property.key]:
                                property.key === 'opacity'
                                  ? Math.max(0.02, Math.min(1, nextValue))
                                  : clampMaterialFactor(nextValue, value),
                            },
                            true,
                          )
                        }
                        className="h-8 w-16 rounded border border-[#2f3440] bg-[#181b22] px-1.5 text-right text-xs font-mono-tabular text-[#f3f4f6] outline-none focus:border-[#5ecd6e]"
                      />
                    </div>
                    <input
                      id={`material-${property.key}-${activeMaterial.id}`}
                      type="range"
                      aria-label={`Deslizador de ${property.label}`}
                      data-testid={
                        property.key === 'opacity'
                          ? 'active-material-opacity-slider'
                          : undefined
                      }
                      min={property.key === 'opacity' ? 0.02 : 0}
                      max={1}
                      step={0.01}
                      value={value}
                      onPointerDown={onPushMaterialHistory}
                      onChange={(event) =>
                        onUpdateMaterial(
                          activeMaterial.id,
                          { [property.key]: parseFloat(event.target.value) },
                          false,
                        )
                      }
                      className="h-3 w-full cursor-pointer accent-[#5ecd6e]"
                    />
                  </div>
                );
              })}
            </>
          ) : (
            <p className="py-2 text-[11px] text-[#8e95a2]">
              Crea o selecciona un material para editar sus propiedades.
            </p>
          )}
        </section>
      </div>

      <div className="shrink-0 space-y-2 border-t border-[#272b34] bg-[#16181d] pt-2.5">
        <button
          type="button"
          data-testid="assign-material-faces-btn"
          disabled={!canAssignToFaces && !canAssignToObject}
          onClick={() => {
            if (!activeMaterial) return;
            if (
              workMode === 'edit' &&
              primaryMesh &&
              selectedComponentIds &&
              onAssignMaterialToFaces
            ) {
              onAssignMaterialToFaces(
                primaryMesh.id,
                selectedComponentIds,
                activeMaterial.id,
              );
            } else if (canAssignToObject) {
              onAssignMaterialToObjects(targetMeshIds, activeMaterial.id);
            }
          }}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-[#49b459] px-2.5 py-2 text-[11px] font-bold uppercase leading-tight text-[#111215] transition-colors hover:bg-[#5ecd6e] disabled:bg-[#20242c] disabled:text-[#8e95a2]"
        >
          <Check className="h-4 w-4 shrink-0" />
          <span>
            {workMode === 'edit' && editSelectionMode === 'face'
              ? 'Asignar a caras seleccionadas'
              : 'Asignar al objeto'}
          </span>
        </button>

        <p role="status" className="text-center text-[10px] leading-snug text-[#8e95a2]">
          {assignmentMessage}
        </p>
      </div>
    </div>
  );
};
