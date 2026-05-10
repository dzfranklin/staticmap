import {
  decodeLine,
  type StaticMapOptions,
  type StaticMapSource,
  type Feature,
} from "./staticmap.js";
import { defaultStyle, type Style } from "./style.js";

export interface CommandColor {
  type: "color";
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

export interface CommandPageOverlap {
  type: "pageOverlap";
  value: number;
}

export interface CommandDash {
  type: "dash";
  value: number[];
}

export interface CommandCap {
  type: "cap";
  value: CanvasLineCap;
}

export interface CommandJoin {
  type: "join";
  value: CanvasLineJoin;
}

export interface CommandPoint {
  type: "point";
  lng: number;
  lat: number;
}

export type Command =
  | CommandColor
  | CommandWidth
  | CommandBorder
  | CommandBorderWidth
  | CommandDash
  | CommandCap
  | CommandJoin
  | CommandLine
  | CommandPoint
  | CommandSize
  | CommandPadding
  | CommandZoom
  | CommandCenter
  | CommandPageOverlap;

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
  let pageOverlap: number | undefined;

  let style: Style = defaultStyle();

  const hasCommand = (type: Command["type"]) =>
    commands.some((c) => c.type === type);

  if (hasCommand("dash") && !hasCommand("cap")) {
    style = { ...style, lineCap: "butt" };
  }

  const features: Feature[] = [];

  for (const command of commands) {
    switch (command.type) {
      case "color":
        style = { ...style, color: command.value };
        break;
      case "width":
        style = { ...style, width: command.value };
        break;
      case "border":
        style = { ...style, borderStroke: command.value };
        break;
      case "borderWidth":
        style = { ...style, borderWidth: command.value };
        break;
      case "dash":
        style = { ...style, dasharray: command.value };
        break;
      case "cap":
        style = { ...style, lineCap: command.value };
        break;
      case "join":
        style = { ...style, lineJoin: command.value };
        break;
      case "line": {
        const path = decodeLine(command.value, command.precision);
        if (path.length < 2) {
          throw new HttpError(400, "Polyline must contain at least two points");
        }
        features.push({ kind: "line", path, style: { ...style } });
        break;
      }
      case "point":
        features.push({
          kind: "point",
          lng: command.lng,
          lat: command.lat,
          style: { ...style },
        });
        break;
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
      case "pageOverlap":
        pageOverlap = command.value;
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
    features,
    pageOverlap,
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
    case "color":
      if (!parts[0]) {
        throw new HttpError(400, "Expected color value");
      }
      return { type: "color", value: parts[0] };
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
    case "cap": {
      const v = parts[0];
      if (v !== "butt" && v !== "round" && v !== "square") {
        throw new HttpError(400, "cap must be butt, round, or square");
      }
      return { type: "cap", value: v };
    }
    case "join": {
      const v = parts[0];
      if (v !== "round" && v !== "bevel" && v !== "miter") {
        throw new HttpError(400, "join must be round, bevel, or miter");
      }
      return { type: "join", value: v };
    }
    case "dash": {
      if (!parts[0]) {
        throw new HttpError(400, "Expected dash value");
      }
      const values = parts[0].split(",").map((v) => parseNumber(v, "dash"));
      if (values.length === 0) {
        throw new HttpError(400, "dash must have at least one value");
      }
      return { type: "dash", value: values };
    }
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
    case "pageOverlap": {
      if (!parts[0]) {
        throw new HttpError(400, "Expected pageOverlap value");
      }
      return {
        type: "pageOverlap",
        value: parseNumber(parts[0], "pageOverlap"),
      };
    }
    case "point": {
      if (!parts[0]) {
        throw new HttpError(400, "Expected point value");
      }
      const coords = parts[0].split(",");
      if (coords.length !== 2) {
        throw new HttpError(400, "Point must be <lng>,<lat>");
      }
      const lng = parseNumber(coords[0]!, "point.lng");
      const lat = parseNumber(coords[1]!, "point.lat");
      return { type: "point", lng, lat };
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

export function serializePath(sourceKey: string, commands: Command[]): string {
  const segments = commands.map(serializeCommand);
  return `/map:${sourceKey}/${segments.join("/")}`;
}

function serializeCommand(command: Command): string {
  switch (command.type) {
    case "color":
      return `color:${encodeURIComponent(command.value)}`;
    case "width":
      return `width:${command.value}`;
    case "border":
      return `border:${encodeURIComponent(command.value)}`;
    case "borderWidth":
      return `borderWidth:${command.value}`;
    case "dash":
      return `dash:${command.value.join(",")}`;
    case "cap":
      return `cap:${command.value}`;
    case "join":
      return `join:${command.value}`;
    case "line":
      return command.precision !== undefined
        ? `line:${command.precision}:${encodeURIComponent(command.value)}`
        : `line:${encodeURIComponent(command.value)}`;
    case "size":
      return `size:${command.width}x${command.height}`;
    case "padding":
      return `padding:${command.value}`;
    case "zoom":
      return `zoom:${command.value}`;
    case "center":
      return `center:${command.lng.toFixed(6)},${command.lat.toFixed(6)}`;
    case "pageOverlap":
      return `pageOverlap:${command.value}`;
    case "point":
      return `point:${command.lng.toFixed(6)},${command.lat.toFixed(6)}`;
    default:
      assertNever(command);
  }
}
