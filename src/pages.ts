import {
  buildOptions,
  parsePath,
  serializePath,
  type Command,
} from "./parser.js";
import {
  computeBbox,
  getCrs,
  type StaticMapSource,
} from "./staticmap.js";
import { HttpError } from "./parser.js";

export interface PageTile {
  url: string;
  row: number;
  col: number;
  center: { lng: number; lat: number };
}

export interface ComputePagesResult {
  pages: PageTile[];
}

export function computePages(
  sourceKey: string,
  commands: Command[],
  source: StaticMapSource,
): ComputePagesResult {
  const options = buildOptions(commands, source);

  if (options.zoom === undefined) {
    throw new HttpError(400, "pages endpoint requires zoom");
  }
  const zoom = options.zoom;

  const { size } = options;
  const pageOverlap = options.pageOverlap ?? 50;

  if (pageOverlap >= size.width || pageOverlap >= size.height) {
    throw new HttpError(400, "pageOverlap must be less than page size");
  }

  if (options.lines.length === 0) {
    throw new HttpError(400, "pages endpoint requires at least one line command");
  }

  const bbox = computeBbox({ ...options, zoom });
  if (!bbox) {
    throw new HttpError(400, "pages endpoint requires at least one line command");
  }

  const { minX, maxX, minY, maxY } = bbox;
  const strideX = size.width - pageOverlap;
  const strideY = size.height - pageOverlap;

  const numCols = Math.max(1, Math.ceil((maxX - minX) / strideX));
  const numRows = Math.max(1, Math.ceil((maxY - minY) / strideY));

  const firstCenterX = minX + size.width / 2;
  const firstCenterY = minY + size.height / 2;

  const crs = getCrs(source);
  const commandsWithoutCenter = commands.filter((c) => c.type !== "center");

  // Pre-project all line segments to pixel space for intersection tests
  const segments: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  for (const line of options.lines) {
    for (let i = 0; i + 1 < line.path.length; i++) {
      const [lng1, lat1] = line.path[i]!;
      const [lng2, lat2] = line.path[i + 1]!;
      const p1 = crs.lngLatToPixel(lng1, lat1, zoom);
      const p2 = crs.lngLatToPixel(lng2, lat2, zoom);
      segments.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
    }
  }

  const pages: PageTile[] = [];
  for (let row = 0; row < numRows; row++) {
    for (let col = 0; col < numCols; col++) {
      const cx = firstCenterX + col * strideX;
      const cy = firstCenterY + row * strideY;

      const pageMinX = cx - size.width / 2;
      const pageMaxX = cx + size.width / 2;
      const pageMinY = cy - size.height / 2;
      const pageMaxY = cy + size.height / 2;

      if (!pageHasLines(segments, pageMinX, pageMaxX, pageMinY, pageMaxY)) {
        continue;
      }

      const center = crs.pixelToLngLat(cx, cy, zoom);
      const pageCommands: Command[] = [
        ...commandsWithoutCenter,
        { type: "center", lng: center.lng, lat: center.lat },
      ];
      const url = serializePath(sourceKey, pageCommands);

      pages.push({ url, row, col, center });
    }
  }

  return { pages };
}

// Liang-Barsky segment-rectangle intersection test
function pageHasLines(
  segments: Array<{ x1: number; y1: number; x2: number; y2: number }>,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
): boolean {
  for (const { x1, y1, x2, y2 } of segments) {
    if (segmentIntersectsRect(x1, y1, x2, y2, minX, maxX, minY, maxY)) {
      return true;
    }
  }
  return false;
}

function segmentIntersectsRect(
  x1: number, y1: number,
  x2: number, y2: number,
  minX: number, maxX: number,
  minY: number, maxY: number,
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let tMin = 0;
  let tMax = 1;

  for (let i = 0; i < 4; i++) {
    let p: number, q: number;
    if (i === 0) { p = -dx; q = x1 - minX; }
    else if (i === 1) { p = dx; q = maxX - x1; }
    else if (i === 2) { p = -dy; q = y1 - minY; }
    else { p = dy; q = maxY - y1; }

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
