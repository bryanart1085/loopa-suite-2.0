import React, { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  MATERIAL_NODE_DEFINITIONS,
  MaterialNodeDefinition,
  evaluateMaterialNodeGraph,
} from "../core/materials/nodeGraph";
import {
  MaterialAsset,
  MaterialNode,
  MaterialNodeGraph,
  MaterialNodeType,
  MaterialNodeValue,
} from "../core/project/types";

interface MaterialNodeEditorProps {
  material: MaterialAsset;
  graph: MaterialNodeGraph;
  onChange: (graph: MaterialNodeGraph) => void;
  onBeginEdit: () => void;
}

const editableNodeTypes: MaterialNodeType[] = [
  "image_texture",
  "texture_coordinate",
  "mapping",
  "normal_map",
  "bump",
  "math",
  "mix_color",
  "color_ramp",
];

function createNodeId(graph: MaterialNodeGraph, type: MaterialNodeType): string {
  let id = `${type}-${Math.random().toString(36).slice(2, 9)}`;
  while (graph.nodes.some((node) => node.id === id)) {
    id = `${type}-${Math.random().toString(36).slice(2, 9)}`;
  }
  return id;
}

function createNode(graph: MaterialNodeGraph, type: MaterialNodeType): MaterialNode {
  const index = graph.nodes.length;
  const values: Record<string, MaterialNodeValue> =
    type === "image_texture"
      ? { dataUrl: "", textureName: "" }
      : type === "mapping"
        ? {
            location: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
          }
        : type === "normal_map"
          ? { strength: 1 }
          : type === "bump"
            ? { strength: 1, distance: 1 }
            : type === "math"
              ? { operation: "add", a: 0, b: 0 }
              : type === "mix_color"
                ? {
                    factor: 0.5,
                    colorA: "#000000",
                    colorB: "#ffffff",
                  }
                : {
                    factor: 0.5,
                    stops: [
                      { position: 0, color: "#000000" },
                      { position: 1, color: "#ffffff" },
                    ],
                  };
  return {
    id: createNodeId(graph, type),
    type,
    position: { x: 120 + (index % 2) * 280, y: 120 + index * 160 },
    values,
  };
}

function getNodeDefinition(type: MaterialNodeType): MaterialNodeDefinition {
  return MATERIAL_NODE_DEFINITIONS.find((item) => item.id === type)!;
}

export const MaterialNodeEditor: React.FC<MaterialNodeEditorProps> = ({
  material,
  graph,
  onChange,
  onBeginEdit,
}) => {
  const evaluation = evaluateMaterialNodeGraph(graph, material);
  const [fileError, setFileError] = useState("");

  const updateNode = (nodeId: string, values: Record<string, MaterialNodeValue>) => {
    onChange({
      ...graph,
      nodes: graph.nodes.map((node) =>
        node.id === nodeId ? { ...node, values: { ...node.values, ...values } } : node,
      ),
    });
  };

  const setInputLink = (node: MaterialNode, socketId: string, source: string) => {
    const remaining = graph.links.filter(
      (link) => link.toNodeId !== node.id || link.toSocket !== socketId,
    );
    if (!source) {
      onChange({ ...graph, links: remaining });
      return;
    }
    const [fromNodeId, fromSocket] = source.split("::");
    onChange({
      ...graph,
      links: [
        ...remaining,
        {
          id: `${fromNodeId}-${node.id}-${socketId}`,
          fromNodeId,
          fromSocket,
          toNodeId: node.id,
          toSocket: socketId,
        },
      ],
    });
  };

  const addNode = (type: MaterialNodeType) => {
    onBeginEdit();
    onChange({ ...graph, nodes: [...graph.nodes, createNode(graph, type)] });
  };

  const removeNode = (nodeId: string) => {
    onBeginEdit();
    onChange({
      ...graph,
      nodes: graph.nodes.filter((node) => node.id !== nodeId),
      links: graph.links.filter((link) => link.fromNodeId !== nodeId && link.toNodeId !== nodeId),
    });
  };

  return (
    <details className="space-y-2 rounded-lg border border-[#272b34] bg-[#121418] p-2.5">
      <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-[#aeb4c0]">
        Grafo de nodos
      </summary>
      <p className="text-[10px] leading-snug text-[#8e95a2]">
        Las entradas conectadas se evalúan y actualizan el material del visor.
      </p>
      {evaluation.ok ? (
        <p role="status" className="text-[10px] text-[#81d88d]">
          Grafo conectado y evaluado.
        </p>
      ) : (
        <p
          role="alert"
          className="rounded border border-[#f87171]/30 bg-[#3b2024] px-2 py-1.5 text-[10px] leading-snug text-[#fecaca]"
        >
          {evaluation.errors.join(" ")}
        </p>
      )}
      {fileError && (
        <p role="alert" className="text-[10px] text-[#fecaca]">
          {fileError}
        </p>
      )}

      <label className="flex items-center gap-2">
        <span className="sr-only">Añadir nodo</span>
        <select
          aria-label="Tipo de nodo para añadir"
          defaultValue=""
          onChange={(event) => {
            const type = event.target.value as MaterialNodeType;
            if (type) addNode(type);
            event.currentTarget.value = "";
          }}
          className="h-8 min-w-0 flex-1 rounded border border-[#2f3440] bg-[#181b22] px-2 text-[10px] text-[#cbd5e1] outline-none focus:border-[#5ecd6e]"
        >
          <option value="">Añadir nodo…</option>
          {editableNodeTypes.map((type) => (
            <option key={type} value={type}>
              {getNodeDefinition(type).label}
            </option>
          ))}
        </select>
        <Plus aria-hidden="true" className="h-4 w-4 text-[#5ecd6e]" />
      </label>

      <div className="space-y-2">
        {graph.nodes.map((node) => {
          const definition = getNodeDefinition(node.type);
          const isBuiltIn = node.type === "material_output" || node.type === "principled_bsdf";
          return (
            <section
              key={node.id}
              aria-label={definition.label}
              className="space-y-2 rounded-md border border-[#323846] bg-[#181b22] p-2"
            >
              <header className="flex items-center justify-between gap-2 border-b border-[#2f3440] pb-1.5">
                <h3 className="text-[10px] font-bold uppercase tracking-wide text-[#d7dbe3]">
                  {definition.label}
                </h3>
                {!isBuiltIn && (
                  <button
                    type="button"
                    aria-label={`Eliminar nodo ${definition.label}`}
                    onClick={() => removeNode(node.id)}
                    className="rounded p-1 text-[#8e95a2] hover:bg-[#292e38] hover:text-[#ff8c8c]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </header>

              {definition.inputs.map((input) => {
                const link = graph.links.find(
                  (item) => item.toNodeId === node.id && item.toSocket === input.id,
                );
                const choices = graph.nodes.flatMap((sourceNode) => {
                  if (sourceNode.id === node.id) return [];
                  const outputs = getNodeDefinition(sourceNode.type).outputs;
                  return outputs
                    .filter((output) => output.type === input.type)
                    .map((output) => ({
                      value: `${sourceNode.id}::${output.id}`,
                      label: `${getNodeDefinition(sourceNode.type).label} · ${output.label}`,
                    }));
                });
                return (
                  <label
                    key={input.id}
                    className="flex min-h-7 items-center justify-between gap-2 text-[10px] text-[#aeb4c0]"
                  >
                    <span>{input.label}</span>
                    <select
                      aria-label={`${definition.label}: ${input.label}`}
                      value={link ? `${link.fromNodeId}::${link.fromSocket}` : ""}
                      onFocus={onBeginEdit}
                      onChange={(event) => setInputLink(node, input.id, event.target.value)}
                      className="h-7 min-w-0 max-w-[65%] rounded border border-[#343a46] bg-[#121418] px-1.5 text-[10px] text-[#cbd5e1] outline-none focus:border-[#5ecd6e]"
                    >
                      <option value="">Sin conexión</option>
                      {choices.map((choice) => (
                        <option key={choice.value} value={choice.value}>
                          {choice.label}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              })}

              {node.type === "principled_bsdf" && (
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ["ior", "IOR", 1, 2.5, 0.01, 1.45],
                      ["specular", "Specular", 0, 1, 0.01, 0.5],
                      ["emissionStrength", "Emission Strength", 0, 20, 0.1, 0],
                    ] as const
                  ).map(([key, label, min, max, step, fallback]) => (
                    <label key={key} className="space-y-1 text-[10px] text-[#aeb4c0]">
                      {label}
                      <input
                        type="number"
                        min={min}
                        max={max}
                        step={step}
                        aria-label={label}
                        value={Number(node.values[key] ?? fallback)}
                        onFocus={onBeginEdit}
                        onChange={(event) =>
                          updateNode(node.id, {
                            [key]: Number(event.target.value),
                          })
                        }
                        className="h-7 w-full rounded border border-[#343a46] bg-[#121418] px-1.5 text-[10px] text-[#cbd5e1]"
                      />
                    </label>
                  ))}
                  <label className="col-span-2 flex items-center justify-between gap-2 text-[10px] text-[#aeb4c0]">
                    Emisión
                    <input
                      type="color"
                      aria-label="Color de emisión"
                      value={String(node.values.emission ?? "#000000")}
                      onPointerDown={onBeginEdit}
                      onChange={(event) => updateNode(node.id, { emission: event.target.value })}
                      className="h-7 w-14 cursor-pointer rounded border border-[#343a46] bg-[#121418] p-0.5"
                    />
                  </label>
                </div>
              )}

              {node.type === "math" && (
                <div className="grid grid-cols-2 gap-2">
                  <label className="col-span-2 space-y-1 text-[10px] text-[#aeb4c0]">
                    Operación
                    <select
                      aria-label="Operación Math"
                      value={String(node.values.operation ?? "add")}
                      onFocus={onBeginEdit}
                      onChange={(event) => updateNode(node.id, { operation: event.target.value })}
                      className="h-7 w-full rounded border border-[#343a46] bg-[#121418] px-1.5 text-[10px] text-[#cbd5e1]"
                    >
                      {[
                        ["add", "Sumar"],
                        ["subtract", "Restar"],
                        ["multiply", "Multiplicar"],
                        ["divide", "Dividir"],
                        ["minimum", "Mínimo"],
                        ["maximum", "Máximo"],
                        ["power", "Potencia"],
                        ["sine", "Seno"],
                        ["cosine", "Coseno"],
                      ].map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {(["a", "b"] as const).map((key) => (
                    <label key={key} className="space-y-1 text-[10px] text-[#aeb4c0]">
                      Valor {key.toUpperCase()}
                      <input
                        type="number"
                        aria-label={`Valor Math ${key.toUpperCase()}`}
                        value={Number(node.values[key] ?? 0)}
                        onFocus={onBeginEdit}
                        onChange={(event) =>
                          updateNode(node.id, {
                            [key]: Number(event.target.value),
                          })
                        }
                        className="h-7 w-full rounded border border-[#343a46] bg-[#121418] px-1.5 text-[10px] text-[#cbd5e1]"
                      />
                    </label>
                  ))}
                </div>
              )}

              {node.type === "image_texture" && (
                <div className="space-y-1.5">
                  <label className="block space-y-1 text-[10px] text-[#aeb4c0]">
                    Imagen base (PNG o JPEG)
                    <input
                      type="file"
                      accept="image/png,image/jpeg"
                      aria-label="Cargar imagen para el nodo Image Texture"
                      onPointerDown={onBeginEdit}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        if (!/^image\/(?:png|jpeg)$/i.test(file.type)) {
                          setFileError("Selecciona una imagen PNG o JPEG.");
                          event.currentTarget.value = "";
                          return;
                        }
                        const reader = new FileReader();
                        reader.onload = () => {
                          if (typeof reader.result !== "string") {
                            setFileError("No se pudo leer la imagen seleccionada.");
                            return;
                          }
                          setFileError("");
                          updateNode(node.id, {
                            dataUrl: reader.result,
                            textureName: file.name,
                          });
                        };
                        reader.onerror = () =>
                          setFileError("No se pudo leer la imagen seleccionada.");
                        reader.readAsDataURL(file);
                      }}
                      className="block w-full text-[10px] text-[#aeb4c0] file:mr-2 file:rounded file:border-0 file:bg-[#303640] file:px-2 file:py-1 file:text-[10px] file:text-[#e5e7eb]"
                    />
                  </label>
                  {((typeof node.values.dataUrl === "string" &&
                    node.values.dataUrl.startsWith("data:image/")) ||
                    (node.values.textureSlot === "baseColor" &&
                      Boolean(material.textureDataUrl))) && (
                    <p className="truncate text-[10px] text-[#81d88d]">
                      {String(node.values.textureName || material.textureName || "Textura cargada")}
                    </p>
                  )}
                </div>
              )}

              {node.type === "mapping" && (
                <div className="space-y-2">
                  {(
                    [
                      ["location", "Desplazamiento", [0, 0, 0]],
                      ["rotation", "Rotación (rad)", [0, 0, 0]],
                      ["scale", "Escala", [1, 1, 1]],
                    ] as const
                  ).map(([key, label, defaults]) => {
                    const vector = Array.isArray(node.values[key]) ? node.values[key] : defaults;
                    return (
                      <fieldset key={key} className="space-y-1">
                        <legend className="text-[10px] text-[#aeb4c0]">{label}</legend>
                        <div className="grid grid-cols-3 gap-1">
                          {(["X", "Y", "Z"] as const).map((axis, index) => (
                            <input
                              key={axis}
                              type="number"
                              step="0.1"
                              aria-label={`${label} ${axis}`}
                              value={Number(vector[index] ?? defaults[index])}
                              onFocus={onBeginEdit}
                              onChange={(event) => {
                                const nextVector = [...defaults].map((_, componentIndex) =>
                                  Number(vector[componentIndex] ?? defaults[componentIndex]),
                                );
                                nextVector[index] = Number(event.target.value);
                                updateNode(node.id, { [key]: nextVector });
                              }}
                              className="h-7 min-w-0 w-full rounded border border-[#343a46] bg-[#121418] px-1 text-[10px] text-[#cbd5e1]"
                            />
                          ))}
                        </div>
                      </fieldset>
                    );
                  })}
                </div>
              )}

              {node.type === "normal_map" && (
                <label className="block space-y-1 text-[10px] text-[#aeb4c0]">
                  Intensidad
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    aria-label="Intensidad Normal Map"
                    value={Number(node.values.strength ?? 1)}
                    onFocus={onBeginEdit}
                    onChange={(event) =>
                      updateNode(node.id, {
                        strength: Number(event.target.value),
                      })
                    }
                    className="h-7 w-full rounded border border-[#343a46] bg-[#121418] px-1.5 text-[10px] text-[#cbd5e1]"
                  />
                </label>
              )}

              {node.type === "bump" && (
                <div className="grid grid-cols-2 gap-2">
                  {(["strength", "distance"] as const).map((key) => (
                    <label key={key} className="space-y-1 text-[10px] text-[#aeb4c0]">
                      {key === "strength" ? "Intensidad" : "Distancia"}
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        aria-label={`Bump ${key === "strength" ? "intensidad" : "distancia"}`}
                        value={Number(node.values[key] ?? 1)}
                        onFocus={onBeginEdit}
                        onChange={(event) =>
                          updateNode(node.id, {
                            [key]: Number(event.target.value),
                          })
                        }
                        className="h-7 w-full rounded border border-[#343a46] bg-[#121418] px-1.5 text-[10px] text-[#cbd5e1]"
                      />
                    </label>
                  ))}
                </div>
              )}

              {node.type === "mix_color" && (
                <div className="grid grid-cols-2 gap-2">
                  <label className="col-span-2 space-y-1 text-[10px] text-[#aeb4c0]">
                    Factor
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.01"
                      aria-label="Factor Mix Color"
                      value={Number(node.values.factor ?? 0.5)}
                      onFocus={onBeginEdit}
                      onChange={(event) =>
                        updateNode(node.id, {
                          factor: Number(event.target.value),
                        })
                      }
                      className="h-7 w-full rounded border border-[#343a46] bg-[#121418] px-1.5 text-[10px] text-[#cbd5e1]"
                    />
                  </label>
                  {(["colorA", "colorB"] as const).map((key) => (
                    <label key={key} className="space-y-1 text-[10px] text-[#aeb4c0]">
                      Color {key === "colorA" ? "A" : "B"}
                      <input
                        type="color"
                        aria-label={`Color ${key === "colorA" ? "A" : "B"} Mix Color`}
                        value={String(node.values[key] ?? "#ffffff")}
                        onPointerDown={onBeginEdit}
                        onChange={(event) => updateNode(node.id, { [key]: event.target.value })}
                        className="h-7 w-full cursor-pointer rounded border border-[#343a46] bg-[#121418] p-0.5"
                      />
                    </label>
                  ))}
                </div>
              )}

              {node.type === "color_ramp" && (
                <div className="grid grid-cols-2 gap-2">
                  <label className="col-span-2 space-y-1 text-[10px] text-[#aeb4c0]">
                    Factor
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.01"
                      aria-label="Factor Color Ramp"
                      value={Number(node.values.factor ?? 0.5)}
                      onFocus={onBeginEdit}
                      onChange={(event) =>
                        updateNode(node.id, {
                          factor: Number(event.target.value),
                        })
                      }
                      className="h-7 w-full rounded border border-[#343a46] bg-[#121418] px-1.5 text-[10px] text-[#cbd5e1]"
                    />
                  </label>
                  {([0, 1] as const).map((index) => {
                    const stops = Array.isArray(node.values.stops) ? node.values.stops : [];
                    const stop = stops[index];
                    const color =
                      stop && typeof stop === "object" && !Array.isArray(stop)
                        ? String(stop.color ?? "#ffffff")
                        : "#ffffff";
                    return (
                      <label key={index} className="space-y-1 text-[10px] text-[#aeb4c0]">
                        Color {index === 0 ? "inicial" : "final"}
                        <input
                          type="color"
                          aria-label={`Color ${index === 0 ? "inicial" : "final"} Color Ramp`}
                          value={color}
                          onPointerDown={onBeginEdit}
                          onChange={(event) => {
                            const nextStops = [0, 1].map((stopIndex) => {
                              const current = stops[stopIndex];
                              const currentColor =
                                current && typeof current === "object" && !Array.isArray(current)
                                  ? String(current.color ?? "#ffffff")
                                  : "#ffffff";
                              return {
                                position: stopIndex,
                                color: stopIndex === index ? event.target.value : currentColor,
                              };
                            });
                            updateNode(node.id, { stops: nextStops });
                          }}
                          className="h-7 w-full cursor-pointer rounded border border-[#343a46] bg-[#121418] p-0.5"
                        />
                      </label>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </details>
  );
};
