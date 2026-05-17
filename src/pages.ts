import {
  buildOptions,
  serializePath,
  prependCommandOnce,
  type Command,
  PageOverlapCommand,
  CenterCommand,
} from "./parser.js";
import { computeBbox, getCrs, type Source } from "./staticmap.js";
import { HttpError } from "./errors.js";
import { buildScene, type PixelRect } from "./scene.js";

const DEFAULT_PAGE_OVERLAP = 50;
const MAX_GRID_CELLS = 10_000;
export const MAX_PAGES = 100;

export interface PageTile {
  url: string;
  row: number;
  col: number;
  size: { width: number; height: number };
  center: { lng: number; lat: number };
  bounds: { minLat: number; minLng: number; maxLat: number; maxLng: number };
}

export interface ComputePagesResult {
  pages: PageTile[];
}

export function computePages(
  sourceKey: string,
  commands: Command[],
  source: Source,
): ComputePagesResult {
  const options = buildOptions(commands, source);

  if (options.zoom === undefined) {
    throw new HttpError(400, "pages endpoint requires zoom");
  }
  const zoom = options.zoom;

  const { size } = options;
  const pageOverlap = options.pageOverlap ?? DEFAULT_PAGE_OVERLAP;

  if (pageOverlap >= size.width || pageOverlap >= size.height) {
    throw new HttpError(400, "pageOverlap must be less than page size");
  }

  if (options.features.length === 0) {
    throw new HttpError(
      400,
      "pages endpoint requires at least one line command",
    );
  }

  const bbox = computeBbox({ ...options, zoom });
  if (!bbox) {
    throw new HttpError(
      400,
      "pages endpoint requires at least one line command",
    );
  }

  const { minX, maxX, minY, maxY } = bbox;
  const strideX = size.width - pageOverlap;
  const strideY = size.height - pageOverlap;

  const numCols = Math.max(1, Math.ceil((maxX - minX) / strideX));
  const numRows = Math.max(1, Math.ceil((maxY - minY) / strideY));

  if (numCols * numRows > MAX_GRID_CELLS) {
    throw new HttpError(
      400,
      `Request too large: ${numCols} cols x ${numRows} rows = ${numCols * numRows} grid cells (max ${MAX_GRID_CELLS})`,
    );
  }

  const firstCenterX = minX + size.width / 2;
  const firstCenterY = minY + size.height / 2;

  const crs = getCrs(source);
  const nodes = buildScene(options, zoom, crs);
  const baseCommands = prependCommandOnce(
    commands,
    new PageOverlapCommand({ value: pageOverlap }),
  );

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

      // Hit-test against the inner (non-buffer) region only — content in the
      // buffer is already visible on the adjacent page.
      const innerRect: PixelRect = {
        minX: col === 0 ? pageRect.minX : pageRect.minX + pageOverlap,
        maxX: col === numCols - 1 ? pageRect.maxX : pageRect.maxX - pageOverlap,
        minY: row === 0 ? pageRect.minY : pageRect.minY + pageOverlap,
        maxY: row === numRows - 1 ? pageRect.maxY : pageRect.maxY - pageOverlap,
      };
      if (!nodes.some((n) => n.intersectsRect(innerRect))) continue;

      if (pages.length >= MAX_PAGES) {
        throw new HttpError(
          400,
          `Too many pages: result exceeds ${MAX_PAGES} pages`,
        );
      }

      const center = crs.pixelToLngLat(cx, cy, zoom);
      const topLeft = crs.pixelToLngLat(pageRect.minX, pageRect.minY, zoom);
      const bottomRight = crs.pixelToLngLat(pageRect.maxX, pageRect.maxY, zoom);
      const bounds = {
        minLat: bottomRight.lat,
        minLng: topLeft.lng,
        maxLat: topLeft.lat,
        maxLng: bottomRight.lng,
      };
      const pageCommands = prependCommandOnce(
        baseCommands,
        new CenterCommand({ lng: center.lng, lat: center.lat }),
      );
      const url = serializePath(sourceKey, pageCommands);

      pages.push({ url, row, col, center, size, bounds });
    }
  }

  return { pages };
}
