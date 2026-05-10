export interface Style {
  color: string;
  width: number;
  borderStroke?: string;
  borderWidth?: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  /** Dash pattern as alternating dash/gap lengths scaled by line width, like maplibre's line-dasharray. */
  dasharray?: number[];
}

export function defaultStyle(): Style {
  return {
    color: "#000000",
    width: 4,
    lineCap: "round",
    lineJoin: "round",
  };
}
