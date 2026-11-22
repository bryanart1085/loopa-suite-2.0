import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createMaterialAsset } from "../core/project/hierarchy";
import { createDefaultMaterialNodeGraph } from "../core/materials/nodeGraph";
import { MaterialNodeEditor } from "./MaterialNodeEditor";

describe("MaterialNodeEditor", () => {
  it("adds an evaluable node to the persisted graph", () => {
    const material = createMaterialAsset({ id: "editor-material" });
    const graph = createDefaultMaterialNodeGraph(material);
    const onChange = vi.fn();
    const onBeginEdit = vi.fn();

    render(
      <MaterialNodeEditor
        material={material}
        graph={graph}
        onChange={onChange}
        onBeginEdit={onBeginEdit}
      />,
    );

    fireEvent.click(screen.getByText("Grafo de nodos"));
    fireEvent.change(screen.getByLabelText("Tipo de nodo para añadir"), {
      target: { value: "math" },
    });

    expect(onBeginEdit).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange.mock.calls[0][0].nodes).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "math" })]),
    );
  });
});
