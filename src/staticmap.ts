import { createCanvas, loadImage } from "canvas";
import { decodePolyline, type LngLat } from "./polyline.js";

export interface StaticMapSource {
  tiles: string[];
  tileSize?: number;
  minzoom?: number;
  maxzoom?: number;
  attribution?: string;
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

const MERCATOR_MAX_LAT = 85.05112878;

export async function renderStaticMap(
  options: StaticMapOptions,
): Promise<Buffer> {
  const internalScale = 2;
  const tileSize = options.source.tileSize ?? 256;
  const renderWidth = options.size.width * internalScale;
  const renderHeight = options.size.height * internalScale;

  if (options.source.tiles.length === 0) {
    throw new Error("Source tiles is empty");
  }
  const tiles = options.source.tiles[0]!;

  const { zoom, center } = resolveView(options, tileSize);
  const tileSizeRenderBase = tileSize * internalScale;
  const centerPixel = lngLatToPixel(
    center.lng,
    center.lat,
    zoom,
    tileSizeRenderBase,
  );

  const tileZ = Math.round(zoom);
  const zoomScale = Math.pow(2, zoom - tileZ);
  const tileRenderSize = tileSizeRenderBase * zoomScale;
  const tilesAtZ = Math.pow(2, tileZ);

  const canvas = createCanvas(renderWidth, renderHeight);
  const ctx = canvas.getContext("2d");

  const topLeftX = centerPixel.x - renderWidth / 2;
  const topLeftY = centerPixel.y - renderHeight / 2;

  const minTileX = Math.floor(topLeftX / tileRenderSize);
  const maxTileX = Math.floor((topLeftX + renderWidth) / tileRenderSize);
  const minTileY = Math.floor(topLeftY / tileRenderSize);
  const maxTileY = Math.floor((topLeftY + renderHeight) / tileRenderSize);

  for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
    if (tileY < 0 || tileY >= tilesAtZ) {
      continue;
    }

    for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
      const wrappedX = mod(tileX, tilesAtZ);
      const url = buildTileUrl(tiles, {
        z: tileZ,
        x: wrappedX,
        y: tileY,
        r: internalScale === 2 ? "@2x" : "",
      });
      const buffer = await fetchTile(url);
      if (!buffer) {
        continue;
      }

      const image = await loadImage(buffer);
      const drawX = tileX * tileRenderSize - topLeftX;
      const drawY = tileY * tileRenderSize - topLeftY;

      ctx.drawImage(
        image,
        Math.round(drawX),
        Math.round(drawY),
        Math.round(tileRenderSize),
        Math.round(tileRenderSize),
      );
    }
  }

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const line of options.lines) {
    if (line.path.length < 2) {
      continue;
    }

    if (line.borderStroke && line.borderWidth && line.borderWidth > 0) {
      ctx.beginPath();

      line.path.forEach(([lng, lat], index) => {
        const point = lngLatToPixel(lng, lat, zoom, tileSizeRenderBase);
        const x = point.x - topLeftX;
        const y = point.y - topLeftY;

        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });

      const borderLineWidth =
        (line.width + line.borderWidth * 2) * internalScale;
      ctx.strokeStyle = line.borderStroke;
      ctx.lineWidth = borderLineWidth;
      ctx.stroke();
    }

    ctx.beginPath();

    line.path.forEach(([lng, lat], index) => {
      const point = lngLatToPixel(lng, lat, zoom, tileSizeRenderBase);
      const x = point.x - topLeftX;
      const y = point.y - topLeftY;

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
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
  tileSize: number,
): { zoom: number; center: { lng: number; lat: number } } {
  const bounds = computeBounds(options.lines);
  const linePadding = computeLinePadding(options.lines);
  const padding = (options.padding ?? 0) + linePadding;
  let zoom = options.zoom;
  let center = options.center;

  if (!zoom) {
    if (bounds) {
      zoom = computeFitZoom(
        bounds,
        options.size.width,
        options.size.height,
        padding,
        tileSize,
      );
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
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        continue;
      }
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }
  }

  if (!Number.isFinite(minLng) || !Number.isFinite(minLat)) {
    return null;
  }

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

function lngLatToPixel(
  lng: number,
  lat: number,
  zoom: number,
  tileSize: number,
): { x: number; y: number } {
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
    if (!response.ok) {
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

function mod(value: number, modulo: number): number {
  return ((value % modulo) + modulo) % modulo;
}
