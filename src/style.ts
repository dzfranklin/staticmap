import type { LabelAnchor } from "./commands/enums.js";

export { LabelAnchor };

export interface Style {
  color: string;
  width: number;
  borderColor: string;
  borderWidth?: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  /** Dash pattern as alternating dash/gap lengths scaled by line width, like maplibre's line-dasharray. */
  lineDasharray?: number[];
  labelColor: string;
  labelAnchor: LabelAnchor;
  labelOffset: number;
  labelSize: number;
  labelHaloWidth: number;
  labelHaloColor: string;
}
