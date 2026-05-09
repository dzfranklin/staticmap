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
import { buildScene, type PixelRect } from "./scene.js";

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
  const nodes = buildScene(options, zoom, crs);
  const commandsWithoutCenter = commands.filter((c) => c.type !== "center");

  const pages: PageTile[] = [];
  for (let row = 0; row < numRows; row++) {
    for (let col = 0; col < numCols; col++) {
      const cx = firstCenterX + col * strideX;
      const cy = firstCenterY + row * strideY;

      const pageRect: PixelRect = {
        minX: cx - size.width / 2,
        maxX: cx + size.width / 2,
        minY: cy - size.height / 2,
        maxY: cy + size.height / 2,
      };

      if (!nodes.some((n) => n.intersectsRect(pageRect))) continue;

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
