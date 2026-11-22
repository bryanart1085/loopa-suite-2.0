import { describe, expect, it } from "vitest";
import { createMaterialAsset } from "../project/hierarchy";
import {
  createDefaultMaterialNodeGraph,
  evaluateMaterialNodeGraph,
  normalizeMaterialGraphBaseTextureReference,
  normalizeMaterialNodeGraph,
  syncMaterialFieldsToNodeGraph,
  validateMaterialNodeGraph,
} from "./nodeGraph";

describe("material node graph", () => {
  it("creates a connected Principled-to-Output graph for existing materials", () => {
    const material = createMaterialAsset({
      id: "material-test",
      baseColor: "#123456",
      metallic: 0.3,
      roughness: 0.7,
    });
    const graph = createDefaultMaterialNodeGraph(material);

    expect(graph.nodes.map((node) => node.type)).toEqual(["principled_bsdf", "material_output"]);
    expect(graph.links).toHaveLength(1);
    expect(evaluateMaterialNodeGraph(graph, material)).toMatchObject({
      ok: true,
      surface: {
        baseColor: "#123456",
        metallic: 0.3,
        roughness: 0.7,
      },
    });
  });

  it("migrates existing base textures into an Image Texture node", () => {
    const imageDataUrl = "data:image/png;base64,aGVsbG8=";
    const material = createMaterialAsset({
      id: "material-legacy-texture",
      textureName: "legacy.png",
      textureDataUrl: imageDataUrl,
    });

    expect(material.nodeGraph?.nodes).toContainEqual(
      expect.objectContaining({
        type: "image_texture",
        values: expect.objectContaining({ textureSlot: "baseColor" }),
      }),
    );
    expect(
      evaluateMaterialNodeGraph(material.nodeGraph!, material).surface.baseColorTextureUrl,
    ).toBe(imageDataUrl);
  });

  it("allows a graph edit to disconnect a migrated image texture", () => {
    const material = createMaterialAsset({
      id: "material-disconnect-texture",
      textureName: "base.png",
      textureDataUrl: "data:image/png;base64,aGVsbG8=",
    });
    const graph = material.nodeGraph!;
    const imageNode = graph.nodes.find((node) => node.type === "image_texture")!;
    graph.nodes = graph.nodes.filter((node) => node.id !== imageNode.id);
    graph.links = graph.links.filter((link) => link.fromNodeId !== imageNode.id);

    const normalized = createMaterialAsset({ ...material, nodeGraph: graph });
    expect(normalized.nodeGraph?.nodes).not.toContainEqual(
      expect.objectContaining({ type: "image_texture" }),
    );
    expect(
      evaluateMaterialNodeGraph(normalized.nodeGraph!, normalized).surface.baseColorTextureUrl,
    ).toBeUndefined();
  });

  it("stores a migrated base texture once and keeps its graph reference", () => {
    const material = createMaterialAsset({
      id: "material-base-reference",
      textureName: "base.png",
      textureDataUrl: "data:image/png;base64,aGVsbG8=",
    });
    const graph = material.nodeGraph!;
    const normalized = normalizeMaterialGraphBaseTextureReference(graph, material.textureDataUrl);
    const imageNode = normalized.nodes.find((node) => node.type === "image_texture")!;

    expect(imageNode.values).toEqual({ textureSlot: "baseColor" });
    expect(evaluateMaterialNodeGraph(normalized, material).surface.baseColorTextureUrl).toBe(
      material.textureDataUrl,
    );
  });

  it("keeps the existing flat property controls synchronized with the graph", () => {
    const material = createMaterialAsset({ id: "material-properties" });
    const graph = syncMaterialFieldsToNodeGraph(
      material.nodeGraph!,
      { ...material, baseColor: "#abcdef" },
      ["baseColor"],
    );

    expect(evaluateMaterialNodeGraph(graph, material).surface.baseColor).toBe("#abcdef");
  });

  it("evaluates a connected Math node into a Principled input", () => {
    const material = createMaterialAsset({ id: "material-math" });
    const graph = createDefaultMaterialNodeGraph(material);
    const principled = graph.nodes.find((node) => node.type === "principled_bsdf")!;
    graph.nodes.push({
      id: "math-multiply",
      type: "math",
      position: { x: 300, y: 300 },
      values: { operation: "multiply", a: 0.5, b: 0.4 },
    });
    graph.links.push({
      id: "math-metallic",
      fromNodeId: "math-multiply",
      fromSocket: "value",
      toNodeId: principled.id,
      toSocket: "metallic",
    });

    expect(evaluateMaterialNodeGraph(graph, material).surface.metallic).toBe(0.2);
  });

  it("evaluates a Mix Color node into a Principled color input", () => {
    const material = createMaterialAsset({ id: "material-mix" });
    const graph = createDefaultMaterialNodeGraph(material);
    const principled = graph.nodes.find((node) => node.type === "principled_bsdf")!;
    graph.nodes.push({
      id: "mix",
      type: "mix_color",
      position: { x: 300, y: 300 },
      values: {
        factor: 0.5,
        colorA: "#000000",
        colorB: "#ffffff",
      },
    });
    graph.links.push({
      id: "mix-base-color",
      fromNodeId: "mix",
      fromSocket: "color",
      toNodeId: principled.id,
      toSocket: "baseColor",
    });

    expect(evaluateMaterialNodeGraph(graph, material).surface.baseColor).toBe("#808080");
  });

  it("evaluates an image texture and UV mapping for the base color", () => {
    const material = createMaterialAsset({ id: "material-image" });
    const graph = createDefaultMaterialNodeGraph(material);
    const principled = graph.nodes.find((node) => node.type === "principled_bsdf")!;
    const imageDataUrl = "data:image/png;base64,aGVsbG8=";
    graph.nodes.push(
      {
        id: "image",
        type: "image_texture",
        position: { x: 0, y: 0 },
        values: { dataUrl: imageDataUrl, textureName: "base.png" },
      },
      {
        id: "uv",
        type: "texture_coordinate",
        position: { x: 0, y: 100 },
        values: {},
      },
      {
        id: "mapping",
        type: "mapping",
        position: { x: 100, y: 100 },
        values: {
          location: [0.2, 0.3, 0],
          rotation: [0, 0, 0.5],
          scale: [2, 3, 1],
        },
      },
    );
    graph.links.push(
      {
        id: "image-base-color",
        fromNodeId: "image",
        fromSocket: "color",
        toNodeId: principled.id,
        toSocket: "baseColor",
      },
      {
        id: "uv-mapping",
        fromNodeId: "uv",
        fromSocket: "uv",
        toNodeId: "mapping",
        toSocket: "vector",
      },
      {
        id: "mapping-image",
        fromNodeId: "mapping",
        fromSocket: "vector",
        toNodeId: "image",
        toSocket: "vector",
      },
    );

    expect(evaluateMaterialNodeGraph(graph, material)).toMatchObject({
      ok: true,
      surface: {
        baseColorTextureUrl: imageDataUrl,
        textureName: "base.png",
        textureTransform: {
          location: [0.2, 0.3, 0],
          rotation: [0, 0, 0.5],
          scale: [2, 3, 1],
        },
      },
    });
  });

  it("evaluates normal and bump map connections", () => {
    const material = createMaterialAsset({ id: "material-maps" });
    const graph = createDefaultMaterialNodeGraph(material);
    const principled = graph.nodes.find((node) => node.type === "principled_bsdf")!;
    const imageDataUrl = "data:image/png;base64,aGVsbG8=";
    graph.nodes.push(
      {
        id: "normal-image",
        type: "image_texture",
        position: { x: 0, y: 0 },
        values: { dataUrl: imageDataUrl },
      },
      {
        id: "normal",
        type: "normal_map",
        position: { x: 100, y: 0 },
        values: { strength: 0.7 },
      },
      {
        id: "height-image",
        type: "image_texture",
        position: { x: 0, y: 200 },
        values: { dataUrl: imageDataUrl },
      },
      {
        id: "bump",
        type: "bump",
        position: { x: 100, y: 200 },
        values: { strength: 0.8, distance: 0.5 },
      },
    );
    graph.links.push(
      {
        id: "image-normal",
        fromNodeId: "normal-image",
        fromSocket: "color",
        toNodeId: "normal",
        toSocket: "color",
      },
      {
        id: "normal-surface",
        fromNodeId: "normal",
        fromSocket: "normal",
        toNodeId: principled.id,
        toSocket: "normal",
      },
    );
    expect(evaluateMaterialNodeGraph(graph, material)).toMatchObject({
      ok: true,
      surface: { normalTextureUrl: imageDataUrl },
    });

    graph.links = graph.links.filter(
      (link) => link.toNodeId !== principled.id || link.toSocket !== "normal",
    );
    graph.links.push(
      {
        id: "height-bump",
        fromNodeId: "height-image",
        fromSocket: "alpha",
        toNodeId: "bump",
        toSocket: "height",
      },
      {
        id: "bump-surface",
        fromNodeId: "bump",
        fromSocket: "normal",
        toNodeId: principled.id,
        toSocket: "normal",
      },
    );

    expect(evaluateMaterialNodeGraph(graph, material)).toMatchObject({
      ok: true,
      surface: {
        bumpTextureUrl: imageDataUrl,
        bumpScale: 0.4,
      },
    });
  });

  it("rejects cycles and normalizes legacy materials to a default graph", () => {
    const material = createMaterialAsset({ id: "material-cycle" });
    const graph = createDefaultMaterialNodeGraph(material);
    graph.nodes.push(
      {
        id: "math-a",
        type: "math",
        position: { x: 0, y: 0 },
        values: {},
      },
      {
        id: "math-b",
        type: "math",
        position: { x: 0, y: 100 },
        values: {},
      },
    );
    graph.links.push(
      {
        id: "cycle-a",
        fromNodeId: "math-a",
        fromSocket: "value",
        toNodeId: "math-b",
        toSocket: "a",
      },
      {
        id: "cycle-b",
        fromNodeId: "math-b",
        fromSocket: "value",
        toNodeId: "math-a",
        toSocket: "a",
      },
    );

    expect(validateMaterialNodeGraph(graph)).toContain(
      "El grafo contiene un ciclo y no se puede evaluar.",
    );
    expect(normalizeMaterialNodeGraph(undefined, material).nodes).toHaveLength(2);
  });
});
