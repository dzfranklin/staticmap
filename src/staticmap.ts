import { createCanvas, loadImage } from "canvas";
import { decodePolyline, type LngLat } from "./polyline.js";
import proj4 from "proj4";

const MERCATOR_MAX_LAT = 85.05112878;

const EPSG27700_PROJ =
  "+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs";
const EPSG27700_RESOLUTIONS = [
  896.0, 448.0, 224.0, 112.0, 56.0, 28.0, 14.0, 7.0, 3.5, 1.75,
];
const EPSG27700_ORIGIN: [number, number] = [-238375.0, 1376256.0];

proj4.defs("EPSG:27700", EPSG27700_PROJ);

export interface StaticMapSource {
  tiles: string[];
  tileSize?: number;
  minzoom?: number;
  maxzoom?: number;
  attribution?: string;
  crs?: "EPSG:3857" | "EPSG:27700";
}

export interface LineLayer {
  path: LngLat[];
  stroke: string;
  width: number;
  borderStroke?: string;
  borderWidth?: number;
}

export interface StaticMapOptions {
  source: StaticMapSource;
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
  lines: LineLayer[];
}

// All pixel coordinates are in source tile pixels (1 tile = sourceTileSize px).
// internalScale is applied separately in renderStaticMap for retina canvas rendering.
interface Crs {
  lngLatToPixel(lng: number, lat: number, zoom: number): { x: number; y: number };
  tilePixelSize(zoom: number, sourceTileSize: number): number;
  normalizeTileCoord(x: number, y: number, zoom: number): { x: number; y: number } | null;
}

const epsg3857Crs: Crs = {
  lngLatToPixel(lng, lat, zoom) {
    const tileSize = 256;
    const clampedLat = Math.max(Math.min(lat, MERCATOR_MAX_LAT), -MERCATOR_MAX_LAT);
    const x = ((lng + 180) / 360) * tileSize * Math.pow(2, zoom);
    const sin = Math.sin((clampedLat * Math.PI) / 180);
    const y =
      (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) *
      tileSize *
      Math.pow(2, zoom);
    return { x, y };
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
  tilePixelSize(_zoom, sourceTileSize) {
    return sourceTileSize;
  },
  normalizeTileCoord(x, y, _zoom) {
    return { x, y };
  },
};

function getCrs(source: StaticMapSource): Crs {
  if (source.crs === "EPSG:27700") return epsg27700Crs;
  return epsg3857Crs;
}

export async function renderStaticMap(
  options: StaticMapOptions,
): Promise<Buffer> {
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
      const drawX = Math.round((tileX * tilePixelSize - topLeftX) * internalScale);
      const drawY = Math.round((tileY * tilePixelSize - topLeftY) * internalScale);
      const drawX2 = Math.round(((tileX + 1) * tilePixelSize - topLeftX) * internalScale);
      const drawY2 = Math.round(((tileY + 1) * tilePixelSize - topLeftY) * internalScale);

      ctx.drawImage(image, drawX, drawY, drawX2 - drawX, drawY2 - drawY);
    }
  }

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const line of options.lines) {
    if (line.path.length < 2) continue;

    if (line.borderStroke && line.borderWidth && line.borderWidth > 0) {
      ctx.beginPath();
      line.path.forEach(([lng, lat], index) => {
        const p = crs.lngLatToPixel(lng, lat, zoom);
        const x = (p.x - topLeftX) * internalScale;
        const y = (p.y - topLeftY) * internalScale;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = line.borderStroke;
      ctx.lineWidth = (line.width + line.borderWidth * 2) * internalScale;
      ctx.stroke();
    }

    ctx.beginPath();
    line.path.forEach(([lng, lat], index) => {
      const p = crs.lngLatToPixel(lng, lat, zoom);
      const x = (p.x - topLeftX) * internalScale;
      const y = (p.y - topLeftY) * internalScale;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = line.stroke;
    ctx.lineWidth = line.width * internalScale;
    ctx.stroke();
  }

  return canvas.toBuffer("image/png");
}

export function decodeLine(encoded: string, precision?: number): LngLat[] {
  return decodePolyline(encoded, precision);
}

function resolveView(
  options: StaticMapOptions,
  sourceTileSize: number,
): { zoom: number; center: { lng: number; lat: number } } {
  const bounds = computeBounds(options.lines);
  const linePadding = computeLinePadding(options.lines);
  const padding = (options.padding ?? 0) + linePadding;
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
  lines: LineLayer[],
): { minLng: number; maxLng: number; minLat: number; maxLat: number } | null {
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  for (const line of lines) {
    for (const [lng, lat] of line.path) {
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

  const zoomX = Math.log2(usableWidth / (tileSize * Math.max(lngFraction, 1e-6)));
  const zoomY = Math.log2(usableHeight / (tileSize * Math.max(latFraction, 1e-6)));
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

  const [minE, minN] = proj4("EPSG:4326", "EPSG:27700", [bounds.minLng, bounds.minLat]);
  const [maxE, maxN] = proj4("EPSG:4326", "EPSG:27700", [bounds.maxLng, bounds.maxLat]);

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

function computeLinePadding(lines: LineLayer[]): number {
  let maxPadding = 0;

  for (const line of lines) {
    const border = line.borderWidth ?? 0;
    const padding = line.width / 2 + border;

    if (Number.isFinite(padding)) {
      maxPadding = Math.max(maxPadding, padding);
    }
  }

  return maxPadding;
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
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "staticmap/1.0 <github.com/dzfranklin/staticmap>",
      },
    });
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

function mod(value: number, modulo: number): number {
  return ((value % modulo) + modulo) % modulo;
}
