/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Vec2, Vec3 } from '../mesh/EditableMesh';

export type UVSelectMode = 'vertex' | 'edge' | 'face' | 'island';

export type UVProjectionType =
  | 'unwrap'
  | 'planar'
  | 'cylindrical'
  | 'spherical'
  | 'view';

export type UVTransformTool = 'move' | 'rotate' | 'scale';

export type UVPivotMode = 'center' | 'cursor' | 'individual';

export type UVDisplayMode = 'standard' | 'checker' | 'distortion' | 'overlap';

export interface UVIsland {
  id: string;
  faceIds: string[];
  vertexIds: string[]; // Unique vertex corner refs in this island
  min: Vec2;
  max: Vec2;
  center: Vec2;
}

export interface UVSelectionState {
  mode: UVSelectMode;
  selectedVertexKeys: Set<string>; // "faceId::vertexId" or "vertexId"
  selectedEdgeKeys: Set<string>;   // "faceId::v0-v1"
  selectedFaceIds: Set<string>;
  selectedIslandIds: Set<string>;
  pinnedVertexKeys: Set<string>;
}

export interface UVPackOptions {
  margin: number;       // e.g. 0.01 to 0.1
  rotate: boolean;      // Allow automatic 90-degree rotation
  scale: boolean;       // Uniform scale optimization
}
