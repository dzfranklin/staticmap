export interface Style {
  stroke: string;
  width: number;
  borderStroke?: string;
  borderWidth?: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
}

export function defaultStyle(): Style {
  return {
    stroke: "#000000",
    width: 4,
    lineCap: "round",
    lineJoin: "round",
  };
}
