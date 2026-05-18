import type { Options, Source } from "./staticmap.js";
import {
  type Command,
  type FeatureModifiers,
  type CommandClass,
  ALL_COMMANDS,
  DEFAULT_STYLE,
  GlobalCommand,
  StyleCommand,
  FeatureModifierCommand,
  FeatureCommand,
} from "./commands/index.js";
import { HttpError, ParseError } from "./errors.js";

export {
  Command,
  PageOverlapCommand,
  CenterCommand,
} from "./commands/index.js";

// # Command map

const COMMAND_MAP = new Map<string, CommandClass>();
for (const C of ALL_COMMANDS) {
  const hasRest = C.args.some((a) => a.rest);
  const arityKey = hasRest ? "/rest" : `/${C.args.length}`;
  for (const name of [C.type, ...C.alt]) {
    const key = `${name}${arityKey}`;
    if (COMMAND_MAP.has(key)) throw new Error(`Duplicate command key: ${key}`);
    if (
      hasRest &&
      [...COMMAND_MAP.keys()].some((k) => k.startsWith(`${name}/`))
    ) {
      throw new Error(
        `Ambiguous command: rest-arg "${name}" conflicts with fixed-arity variant`,
      );
    }
    if (!hasRest && COMMAND_MAP.has(`${name}/rest`)) {
      throw new Error(
        `Ambiguous command: fixed-arity "${key}" conflicts with rest-arg variant`,
      );
    }
    COMMAND_MAP.set(key, C);
  }
}

// # Path parsing

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

function parseCommandSegment(segment: string): Command {
  const [name, ...rawParts] = segment.split(":");
  const parts = rawParts.map(decodeSegmentValue);
  const Cls =
    COMMAND_MAP.get(`${name}/rest`) ??
    COMMAND_MAP.get(`${name}/${parts.length}`);
  if (!Cls)
    throw new ParseError(
      `Unknown command "${name}" with ${parts.length} arguments`,
    );
  return Cls.parse(name!, parts);
}

function decodeSegmentValue(value: string): string {
  if (!value) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    throw new ParseError("Command value is not valid URL encoding");
  }
}

// # Build options

export function buildOptions(commands: Command[], source: Source): Options {
  // Pass 1: global commands — last value wins, order irrelevant
  const partial: Partial<Options> = {};
  for (const cmd of commands) {
    if (cmd instanceof GlobalCommand) cmd.applyGlobal(partial);
  }

  const size = partial.size ?? { width: 600, height: 400 };
  if (!partial.size) partial.size = size;
  if (partial.padding === undefined)
    partial.padding = Math.min(partial.size.width, partial.size.height) * 0.1;
  if (partial.debug === undefined) partial.debug = false;

  const resolved = partial as Options;
  resolved.source = source;
  resolved.features = [];

  // Pass 2: sequential — style and modifiers accumulate, features capture snapshots
  const style = { ...DEFAULT_STYLE };
  let modifiers: FeatureModifiers = {};

  for (const cmd of commands) {
    if (cmd instanceof StyleCommand) {
      cmd.applyStyle(style);
    } else if (cmd instanceof FeatureModifierCommand) {
      cmd.applyModifier(modifiers);
    } else if (cmd instanceof FeatureCommand) {
      resolved.features.push(
        cmd.buildFeature({
          options: resolved,
          style: { ...style },
          modifiers: { ...modifiers },
        }),
      );
      modifiers = {};
    }
  }

  return resolved;
}

// # Serialization

export function serializePath(sourceKey: string, commands: Command[]): string {
  const segments = commands.map((cmd) => cmd.serialize());
  return `/map:${sourceKey}/${segments.join("/")}`;
}

export function prependCommandOnce(
  commands: Command[],
  command: Command,
): Command[] {
  return [
    command,
    ...commands.filter((c) => c.constructor !== command.constructor),
  ];
}
