import { createCanvas, type CanvasRenderingContext2D } from "canvas";

import { type LabelAnchor, type Style } from "./style.js";
import { type Crs, type Options } from "./staticmap.js";

export interface PixelRect {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface ProjectedSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export abstract class SceneNode {
  abstract intersectsRect(rect: PixelRect): boolean;
  abstract draw(ctx: CanvasRenderingContext2D): void;
}

export class LineNode extends SceneNode {
  private readonly segments: ProjectedSegment[];
  private readonly style: Style;
  private readonly outerRadius: number;

  constructor(segments: ProjectedSegment[], style: Style) {
    super();
    this.segments = segments;
    this.style = style;
    this.outerRadius = style.width / 2 + (style.borderWidth ?? 0);
  }

  intersectsRect(rect: PixelRect): boolean {
    const r = this.outerRadius;
    const inflated: PixelRect = {
      minX: rect.minX - r,
      maxX: rect.maxX + r,
      minY: rect.minY - r,
      maxY: rect.maxY + r,
    };
    for (const seg of this.segments) {
      if (segmentIntersectsRect(seg, inflated)) return true;
    }
    return false;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.segments.length === 0) return;

    ctx.lineCap = this.style.lineCap;
    ctx.lineJoin = this.style.lineJoin;

    const dash = this.style.lineDasharray;

    if ((this.style.borderWidth ?? 0) > 0) {
      const bw = this.style.borderWidth!;
      const w = this.style.width + bw * 2;

      // Draw border on an offscreen canvas so destination-out only punches
      // through the border stroke, not the tiles already on the main canvas.
      withOffscreen(ctx, (off) => {
        off.lineCap = this.style.lineCap;
        off.lineJoin = this.style.lineJoin;

        if (dash) {
          // Extend each dash by bw on each end and shrink each gap by the same,
          // then offset phase by -bw so the extensions align with the foreground dashes.
          const borderDash: number[] = [];
          for (let i = 0; i < dash.length; i++) {
            const scaled = dash[i]! * this.style.width;
            borderDash.push(
              i % 2 === 0 ? scaled + bw * 2 : Math.max(0, scaled - bw * 2),
            );
          }
          off.setLineDash(borderDash);
        }
        off.beginPath();
        if (dash && this.segments.length > 0) {
          const first = this.segments[0]!;
          const dx = first.x2 - first.x1;
          const dy = first.y2 - first.y1;
          const len = Math.hypot(dx, dy) || 1;
          off.moveTo(first.x1 - (dx / len) * bw, first.y1 - (dy / len) * bw);
          for (const seg of this.segments) off.lineTo(seg.x2, seg.y2);
        } else {
          this.tracePath(off);
        }
        off.strokeStyle = this.style.borderColor;
        off.lineWidth = w;
        off.stroke();

        // Punch out the foreground stroke area so border is only visible outside it.
        off.globalCompositeOperation = "destination-out";
        off.setLineDash(dash ? dash.map((v) => v * this.style.width) : []);
        off.lineDashOffset = 0;
        off.beginPath();
        this.tracePath(off);
        off.strokeStyle = "#000000ff";
        off.lineWidth = this.style.width;
        off.stroke();
      });
    }

    ctx.setLineDash(dash ? dash.map((v) => v * this.style.width) : []);
    ctx.lineDashOffset = 0;
    ctx.beginPath();
    this.tracePath(ctx);
    ctx.strokeStyle = this.style.color;
    ctx.lineWidth = this.style.width;
    ctx.stroke();
  }

  private tracePath(ctx: CanvasRenderingContext2D): void {
    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i]!;
      if (i === 0) ctx.moveTo(seg.x1, seg.y1);
      ctx.lineTo(seg.x2, seg.y2);
    }
  }
}

export class PointNode extends SceneNode {
  private readonly x: number;
  private readonly y: number;
  private readonly style: Style;
  private readonly label?: string;

  constructor(x: number, y: number, style: Style, label?: string) {
    super();
    this.x = x;
    this.y = y;
    this.style = style;
    this.label = label;
  }

  intersectsRect(rect: PixelRect): boolean {
    const r = this.style.width / 2 + (this.style.borderWidth ?? 0);
    return (
      this.x + r >= rect.minX &&
      this.x - r <= rect.maxX &&
      this.y + r >= rect.minY &&
      this.y - r <= rect.maxY
    );
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const r = this.style.width / 2;
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.fillStyle = this.style.color;
    ctx.fill();
    if (this.style.borderColor && (this.style.borderWidth ?? 0) > 0) {
      const bw = this.style.borderWidth!;
      ctx.beginPath();
      ctx.arc(this.x, this.y, r + bw / 2, 0, Math.PI * 2);
      ctx.strokeStyle = this.style.borderColor;
      ctx.lineWidth = bw;
      ctx.stroke();
    }

    if (this.label) {
      const outerR = r + (this.style.borderWidth ?? 0);
      const [dx, dy, textAlign, textBaseline] = labelLayout(
        this.style.labelAnchor,
        outerR + this.style.labelOffset,
      );
      ctx.font = `${this.style.labelSize}px "Source Sans 3"`;
      ctx.textAlign = textAlign;
      ctx.textBaseline = textBaseline;
      if (this.style.labelHaloWidth > 0) {
        withOffscreen(ctx, (off) => {
          off.font = ctx.font;
          off.textAlign = ctx.textAlign;
          off.textBaseline = ctx.textBaseline;
          off.lineWidth = this.style.labelHaloWidth * 2;
          off.lineJoin = "round";
          off.strokeStyle = this.style.labelHaloColor;
          off.strokeText(this.label!, this.x + dx, this.y + dy);
          off.globalCompositeOperation = "destination-out";
          off.fillStyle = "#000000ff";
          off.fillText(this.label!, this.x + dx, this.y + dy);
        });
      }
      ctx.fillStyle = this.style.labelColor;
      ctx.fillText(this.label, this.x + dx, this.y + dy);
    }
  }
}

export function buildScene(
  options: Options,
  zoom: number,
  crs: Crs,
): SceneNode[] {
  const nodes: SceneNode[] = [];

  for (const feature of options.features) {
    if (feature.kind === "line") {
      const segments: ProjectedSegment[] = [];
      for (let i = 0; i + 1 < feature.path.length; i++) {
        const [lng1, lat1] = feature.path[i]!;
        const [lng2, lat2] = feature.path[i + 1]!;
        const p1 = crs.lngLatToPixel(lng1, lat1, zoom);
        const p2 = crs.lngLatToPixel(lng2, lat2, zoom);
        segments.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
      }
      nodes.push(new LineNode(segments, feature.style));
    } else {
      const { x, y } = crs.lngLatToPixel(feature.lng, feature.lat, zoom);
      nodes.push(new PointNode(x, y, feature.style, feature.label));
    }
  }

  return nodes;
}

function withOffscreen(
  ctx: CanvasRenderingContext2D,
  fn: (off: CanvasRenderingContext2D) => void,
): void {
  const offscreen = createCanvas(ctx.canvas.width, ctx.canvas.height);
  const off = offscreen.getContext("2d");
  const t = ctx.getTransform();
  off.setTransform(t.a, t.b, t.c, t.d, t.e, t.f);
  fn(off);
  ctx.save();
  ctx.resetTransform();
  ctx.drawImage(offscreen, 0, 0);
  ctx.restore();
}

function labelLayout(
  anchor: LabelAnchor,
  dist: number,
): [number, number, CanvasTextAlign, CanvasTextBaseline] {
  switch (anchor) {
    case "center":
      return [0, 0, "center", "middle"];
    case "left":
      return [-dist, 0, "right", "middle"];
    case "right":
      return [dist, 0, "left", "middle"];
    case "top":
      return [0, -dist, "center", "bottom"];
    case "bottom":
      return [0, dist, "center", "top"];
    case "top-left":
      return [-dist, -dist, "right", "bottom"];
    case "top-right":
      return [dist, -dist, "left", "bottom"];
    case "bottom-left":
      return [-dist, dist, "right", "top"];
    case "bottom-right":
      return [dist, dist, "left", "top"];
  }
}

function segmentIntersectsRect(
  { x1, y1, x2, y2 }: ProjectedSegment,
  { minX, maxX, minY, maxY }: PixelRect,
): boolean {
  // https://en.wikipedia.org/wiki/Liang%E2%80%93Barsky_algorithm
  const dx = x2 - x1;
  const dy = y2 - y1;
  let tMin = 0;
  let tMax = 1;

  const checks = [
    { p: -dx, q: x1 - minX },
    { p: dx, q: maxX - x1 },
    { p: -dy, q: y1 - minY },
    { p: dy, q: maxY - y1 },
  ];

  for (const { p, q } of checks) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const t = q / p;
      if (p < 0) tMin = Math.max(tMin, t);
      else tMax = Math.min(tMax, t);
      if (tMin > tMax) return false;
    }
  }
  return true;
}
