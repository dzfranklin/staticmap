import {
  parsePath,
  buildOptions,
  serializePath,
  prependCommandOnce,
  CenterCommand,
} from "../parser.js";
import { SizeCommand } from "../commands/index.js";
import { computeBbox, getCrs, type Source } from "../staticmap.js";
import { buildScene, type PixelRect } from "../scene.js";
import { HttpError } from "../errors.js";

export interface PageTile {
  url: string;
  row: number;
  col: number;
  size: { width: number; height: number };
  center: { lng: number; lat: number };
  bounds: { minLat: number; minLng: number; maxLat: number; maxLng: number };
  nativeBounds?: {
    crs: string;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
}

const MAX_PAGES = 100;

export function computePages(
  sourceKey: string,
  commands: ReturnType<typeof parsePath>["commands"],
  source: Source,
  size: { width: number; height: number },
  pageOverlap: number,
): { pages: PageTile[]; attribution: string | undefined } {
  const options = buildOptions(
    [...commands.filter((c) => c.type !== "size" && c.type !== "pageOverlap")],
    source,
  );
  options.size = size;

  if (options.zoom === undefined) {
    throw new HttpError(400, "print requires a zoom command");
  }
  const zoom = options.zoom;

  if (pageOverlap >= size.width || pageOverlap >= size.height) {
    throw new HttpError(400, "pageOverlap must be less than page size");
  }

  if (options.features.length === 0) {
    throw new HttpError(400, "print requires at least one line command");
  }

  const bbox = computeBbox({ ...options, zoom });
  if (!bbox) {
    throw new HttpError(400, "print requires at least one line command");
  }

  const { minX, maxX, minY, maxY } = bbox;
  const strideX = size.width - pageOverlap;
  const strideY = size.height - pageOverlap;

  const numCols = Math.max(1, Math.ceil((maxX - minX) / strideX));
  const numRows = Math.max(1, Math.ceil((maxY - minY) / strideY));

  if (numCols * numRows > 10_000) {
    throw new HttpError(
      400,
      `Request too large: ${numCols} cols × ${numRows} rows (max 10,000 grid cells)`,
    );
  }

  const firstCenterX = minX + size.width / 2;
  const firstCenterY = minY + size.height / 2;

  const crs = getCrs(source);
  const nodes = buildScene(options, zoom, crs);

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

      const innerRect: PixelRect = {
        minX: col === 0 ? pageRect.minX : pageRect.minX + pageOverlap,
        maxX: col === numCols - 1 ? pageRect.maxX : pageRect.maxX - pageOverlap,
        minY: row === 0 ? pageRect.minY : pageRect.minY + pageOverlap,
        maxY: row === numRows - 1 ? pageRect.maxY : pageRect.maxY - pageOverlap,
      };
      if (!nodes.some((n) => n.intersectsRect(innerRect))) continue;

      if (pages.length >= MAX_PAGES) {
        throw new HttpError(400, `Too many pages: result exceeds ${MAX_PAGES}`);
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

      const crsKey = source.crs ?? "EPSG:3857";
      let nativeBounds: PageTile["nativeBounds"];
      if (crsKey !== "EPSG:3857") {
        const nativeTopLeft = crs.pixelToNative(
          pageRect.minX,
          pageRect.minY,
          zoom,
        );
        const nativeBottomRight = crs.pixelToNative(
          pageRect.maxX,
          pageRect.maxY,
          zoom,
        );
        nativeBounds = {
          crs: crsKey,
          minX: nativeTopLeft.x,
          minY: nativeBottomRight.y,
          maxX: nativeBottomRight.x,
          maxY: nativeTopLeft.y,
        };
      }

      let pageCommands = [...commands];
      pageCommands = prependCommandOnce(
        pageCommands,
        new CenterCommand({ lng: center.lng, lat: center.lat }),
      );
      pageCommands = prependCommandOnce(
        pageCommands,
        new SizeCommand({
          width: size.width,
          height: size.height,
        }),
      );

      const url = serializePath(sourceKey, pageCommands);

      pages.push({ url, row, col, center, size, bounds, nativeBounds });
    }
  }

  return { pages, attribution: source.attribution };
}
