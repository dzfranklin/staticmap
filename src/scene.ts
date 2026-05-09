import { type CanvasRenderingContext2D } from "canvas";
import { type Style } from "./style.js";
import { type Crs, type StaticMapOptions } from "./staticmap.js";

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

    if (this.style.borderStroke && (this.style.borderWidth ?? 0) > 0) {
      ctx.beginPath();
      this.tracePath(ctx);
      ctx.strokeStyle = this.style.borderStroke;
      ctx.lineWidth = this.style.width + (this.style.borderWidth ?? 0) * 2;
      ctx.stroke();
    }

    ctx.beginPath();
    this.tracePath(ctx);
    ctx.strokeStyle = this.style.stroke;
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

export function buildScene(
  options: StaticMapOptions,
  zoom: number,
  crs: Crs,
): SceneNode[] {
  const nodes: SceneNode[] = [];

  for (const line of options.lines) {
    const segments: ProjectedSegment[] = [];
    for (let i = 0; i + 1 < line.path.length; i++) {
      const [lng1, lat1] = line.path[i]!;
      const [lng2, lat2] = line.path[i + 1]!;
      const p1 = crs.lngLatToPixel(lng1, lat1, zoom);
      const p2 = crs.lngLatToPixel(lng2, lat2, zoom);
      segments.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
    }
    nodes.push(new LineNode(segments, line.style));
  }

  return nodes;
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
