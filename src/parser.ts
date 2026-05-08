import {
  decodeLine,
  type StaticMapOptions,
  type StaticMapSource,
  type LineLayer,
} from "./staticmap.js";

export interface CommandStroke {
  type: "stroke";
  value: string;
}

export interface CommandWidth {
  type: "width";
  value: number;
}

export interface CommandBorder {
  type: "border";
  value: string;
}

export interface CommandBorderWidth {
  type: "borderWidth";
  value: number;
}

export interface CommandLine {
  type: "line";
  value: string;
  precision?: number;
}

export interface CommandSize {
  type: "size";
  width: number;
  height: number;
}

export interface CommandPadding {
  type: "padding";
  value: number;
}

export interface CommandZoom {
  type: "zoom";
  value: number;
}

export interface CommandCenter {
  type: "center";
  lng: number;
  lat: number;
}

export type Command =
  | CommandStroke
  | CommandWidth
  | CommandBorder
  | CommandBorderWidth
  | CommandLine
  | CommandSize
  | CommandPadding
  | CommandZoom
  | CommandCenter;

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function parsePath(pathname: string): {
  sourceKey: string;
  commands: Command[];
} {
  const normalized = pathname.startsWith("/") ? pathname.slice(1) : pathname;
  const segments = normalized.split("/").filter(Boolean);

  const [first, ...rest] = segments;
  if (!first) {
    throw new HttpError(400, "Missing map source");
  }
  if (!first.startsWith("map:")) {
    throw new HttpError(400, "Path must start with map:<source>");
  }

  const sourceKey = first.slice("map:".length);
  if (!sourceKey) {
    throw new HttpError(400, "Missing map source key");
  }

  const commands = rest.map(parseCommandSegment);
  return { sourceKey, commands };
}

export function buildOptions(
  commands: Command[],
  source: StaticMapSource,
): StaticMapOptions {
  let size = { width: 600, height: 400 };
  let padding = 0;
  let zoom: number | undefined;
  let center: { lng: number; lat: number } | undefined;

  let stroke = "#000000";
  let width = 4;
  let borderStroke: string | undefined;
  let borderWidth: number | undefined;

  const lines: LineLayer[] = [];

  for (const command of commands) {
    switch (command.type) {
      case "stroke":
        stroke = command.value;
        break;
      case "width":
        width = command.value;
        break;
      case "border":
        borderStroke = command.value;
        break;
      case "borderWidth":
        borderWidth = command.value;
        break;
      case "line": {
        const path = decodeLine(command.value, command.precision);
        if (path.length < 2) {
          throw new HttpError(400, "Polyline must contain at least two points");
        }
        lines.push({ path, stroke, width, borderStroke, borderWidth });
        break;
      }
      case "size":
        size = { width: command.width, height: command.height };
        break;
      case "padding":
        padding = command.value;
        break;
      case "zoom":
        zoom = command.value;
        break;
      case "center":
        center = { lng: command.lng, lat: command.lat };
        break;
      default:
        assertNever(command);
    }
  }

  return {
    source,
    size,
    padding,
    zoom,
    center,
    lines,
  };
}

function parseCommandSegment(segment: string): Command {
  const rawParts = segment.split(":");
  if (rawParts.length < 2) {
    throw new HttpError(400, `Invalid command segment: ${segment}`);
  }

  const [name, ...rest] = rawParts;
  const parts = rest.map(decodeSegmentValue);

  switch (name) {
    case "stroke":
      if (!parts[0]) {
        throw new HttpError(400, "Expected stroke value");
      }
      return { type: "stroke", value: parts[0] };
    case "width":
      if (!parts[0]) {
        throw new HttpError(400, "Expected width value");
      }
      return { type: "width", value: parseNumber(parts[0], "width") };
    case "border":
      if (!parts[0]) {
        throw new HttpError(400, "Expected border value");
      }
      return { type: "border", value: parts[0] };
    case "borderWidth":
      if (!parts[0]) {
        throw new HttpError(400, "Expected borderWidth value");
      }
      return {
        type: "borderWidth",
        value: parseNumber(parts[0], "borderWidth"),
      };
    case "line": {
      if (parts.length === 2) {
        const precision = parseNumber(parts[0]!, "line precision");
        if (!parts[1]) {
          throw new HttpError(400, "Expected polyline value");
        }
        return { type: "line", value: parts[1], precision };
      }
      if (!parts[0]) {
        throw new HttpError(400, "Expected polyline value");
      }
      return { type: "line", value: parts[0] };
    }
    case "size": {
      const match = parts[0]?.match(/^(\d+)x(\d+)$/);
      if (!match) {
        throw new HttpError(400, "Size must be <w>x<h>");
      }
      const width = parseInt(match[1]!, 10);
      const height = parseInt(match[2]!, 10);
      return { type: "size", width, height };
    }
    case "padding": {
      if (!parts[0]) {
        throw new HttpError(400, "Expected padding value");
      }
      return { type: "padding", value: parseNumber(parts[0], "padding") };
    }
    case "zoom": {
      if (!parts[0]) {
        throw new HttpError(400, "Expected zoom value");
      }
      return { type: "zoom", value: parseNumber(parts[0], "zoom") };
    }
    case "center": {
      if (!parts[0]) {
        throw new HttpError(400, "Expected center value");
      }
      const coords = parts[0].split(",");
      if (coords.length !== 2) {
        throw new HttpError(400, "Center must be <lng>,<lat>");
      }
      const lng = parseNumber(coords[0]!, "center.lng");
      const lat = parseNumber(coords[1]!, "center.lat");
      return { type: "center", lng, lat };
    }
    default:
      throw new HttpError(400, `Unknown command: ${name}`);
  }
}

function decodeSegmentValue(value: string): string {
  if (!value) {
    return value;
  }

  try {
    return decodeURIComponent(value);
  } catch {
    throw new HttpError(400, "Command value is not valid URL encoding");
  }
}

function parseNumber(raw: string, label: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new HttpError(400, `${label} must be a number`);
  }
  return value;
}

function assertNever(value: never): never {
  throw new HttpError(400, `Unexpected command: ${JSON.stringify(value)}`);
}
