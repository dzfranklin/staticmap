export interface Style {
  color: string;
  width: number;
  borderStroke?: string;
  borderWidth?: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
}

export function defaultStyle(): Style {
  return {
    color: "#000000",
    width: 4,
    lineCap: "round",
    lineJoin: "round",
  };
}
