import { z } from "zod";

export const LabelAnchorSchema = z.enum([
  "center",
  "left",
  "right",
  "top",
  "bottom",
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
]);

export type LabelAnchor = z.infer<typeof LabelAnchorSchema>;

export interface Style {
  color: string;
  width: number;
  borderColor: string;
  borderWidth?: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  /** Dash pattern as alternating dash/gap lengths scaled by line width, like maplibre's line-dasharray. */
  dasharray?: number[];
  label?: string;
  labelColor: string;
  labelAnchor: LabelAnchor;
  labelOffset: number;
  labelSize: number;
}

export function defaultStyle(): Style {
  return {
    color: "#000000",
    width: 4,
    lineCap: "round",
    lineJoin: "round",
    borderColor: "#000000",
    labelSize: 16,
    labelAnchor: "bottom",
    labelOffset: 2,
    labelColor: "#000000",
  };
}
