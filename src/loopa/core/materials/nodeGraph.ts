import type {
  MaterialAsset,
  MaterialNode,
  MaterialNodeGraph,
  MaterialNodeType,
  MaterialNodeValue,
} from "../project/types";

export type MaterialSocketType = "color" | "scalar" | "vector" | "shader";

export interface MaterialNodeSocketDefinition {
  id: string;
  label: string;
  type: MaterialSocketType;
}

export interface MaterialNodeDefinition {
  id: MaterialNodeType;
  label: string;
  inputs: MaterialNodeSocketDefinition[];
  outputs: MaterialNodeSocketDefinition[];
}

const socket = (
  id: string,
  label: string,
  type: MaterialSocketType,
): MaterialNodeSocketDefinition => ({ id, label, type });

export const MATERIAL_NODE_DEFINITIONS: MaterialNodeDefinition[] = [
  {
    id: "material_output",
    label: "Material Output",
    inputs: [socket("surface", "Surface", "shader")],
    outputs: [],
  },
  {
    id: "principled_bsdf",
    label: "Principled BSDF",
    inputs: [
      socket("baseColor", "Base Color", "color"),
      socket("metallic", "Metallic", "scalar"),
      socket("roughness", "Roughness", "scalar"),
      socket("ior", "IOR", "scalar"),
      socket("specular", "Specular", "scalar"),
      socket("alpha", "Alpha", "scalar"),
      socket("emission", "Emission", "color"),
      socket("emissionStrength", "Emission Strength", "scalar"),
      socket("normal", "Normal", "vector"),
    ],
    outputs: [socket("bsdf", "BSDF", "shader")],
  },
  {
    id: "image_texture",
    label: "Image Texture",
    inputs: [socket("vector", "Vector", "vector")],
    outputs: [socket("color", "Color", "color"), socket("alpha", "Alpha", "scalar")],
  },
  {
    id: "texture_coordinate",
    label: "Texture Coordinate",
    inputs: [],
    outputs: [socket("uv", "UV", "vector"), socket("generated", "Generated", "vector")],
  },
  {
    id: "mapping",
    label: "Mapping",
    inputs: [socket("vector", "Vector", "vector")],
    outputs: [socket("vector", "Vector", "vector")],
  },
  {
    id: "normal_map",
    label: "Normal Map",
    inputs: [socket("color", "Color", "color"), socket("strength", "Strength", "scalar")],
    outputs: [socket("normal", "Normal", "vector")],
  },
  {
    id: "bump",
    label: "Bump",
    inputs: [
      socket("height", "Height", "scalar"),
      socket("normal", "Normal", "vector"),
      socket("strength", "Strength", "scalar"),
      socket("distance", "Distance", "scalar"),
    ],
    outputs: [socket("normal", "Normal", "vector")],
  },
  {
    id: "color_ramp",
    label: "Color Ramp",
    inputs: [socket("factor", "Factor", "scalar")],
    outputs: [socket("color", "Color", "color"), socket("alpha", "Alpha", "scalar")],
  },
  {
    id: "math",
    label: "Math",
    inputs: [socket("a", "A", "scalar"), socket("b", "B", "scalar")],
    outputs: [socket("value", "Value", "scalar")],
  },
  {
    id: "mix_color",
    label: "Mix Color",
    inputs: [
      socket("factor", "Factor", "scalar"),
      socket("colorA", "A", "color"),
      socket("colorB", "B", "color"),
    ],
    outputs: [socket("color", "Color", "color")],
  },
];

export interface EvaluatedMaterialSurface {
  baseColor: string;
  baseColorTextureUrl?: string;
  textureName?: string;
  textureTransform?: {
    location: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
  };
  normalTextureUrl?: string;
  normalTextureTransform?: EvaluatedMaterialSurface["textureTransform"];
  normalMapStrength?: number;
  bumpTextureUrl?: string;
  bumpTextureTransform?: EvaluatedMaterialSurface["textureTransform"];
  bumpScale?: number;
  metallic: number;
  roughness: number;
  opacity: number;
  ior: number;
  specular: number;
  emissionColor: string;
  emissionIntensity: number;
}

export interface MaterialGraphEvaluation {
  ok: boolean;
  surface: EvaluatedMaterialSurface;
  errors: string[];
}

const MATERIAL_NODE_TYPE_SET = new Set<MaterialNodeType>(
  MATERIAL_NODE_DEFINITIONS.map((definition) => definition.id),
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function copyNodeValue(value: unknown): MaterialNodeValue | undefined {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    const items = value.map(copyNodeValue);
    if (items.some((item) => item === undefined)) return undefined;
    return items as MaterialNodeValue[];
  }
  if (isRecord(value)) {
    const entries = Object.entries(value).map(([key, item]) => [key, copyNodeValue(item)]);
    if (entries.some(([, item]) => item === undefined)) return undefined;
    return Object.fromEntries(entries) as { [key: string]: MaterialNodeValue };
  }
  return undefined;
}

export function createDefaultMaterialNodeGraph(
  material: Pick<
    MaterialAsset,
    | "id"
    | "baseColor"
    | "metallic"
    | "roughness"
    | "opacity"
    | "emissiveColor"
    | "emissiveIntensity"
    | "textureName"
    | "textureDataUrl"
  >,
): MaterialNodeGraph {
  const principledId = `${material.id}:principled`;
  const outputId = `${material.id}:output`;
  const nodes: MaterialNode[] = [
    {
      id: principledId,
      type: "principled_bsdf",
      position: { x: 120, y: 120 },
      values: {
        baseColor: material.baseColor,
        metallic: material.metallic,
        roughness: material.roughness,
        ior: 1.45,
        specular: 0.5,
        alpha: material.opacity ?? 1,
        emission: material.emissiveColor ?? "#000000",
        emissionStrength: material.emissiveIntensity ?? 0,
      },
    },
    {
      id: outputId,
      type: "material_output",
      position: { x: 520, y: 120 },
      values: {},
    },
  ];
  const links = [
    {
      id: `${material.id}:surface`,
      fromNodeId: principledId,
      fromSocket: "bsdf",
      toNodeId: outputId,
      toSocket: "surface",
    },
  ];
  if (material.textureDataUrl) {
    const imageNodeId = `${material.id}:base-color-image`;
    nodes.push({
      id: imageNodeId,
      type: "image_texture",
      position: { x: 120, y: 360 },
      values: {
        textureSlot: "baseColor",
      },
    });
    links.push({
      id: `${material.id}:base-color`,
      fromNodeId: imageNodeId,
      fromSocket: "color",
      toNodeId: principledId,
      toSocket: "baseColor",
    });
  }
  return {
    version: 1,
    nodes,
    links,
  };
}

export function normalizeMaterialNodeGraph(
  raw: unknown,
  material: Parameters<typeof createDefaultMaterialNodeGraph>[0],
): MaterialNodeGraph {
  if (!isRecord(raw) || raw.version !== 1 || !Array.isArray(raw.nodes)) {
    return createDefaultMaterialNodeGraph(material);
  }

  const nodes: MaterialNode[] = [];
  const seenIds = new Set<string>();
  for (const candidate of raw.nodes) {
    if (
      !isRecord(candidate) ||
      typeof candidate.id !== "string" ||
      !candidate.id ||
      typeof candidate.type !== "string" ||
      !MATERIAL_NODE_TYPE_SET.has(candidate.type as MaterialNodeType) ||
      !isRecord(candidate.position) ||
      !isRecord(candidate.values) ||
      seenIds.has(candidate.id)
    ) {
      continue;
    }
    const x = Number(candidate.position.x);
    const y = Number(candidate.position.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const values: Record<string, MaterialNodeValue> = {};
    for (const [key, value] of Object.entries(candidate.values)) {
      const copied = copyNodeValue(value);
      if (copied !== undefined) values[key] = copied;
    }
    nodes.push({
      id: candidate.id,
      type: candidate.type as MaterialNodeType,
      position: { x, y },
      values,
    });
    seenIds.add(candidate.id);
  }
  if (nodes.length === 0) return createDefaultMaterialNodeGraph(material);

  const nodeIds = new Set(nodes.map((node) => node.id));
  const links = Array.isArray(raw.links)
    ? raw.links.flatMap((candidate) => {
        if (
          !isRecord(candidate) ||
          typeof candidate.id !== "string" ||
          typeof candidate.fromNodeId !== "string" ||
          typeof candidate.fromSocket !== "string" ||
          typeof candidate.toNodeId !== "string" ||
          typeof candidate.toSocket !== "string" ||
          !nodeIds.has(candidate.fromNodeId) ||
          !nodeIds.has(candidate.toNodeId)
        ) {
          return [];
        }
        return [
          {
            id: candidate.id,
            fromNodeId: candidate.fromNodeId,
            fromSocket: candidate.fromSocket,
            toNodeId: candidate.toNodeId,
            toSocket: candidate.toSocket,
          },
        ];
      })
    : [];
  if (material.textureDataUrl) {
    for (const node of nodes) {
      if (
        node.type === "image_texture" &&
        node.values.textureSlot === "baseColor" &&
        typeof node.values.dataUrl !== "string"
      ) {
        node.values = {
          ...node.values,
          dataUrl: material.textureDataUrl,
          textureName: material.textureName ?? "",
        };
      }
    }
  }
  return { version: 1, nodes, links };
}

export function syncMaterialFieldsToNodeGraph(
  graph: MaterialNodeGraph,
  material: Pick<
    MaterialAsset,
    | "baseColor"
    | "metallic"
    | "roughness"
    | "opacity"
    | "emissiveColor"
    | "emissiveIntensity"
    | "textureName"
    | "textureDataUrl"
  >,
  changedFields: string[],
): MaterialNodeGraph {
  const output = graph.nodes.find((node) => node.type === "material_output");
  const surfaceLink = graph.links.find(
    (link) => link.toNodeId === output?.id && link.toSocket === "surface",
  );
  const principledId =
    surfaceLink?.fromNodeId ?? graph.nodes.find((node) => node.type === "principled_bsdf")?.id;
  if (!principledId) return graph;

  const fieldToSocket: Record<string, string> = {
    baseColor: "baseColor",
    metallic: "metallic",
    roughness: "roughness",
    opacity: "alpha",
    emissiveColor: "emission",
    emissiveIntensity: "emissionStrength",
  };
  const updates: Record<string, MaterialNodeValue> = {};
  for (const field of changedFields) {
    const socketId = fieldToSocket[field];
    if (!socketId) continue;
    const value =
      field === "opacity"
        ? (material.opacity ?? 1)
        : field === "emissiveColor"
          ? (material.emissiveColor ?? "#000000")
          : field === "emissiveIntensity"
            ? (material.emissiveIntensity ?? 0)
            : material[field as keyof typeof material];
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      updates[socketId] = value;
    }
  }
  let nextGraph: MaterialNodeGraph =
    Object.keys(updates).length === 0
      ? graph
      : {
          ...graph,
          nodes: graph.nodes.map((node) =>
            node.id === principledId ? { ...node, values: { ...node.values, ...updates } } : node,
          ),
        };

  if (changedFields.includes("textureDataUrl") || changedFields.includes("textureName")) {
    const dataUrl = material.textureDataUrl;
    const textureLink = nextGraph.links.find(
      (link) =>
        link.toNodeId === principledId &&
        link.toSocket === "baseColor" &&
        link.fromSocket === "color" &&
        nextGraph.nodes.some(
          (node) => node.id === link.fromNodeId && node.type === "image_texture",
        ),
    );
    const imageNodeId = textureLink?.fromNodeId ?? `${principledId}:image`;
    const hasTexture = typeof dataUrl === "string" && dataUrl.startsWith("data:image/");
    const hasOtherBaseColorLink = nextGraph.links.some(
      (link) => link.toNodeId === principledId && link.toSocket === "baseColor" && !textureLink,
    );
    if (hasTexture && !hasOtherBaseColorLink) {
      const imageNodeExists = nextGraph.nodes.some((node) => node.id === imageNodeId);
      nextGraph = {
        ...nextGraph,
        nodes: imageNodeExists
          ? nextGraph.nodes.map((node) =>
              node.id === imageNodeId
                ? {
                    ...node,
                    values: {
                      ...node.values,
                      dataUrl,
                      textureName: material.textureName ?? "",
                    },
                  }
                : node,
            )
          : [
              ...nextGraph.nodes,
              {
                id: imageNodeId,
                type: "image_texture",
                position: { x: 120, y: 360 },
                values: {
                  dataUrl,
                  textureName: material.textureName ?? "",
                },
              },
            ],
        links: textureLink
          ? nextGraph.links
          : [
              ...nextGraph.links,
              {
                id: `${imageNodeId}-${principledId}-baseColor`,
                fromNodeId: imageNodeId,
                fromSocket: "color",
                toNodeId: principledId,
                toSocket: "baseColor",
              },
            ],
      };
    } else if (textureLink) {
      nextGraph = {
        ...nextGraph,
        nodes: nextGraph.nodes.filter((node) => node.id !== imageNodeId),
        links: nextGraph.links.filter((link) => link.fromNodeId !== imageNodeId),
      };
    }
  }
  return nextGraph;
}

export function normalizeMaterialGraphBaseTextureReference(
  graph: MaterialNodeGraph,
  dataUrl: string | undefined,
): MaterialNodeGraph {
  if (!dataUrl) return graph;
  const principalIds = new Set(
    graph.nodes.filter((node) => node.type === "principled_bsdf").map((node) => node.id),
  );
  const connectedImageIds = new Set(
    graph.links
      .filter(
        (link) =>
          principalIds.has(link.toNodeId) &&
          link.toSocket === "baseColor" &&
          link.fromSocket === "color",
      )
      .map((link) => link.fromNodeId),
  );
  let changed = false;
  const nodes = graph.nodes.map((node) => {
    if (
      node.type !== "image_texture" ||
      !connectedImageIds.has(node.id) ||
      node.values.dataUrl !== dataUrl
    ) {
      return node;
    }
    const values = { ...node.values };
    delete values.dataUrl;
    delete values.textureName;
    values.textureSlot = "baseColor";
    changed = true;
    return { ...node, values };
  });
  return changed ? { ...graph, nodes } : graph;
}

export function validateMaterialNodeGraph(graph: MaterialNodeGraph): string[] {
  const errors: string[] = [];
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const inputLinks = new Set<string>();
  const adjacency = new Map<string, string[]>();

  for (const link of graph.links) {
    const from = nodes.get(link.fromNodeId);
    const to = nodes.get(link.toNodeId);
    if (!from || !to) {
      errors.push(`La conexión "${link.id}" referencia un nodo inexistente.`);
      continue;
    }
    const fromSocket = MATERIAL_NODE_DEFINITIONS.find(
      (definition) => definition.id === from.type,
    )?.outputs.find((item) => item.id === link.fromSocket);
    const toSocket = MATERIAL_NODE_DEFINITIONS.find(
      (definition) => definition.id === to.type,
    )?.inputs.find((item) => item.id === link.toSocket);
    if (!fromSocket || !toSocket || fromSocket.type !== toSocket.type) {
      errors.push(`La conexión "${link.id}" usa sockets incompatibles.`);
      continue;
    }
    const inputKey = `${to.id}:${link.toSocket}`;
    if (inputLinks.has(inputKey)) {
      errors.push(`La entrada "${link.toSocket}" tiene más de una conexión.`);
    }
    inputLinks.add(inputKey);
    const targets = adjacency.get(from.id) ?? [];
    targets.push(to.id);
    adjacency.set(from.id, targets);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (nodeId: string): void => {
    if (visiting.has(nodeId)) {
      errors.push("El grafo contiene un ciclo y no se puede evaluar.");
      return;
    }
    if (visited.has(nodeId)) return;
    visiting.add(nodeId);
    for (const next of adjacency.get(nodeId) ?? []) visit(next);
    visiting.delete(nodeId);
    visited.add(nodeId);
  };
  for (const node of graph.nodes) visit(node.id);
  if (!graph.nodes.some((node) => node.type === "material_output")) {
    errors.push("El grafo no contiene un nodo Material Output.");
  }
  return [...new Set(errors)];
}

function parseHexColor(value: unknown): [number, number, number] {
  if (typeof value !== "string") return [0.6, 0.6, 0.6];
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return [0.6, 0.6, 0.6];
  const integer = parseInt(match[1], 16);
  return [((integer >> 16) & 255) / 255, ((integer >> 8) & 255) / 255, (integer & 255) / 255];
}

function asVector3(value: unknown, fallback: [number, number, number]): [number, number, number] {
  if (!Array.isArray(value)) return fallback;
  return [
    asNumber(value[0], fallback[0]),
    asNumber(value[1], fallback[1]),
    asNumber(value[2], fallback[2]),
  ];
}

function formatHexColor(color: [number, number, number]): string {
  return `#${color
    .map((channel) =>
      Math.round(Math.max(0, Math.min(1, channel)) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function asNumber(value: unknown, fallback: number): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function evaluateMath(operation: unknown, a: number, b: number): number {
  switch (operation) {
    case "subtract":
      return a - b;
    case "multiply":
      return a * b;
    case "divide":
      return Math.abs(b) > 1e-8 ? a / b : 0;
    case "minimum":
      return Math.min(a, b);
    case "maximum":
      return Math.max(a, b);
    case "power":
      return Math.pow(Math.max(0, a), b);
    case "sine":
      return Math.sin(a);
    case "cosine":
      return Math.cos(a);
    default:
      return a + b;
  }
}

export function evaluateMaterialNodeGraph(
  graph: MaterialNodeGraph,
  fallback: Pick<
    MaterialAsset,
    | "baseColor"
    | "metallic"
    | "roughness"
    | "opacity"
    | "emissiveColor"
    | "emissiveIntensity"
    | "textureName"
    | "textureDataUrl"
  >,
): MaterialGraphEvaluation {
  const errors = validateMaterialNodeGraph(graph);
  const fallbackSurface: EvaluatedMaterialSurface = {
    baseColor: fallback.baseColor,
    baseColorTextureUrl: fallback.textureDataUrl,
    textureName: fallback.textureName,
    textureTransform: undefined,
    metallic: fallback.metallic,
    roughness: fallback.roughness,
    opacity: fallback.opacity ?? 1,
    ior: 1.45,
    specular: 0.5,
    emissionColor: fallback.emissiveColor ?? "#000000",
    emissionIntensity: fallback.emissiveIntensity ?? 0,
  };
  if (errors.length > 0) {
    return { ok: false, surface: fallbackSurface, errors };
  }

  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const outputNode = graph.nodes.find((node) => node.type === "material_output");
  const outputLink = graph.links.find(
    (link) => link.toNodeId === outputNode?.id && link.toSocket === "surface",
  );
  const principled = outputLink ? nodes.get(outputLink.fromNodeId) : undefined;
  if (!principled || principled.type !== "principled_bsdf") {
    return {
      ok: false,
      surface: fallbackSurface,
      errors: ["La salida Surface debe estar conectada a un nodo Principled BSDF."],
    };
  }

  const unsupportedNodes = new Set<string>();
  const inputValue = (node: MaterialNode, socketId: string): unknown => {
    const link = graph.links.find(
      (candidate) => candidate.toNodeId === node.id && candidate.toSocket === socketId,
    );
    if (!link) return node.values[socketId];
    const source = nodes.get(link.fromNodeId);
    if (!source) return undefined;
    if (source.type === "math" && link.fromSocket === "value") {
      return evaluateMath(
        source.values.operation,
        scalarInput(source, "a", 0),
        scalarInput(source, "b", 0),
      );
    }
    if (source.type === "mix_color" && link.fromSocket === "color") {
      const factor = Math.max(0, Math.min(1, scalarInput(source, "factor", 0.5)));
      const colorA = parseHexColor(inputValue(source, "colorA"));
      const colorB = parseHexColor(inputValue(source, "colorB"));
      return formatHexColor([
        colorA[0] + (colorB[0] - colorA[0]) * factor,
        colorA[1] + (colorB[1] - colorA[1]) * factor,
        colorA[2] + (colorB[2] - colorA[2]) * factor,
      ]);
    }
    if (
      source.type === "color_ramp" &&
      (link.fromSocket === "color" || link.fromSocket === "alpha")
    ) {
      const factor = Math.max(0, Math.min(1, scalarInput(source, "factor", 0.5)));
      const stops = source.values.stops;
      if (!Array.isArray(stops) || stops.length === 0) {
        return link.fromSocket === "alpha" ? 1 : "#ffffff";
      }
      const parsedStops = stops
        .flatMap((stop) =>
          isRecord(stop)
            ? [
                {
                  position: Math.max(0, Math.min(1, asNumber(stop.position, 0))),
                  color: parseHexColor(stop.color),
                },
              ]
            : [],
        )
        .sort((a, b) => a.position - b.position);
      if (parsedStops.length === 0) {
        return link.fromSocket === "alpha" ? 1 : "#ffffff";
      }
      const rightIndex = parsedStops.findIndex((stop) => stop.position >= factor);
      if (rightIndex <= 0) {
        const color =
          rightIndex === -1 ? parsedStops[parsedStops.length - 1].color : parsedStops[0].color;
        return link.fromSocket === "alpha" ? 1 : formatHexColor(color);
      }
      const left = parsedStops[rightIndex - 1];
      const right = parsedStops[rightIndex];
      const blend =
        right.position === left.position
          ? 0
          : (factor - left.position) / (right.position - left.position);
      const color = [
        left.color[0] + (right.color[0] - left.color[0]) * blend,
        left.color[1] + (right.color[1] - left.color[1]) * blend,
        left.color[2] + (right.color[2] - left.color[2]) * blend,
      ] as [number, number, number];
      return link.fromSocket === "alpha" ? 1 : formatHexColor(color);
    }
    if (source.type === "principled_bsdf") {
      return source.values[link.fromSocket];
    }
    if (source.type === "image_texture") {
      const dataUrl =
        typeof source.values.dataUrl === "string"
          ? source.values.dataUrl
          : source.values.textureSlot === "baseColor"
            ? fallback.textureDataUrl
            : undefined;
      if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
        unsupportedNodes.add(source.id);
        return undefined;
      }
      return {
        kind: link.fromSocket === "alpha" ? "image_alpha" : "image_texture",
        nodeId: source.id,
        dataUrl,
        textureName:
          typeof source.values.textureName === "string"
            ? source.values.textureName
            : source.values.textureSlot === "baseColor"
              ? (fallback.textureName ?? "")
              : "",
        transform: inputValue(source, "vector"),
      };
    }
    if (source.type === "texture_coordinate") {
      if (link.fromSocket !== "uv") {
        unsupportedNodes.add(source.id);
        return undefined;
      }
      return { kind: "uv" };
    }
    if (source.type === "mapping") {
      const inputVector = inputValue(source, "vector");
      if (isRecord(inputVector) && inputVector.kind === "mapped_uv") {
        unsupportedNodes.add(source.id);
        return undefined;
      }
      return {
        kind: "mapped_uv",
        location: asVector3(source.values.location, [0, 0, 0]),
        rotation: asVector3(source.values.rotation, [0, 0, 0]),
        scale: asVector3(source.values.scale, [1, 1, 1]),
      };
    }
    if (source.type === "normal_map" && link.fromSocket === "normal") {
      const color = inputValue(source, "color");
      if (!isRecord(color) || color.kind !== "image_texture") {
        unsupportedNodes.add(source.id);
        return undefined;
      }
      return {
        kind: "normal_map",
        dataUrl: color.dataUrl,
        textureName: color.textureName,
        transform: color.transform,
        strength: Math.max(0, scalarInput(source, "strength", 1)),
      };
    }
    if (source.type === "bump" && link.fromSocket === "normal") {
      const height = inputValue(source, "height");
      if (!isRecord(height) || height.kind !== "image_alpha") {
        unsupportedNodes.add(source.id);
        return undefined;
      }
      if (
        graph.links.some(
          (candidate) => candidate.toNodeId === source.id && candidate.toSocket === "normal",
        )
      ) {
        unsupportedNodes.add(source.id);
        return undefined;
      }
      return {
        kind: "bump_map",
        dataUrl: height.dataUrl,
        transform: height.transform,
        scale: Math.max(0, scalarInput(source, "strength", 1)) * scalarInput(source, "distance", 1),
      };
    }
    return source.values[link.fromSocket];
  };

  const scalarInput = (node: MaterialNode, socketId: string, defaultValue: number): number => {
    const value = inputValue(node, socketId);
    if (
      isRecord(value) &&
      (value.kind === "image_alpha" || value.kind === "image_texture") &&
      typeof value.nodeId === "string"
    ) {
      unsupportedNodes.add(value.nodeId);
      return defaultValue;
    }
    return asNumber(value, defaultValue);
  };

  const baseColorValue = inputValue(principled, "baseColor");
  const emissionValue = inputValue(principled, "emission");
  const baseColorTexture =
    isRecord(baseColorValue) && baseColorValue.kind === "image_texture"
      ? baseColorValue
      : undefined;
  const mappedTransform =
    baseColorTexture && isRecord(baseColorTexture.transform)
      ? baseColorTexture.transform
      : undefined;
  const normalValue = inputValue(principled, "normal");
  if (
    isRecord(normalValue) &&
    normalValue.kind === "image_texture" &&
    typeof normalValue.nodeId === "string"
  ) {
    unsupportedNodes.add(normalValue.nodeId);
  }
  const normalTexture =
    isRecord(normalValue) && normalValue.kind === "normal_map" ? normalValue : undefined;
  const bumpTexture =
    isRecord(normalValue) && normalValue.kind === "bump_map" ? normalValue : undefined;
  const mapTransform = (value: Record<string, unknown> | undefined) => {
    const transform = value?.transform;
    if (!isRecord(transform) || transform.kind !== "mapped_uv") {
      return undefined;
    }
    return {
      location: asVector3(transform.location, [0, 0, 0]),
      rotation: asVector3(transform.rotation, [0, 0, 0]),
      scale: asVector3(transform.scale, [1, 1, 1]),
    };
  };
  const baseColor = typeof baseColorValue === "string" ? baseColorValue : fallbackSurface.baseColor;
  const emissionColor =
    typeof emissionValue === "string" ? emissionValue : fallbackSurface.emissionColor;
  const clamp = (value: unknown, fallbackValue: number) =>
    Math.max(0, Math.min(1, asNumber(value, fallbackValue)));
  const ior = Math.max(1, Math.min(2.5, scalarInput(principled, "ior", 1.45)));
  if (unsupportedNodes.size > 0) {
    return {
      ok: false,
      surface: fallbackSurface,
      errors: Array.from(unsupportedNodes, (nodeId) => {
        const node = nodes.get(nodeId);
        const label =
          MATERIAL_NODE_DEFINITIONS.find((definition) => definition.id === node?.type)?.label ??
          nodeId;
        return `El nodo ${label} aún no está disponible en el evaluador.`;
      }),
    };
  }

  return {
    ok: true,
    errors: [],
    surface: {
      baseColor,
      baseColorTextureUrl:
        typeof baseColorTexture?.dataUrl === "string" ? baseColorTexture.dataUrl : undefined,
      textureName:
        typeof baseColorTexture?.textureName === "string"
          ? baseColorTexture.textureName
          : undefined,
      textureTransform:
        mappedTransform?.kind === "mapped_uv"
          ? {
              location: asVector3(mappedTransform.location, [0, 0, 0]),
              rotation: asVector3(mappedTransform.rotation, [0, 0, 0]),
              scale: asVector3(mappedTransform.scale, [1, 1, 1]),
            }
          : undefined,
      normalTextureUrl:
        typeof normalTexture?.dataUrl === "string" ? normalTexture.dataUrl : undefined,
      normalTextureTransform: mapTransform(normalTexture),
      normalMapStrength:
        typeof normalTexture?.strength === "number" ? normalTexture.strength : undefined,
      bumpTextureUrl: typeof bumpTexture?.dataUrl === "string" ? bumpTexture.dataUrl : undefined,
      bumpTextureTransform: mapTransform(bumpTexture),
      bumpScale: typeof bumpTexture?.scale === "number" ? bumpTexture.scale : undefined,
      metallic: clamp(
        scalarInput(principled, "metallic", fallbackSurface.metallic),
        fallbackSurface.metallic,
      ),
      roughness: clamp(
        scalarInput(principled, "roughness", fallbackSurface.roughness),
        fallbackSurface.roughness,
      ),
      opacity: clamp(
        scalarInput(principled, "alpha", fallbackSurface.opacity),
        fallbackSurface.opacity,
      ),
      ior,
      specular: clamp(scalarInput(principled, "specular", 0.5), 0.5),
      emissionColor,
      emissionIntensity: Math.max(0, scalarInput(principled, "emissionStrength", 0)),
    },
  };
}
