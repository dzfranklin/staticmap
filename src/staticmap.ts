import "./fonts.js";
import { createCanvas, loadImage } from "canvas";
import { type LngLat } from "./commands/feature.js";
import proj4 from "proj4";
import { buildScene, PixelRect } from "./scene.js";
import type { Style } from "./style.js";
import { logger } from "./logger.js";

const MERCATOR_MAX_LAT = 85.05112878;

const EPSG27700_PROJ =
  "+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs";
const EPSG27700_RESOLUTIONS = [
  896.0, 448.0, 224.0, 112.0, 56.0, 28.0, 14.0, 7.0, 3.5, 1.75,
];
const EPSG27700_ORIGIN: [number, number] = [-238375.0, 1376256.0];

proj4.defs("EPSG:27700", EPSG27700_PROJ);

export interface Source {
  tiles: string[];
  tileSize?: number;
  minzoom?: number;
  maxzoom?: number;
  attribution?: string;
  crs?: "EPSG:3857" | "EPSG:27700";
}

export interface LineFeature {
  kind: "line";
  path: readonly LngLat[];
  style: Style;
}

export interface PointFeature {
  kind: "point";
  lng: number;
  lat: number;
  style: Style;
  label?: string;
}

export type Feature = LineFeature | PointFeature;

export interface Options {
  source: Source;
  size: {
    width: number;
    height: number;
  };
  padding: number;
  zoom?: number;
  center?: {
    lng: number;
    lat: number;
  };
  features: Feature[];
  pageOverlap?: number;
  debug?: boolean;
}

// All pixel coordinates are in source tile pixels (1 tile = sourceTileSize px).
// internalScale is applied separately in renderStaticMap for retina canvas rendering.
export interface Crs {
  lngLatToPixel(
    lng: number,
    lat: number,
    zoom: number,
  ): { x: number; y: number };
  pixelToLngLat(
    x: number,
    y: number,
    zoom: number,
  ): { lng: number; lat: number };
  tilePixelSize(zoom: number, sourceTileSize: number): number;
  normalizeTileCoord(
    x: number,
    y: number,
    zoom: number,
  ): { x: number; y: number } | null;
}

const epsg3857Crs: Crs = {
  lngLatToPixel(lng, lat, zoom) {
    const tileSize = 256;
    const clampedLat = Math.max(
      Math.min(lat, MERCATOR_MAX_LAT),
      -MERCATOR_MAX_LAT,
    );
    const x = ((lng + 180) / 360) * tileSize * Math.pow(2, zoom);
    const sin = Math.sin((clampedLat * Math.PI) / 180);
    const y =
      (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) *
      tileSize *
      Math.pow(2, zoom);
    return { x, y };
  },
  pixelToLngLat(x, y, zoom) {
    const scale = 256 * Math.pow(2, zoom);
    const lng = Math.round(((x / scale) * 360 - 180) * 1e6) / 1e6;
    const n = Math.PI - (2 * Math.PI * y) / scale;
    const lat =
      Math.round((180 / Math.PI) * Math.atan(Math.sinh(n)) * 1e6) / 1e6;
    return { lng, lat };
  },
  tilePixelSize(zoom, sourceTileSize) {
    const tileZ = Math.round(zoom);
    return sourceTileSize * Math.pow(2, zoom - tileZ);
  },
  normalizeTileCoord(x, y, zoom) {
    const tileZ = Math.round(zoom);
    const tilesAtZ = Math.pow(2, tileZ);
    if (y < 0 || y >= tilesAtZ) return null;
    return { x: mod(x, tilesAtZ), y };
  },
};

const epsg27700Crs: Crs = {
  lngLatToPixel(lng, lat, zoom) {
    const [easting, northing] = proj4("EPSG:4326", "EPSG:27700", [lng, lat]);
    const res = EPSG27700_RESOLUTIONS[Math.round(zoom)];
    if (res === undefined) {
      throw new Error(`Invalid EPSG:27700 zoom index: ${zoom}`);
    }
    return {
      x: (easting - EPSG27700_ORIGIN[0]) / res,
      y: (EPSG27700_ORIGIN[1] - northing) / res,
    };
  },
  pixelToLngLat(x, y, zoom) {
    const res = EPSG27700_RESOLUTIONS[Math.round(zoom)];
    if (res === undefined) {
      throw new Error(`Invalid EPSG:27700 zoom index: ${zoom}`);
    }
    const easting = x * res + EPSG27700_ORIGIN[0];
    const northing = EPSG27700_ORIGIN[1] - y * res;
    const [lngRaw, latRaw] = proj4("EPSG:27700", "EPSG:4326", [
      easting,
      northing,
    ]);
    return {
      lng: Math.round(lngRaw * 1e6) / 1e6,
      lat: Math.round(latRaw * 1e6) / 1e6,
    };
  },
  tilePixelSize(_zoom, sourceTileSize) {
    return sourceTileSize;
  },
  normalizeTileCoord(x, y, _zoom) {
    return { x, y };
  },
};

export function getCrs(source: Source): Crs {
  if (source.crs === "EPSG:27700") return epsg27700Crs;
  return epsg3857Crs;
}

export function computeBbox(
  options: Options & { zoom: number },
): { minX: number; maxX: number; minY: number; maxY: number } | null {
  const crs = getCrs(options.source);
  let minX = Infinity,
    maxX = -Infinity;
  let minY = Infinity,
    maxY = -Infinity;

  for (const feature of options.features) {
    const coords: readonly LngLat[] =
      feature.kind === "line" ? feature.path : [[feature.lng, feature.lat]];
    for (const [lng, lat] of coords) {
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
      const { x, y } = crs.lngLatToPixel(lng, lat, options.zoom);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }

  if (!Number.isFinite(minX)) return null;

  minX -= options.padding;
  maxX += options.padding;
  minY -= options.padding;
  maxY += options.padding;

  return { minX, maxX, minY, maxY };
}

export interface StaticMapResult {
  buffer: Buffer;
  attribution: string | undefined;
  bounds: { minLat: number; minLng: number; maxLat: number; maxLng: number };
}

export async function renderStaticMap(
  options: Options,
): Promise<StaticMapResult> {
  const internalScale = 2;
  const sourceTileSize = options.source.tileSize ?? 256;
  const renderWidth = options.size.width * internalScale;
  const renderHeight = options.size.height * internalScale;

  if (options.source.tiles.length === 0) {
    throw new Error("Source tiles is empty");
  }
  const tiles = options.source.tiles[0]!;

  const crs = getCrs(options.source);
  const { zoom, center } = resolveView(options, sourceTileSize);

  const centerPixel = crs.lngLatToPixel(center.lng, center.lat, zoom);
  const tilePixelSize = crs.tilePixelSize(zoom, sourceTileSize);
  const tileZ = Math.round(zoom);

  const canvas = createCanvas(renderWidth, renderHeight);
  const ctx = canvas.getContext("2d");

  // topLeft in CRS pixel space (before internalScale)
  const topLeftX = centerPixel.x - options.size.width / 2;
  const topLeftY = centerPixel.y - options.size.height / 2;

  const minTileX = Math.floor(topLeftX / tilePixelSize);
  const maxTileX = Math.floor((topLeftX + options.size.width) / tilePixelSize);
  const minTileY = Math.floor(topLeftY / tilePixelSize);
  const maxTileY = Math.floor((topLeftY + options.size.height) / tilePixelSize);

  for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
    for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
      const normalized = crs.normalizeTileCoord(tileX, tileY, zoom);
      if (!normalized) continue;

      const url = buildTileUrl(tiles, {
        z: tileZ,
        x: normalized.x,
        y: normalized.y,
        r: internalScale === 2 ? "@2x" : "",
      });
      const buffer = await fetchTile(url);
      if (!buffer) continue;

      const image = await loadImage(buffer);

      // Draw coordinates scaled to canvas (internalScale applied here)
      const drawX = Math.round(
        (tileX * tilePixelSize - topLeftX) * internalScale,
      );
      const drawY = Math.round(
        (tileY * tilePixelSize - topLeftY) * internalScale,
      );
      const drawX2 = Math.round(
        ((tileX + 1) * tilePixelSize - topLeftX) * internalScale,
      );
      const drawY2 = Math.round(
        ((tileY + 1) * tilePixelSize - topLeftY) * internalScale,
      );

      ctx.drawImage(image, drawX, drawY, drawX2 - drawX, drawY2 - drawY);

      if (options.debug) {
        const dw = drawX2 - drawX;
        const dh = drawY2 - drawY;
        const label = `${tileZ}/${normalized.x}/${normalized.y}`;
        const pad = 4 * internalScale;

        ctx.save();
        ctx.strokeStyle = "black";
        ctx.lineWidth = 1;
        ctx.setLineDash([16, 16]);
        ctx.strokeRect(drawX, drawY, dw, dh);
        ctx.fillStyle = "black";
        ctx.font = `${10 * internalScale}px monospace`;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(label, drawX + pad, drawY + pad);
        ctx.restore();
      }
    }
  }

  const nodes = buildScene(options, zoom, crs);

  const viewportRect: PixelRect = {
    minX: topLeftX,
    maxX: topLeftX + options.size.width,
    minY: topLeftY,
    maxY: topLeftY + options.size.height,
  };

  ctx.save();
  ctx.scale(internalScale, internalScale);
  ctx.translate(-topLeftX, -topLeftY);
  for (const node of nodes) {
    if (!node.intersectsRect(viewportRect)) continue;
    ctx.save();
    node.draw(ctx);
    ctx.restore();
  }
  ctx.restore();

  if (options.debug) {
    const w = options.size.width;
    const h = options.size.height;
    const s = internalScale;
    ctx.save();
    ctx.scale(s, s);

    if (options.pageOverlap !== undefined) {
      const overlap = options.pageOverlap;
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.rect(overlap, overlap, w - overlap * 2, h - overlap * 2);
      ctx.fillStyle = "rgba(255, 100, 0, 0.25)";
      ctx.fill("evenodd");
      ctx.strokeStyle = "rgba(255, 100, 0, 0.8)";
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
    }

    const pad = options.padding;
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.rect(pad, pad, w - pad * 2, h - pad * 2);
    ctx.fillStyle = "rgba(0, 100, 255, 0.25)";
    ctx.fill("evenodd");

    ctx.restore();
  }

  const buffer = canvas.toBuffer("image/png");

  const topLeft = crs.pixelToLngLat(topLeftX, topLeftY, zoom);
  const bottomRight = crs.pixelToLngLat(
    topLeftX + options.size.width,
    topLeftY + options.size.height,
    zoom,
  );
  return {
    buffer,
    attribution: options.source.attribution,
    bounds: {
      minLat: bottomRight.lat,
      minLng: topLeft.lng,
      maxLat: topLeft.lat,
      maxLng: bottomRight.lng,
    },
  };
}

export function resolveView(
  options: Options,
  sourceTileSize: number,
): { zoom: number; center: { lng: number; lat: number } } {
  const bounds = computeBounds(options.features);
  const padding = options.padding ?? 0;
  let zoom = options.zoom;
  let center = options.center;

  if (!zoom) {
    if (bounds) {
      if (options.source.crs === "EPSG:27700") {
        zoom = fitZoom27700(
          bounds,
          options.size.width,
          options.size.height,
          padding,
        );
      } else {
        zoom = computeFitZoom(
          bounds,
          options.size.width,
          options.size.height,
          padding,
          sourceTileSize,
        );
      }
    } else {
      zoom = 1;
    }
  }

  if (!center) {
    if (bounds) {
      center = {
        lng: (bounds.minLng + bounds.maxLng) / 2,
        lat: (bounds.minLat + bounds.maxLat) / 2,
      };
    } else {
      center = { lng: 0, lat: 0 };
    }
  }

  if (options.source.minzoom !== undefined) {
    zoom = Math.max(zoom, options.source.minzoom);
  }
  if (options.source.maxzoom !== undefined) {
    zoom = Math.min(zoom, options.source.maxzoom);
  }

  return { zoom, center };
}

function computeBounds(
  features: Feature[],
): { minLng: number; maxLng: number; minLat: number; maxLat: number } | null {
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  for (const feature of features) {
    const coords: readonly LngLat[] =
      feature.kind === "line" ? feature.path : [[feature.lng, feature.lat]];
    for (const [lng, lat] of coords) {
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }
  }

  if (!Number.isFinite(minLng) || !Number.isFinite(minLat)) return null;

  return { minLng, maxLng, minLat, maxLat };
}

function computeFitZoom(
  bounds: { minLng: number; maxLng: number; minLat: number; maxLat: number },
  width: number,
  height: number,
  padding: number,
  tileSize: number,
): number {
  const usableWidth = Math.max(1, width - padding * 2);
  const usableHeight = Math.max(1, height - padding * 2);
  const lngFraction = (bounds.maxLng - bounds.minLng) / 360;
  const latFraction = (latRad(bounds.maxLat) - latRad(bounds.minLat)) / Math.PI;

  const zoomX = Math.log2(
    usableWidth / (tileSize * Math.max(lngFraction, 1e-6)),
  );
  const zoomY = Math.log2(
    usableHeight / (tileSize * Math.max(latFraction, 1e-6)),
  );
  const zoom = Math.min(zoomX, zoomY);

  return Number.isFinite(zoom) ? zoom : 1;
}

function fitZoom27700(
  bounds: { minLng: number; maxLng: number; minLat: number; maxLat: number },
  width: number,
  height: number,
  padding: number,
): number {
  const usableWidth = Math.max(1, width - padding * 2);
  const usableHeight = Math.max(1, height - padding * 2);

  const [minE, minN] = proj4("EPSG:4326", "EPSG:27700", [
    bounds.minLng,
    bounds.minLat,
  ]);
  const [maxE, maxN] = proj4("EPSG:4326", "EPSG:27700", [
    bounds.maxLng,
    bounds.maxLat,
  ]);

  const projWidth = Math.abs(maxE - minE);
  const projHeight = Math.abs(maxN - minN);

  for (let z = EPSG27700_RESOLUTIONS.length - 1; z >= 0; z--) {
    const res = EPSG27700_RESOLUTIONS[z]!;
    if (projWidth / res <= usableWidth && projHeight / res <= usableHeight) {
      return z;
    }
  }

  return 0;
}

function latRad(lat: number): number {
  const clamped = Math.max(Math.min(lat, MERCATOR_MAX_LAT), -MERCATOR_MAX_LAT);
  const sin = Math.sin((clamped * Math.PI) / 180);
  const rad = Math.log((1 + sin) / (1 - sin)) / 2;
  return Math.max(Math.min(rad, Math.PI), -Math.PI) / 2;
}

function buildTileUrl(
  template: string,
  params: { z: number; x: number; y: number; r: string },
): string {
  return template
    .replace("{z}", params.z.toString())
    .replace("{x}", params.x.toString())
    .replace("{y}", params.y.toString())
    .replace("{r}", params.r);
}

async function fetchTile(url: string): Promise<Buffer | null> {
  let log = logger.child({ url });
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "staticmap/1.0 <github.com/dzfranklin/staticmap>",
      },
    });
    log = logger.child({ status: response.status });

    if (response.status === 204 || response.status === 404) {
      log.info("Tile not found");
      return null;
    } else if (!response.ok) {
      log.error("Failed to fetch tile");
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buf = Buffer.from(arrayBuffer);
    log.info({ url, size: buf.length }, "Fetched tile");
    return buf;
  } catch (err) {
    logger.error({ err }, `Failed to fetch tile: ${url}`);
    return null;
  }
}

function mod(value: number, modulo: number): number {
  return ((value % modulo) + modulo) % modulo;
}
