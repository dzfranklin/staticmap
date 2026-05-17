import { z } from "zod";
import type { Style, LabelAnchor } from "../style.js";
import type { Options, Feature } from "../staticmap.js";
import { ParseError } from "../errors.js";

// # Arg types

type ArgSchema = z.ZodString | z.ZodNumber | z.ZodEnum<Record<string, string>>;

export interface ArgDef<Name extends string = string, T = unknown> {
  name: Name;
  schema: ArgSchema & z.ZodType<T>;
  rest?: boolean;
  _type: T;
}

export type StyleArgDef<Name extends string = string, T = unknown> =
  | (ArgDef<Name, T> & { rest?: false; default: T })
  | (ArgDef<Name, T> & { rest: true; default: T[] });

type ArgValue<A extends ArgDef> = A extends { rest: true }
  ? A["_type"][]
  : A["_type"];

export type ArgsToData<T extends readonly ArgDef[]> = {
  [A in T[number] as A["name"]]: ArgValue<A>;
};

export function arg<Name extends string, T>(
  name: Name,
  schema: ArgSchema & z.ZodType<T>,
  opts: { rest?: boolean } = {},
): ArgDef<Name, T> {
  return { name, schema, ...opts, _type: undefined as unknown as T };
}

export function styleArg<Name extends string, T>(
  name: Name,
  schema: ArgSchema & z.ZodType<T>,
  defaultValue: T,
  opts?: { rest?: false },
): StyleArgDef<Name, T> & { rest: false; default: T };
export function styleArg<Name extends string, T>(
  name: Name,
  schema: ArgSchema & z.ZodType<T>,
  defaultValue: T[],
  opts: { rest: true },
): StyleArgDef<Name, T> & { rest: true; default: T[] };
export function styleArg<Name extends string, T>(
  name: Name,
  schema: ArgSchema & z.ZodType<T>,
  defaultValue: T | T[],
  opts: { rest?: boolean } = {},
): StyleArgDef<Name, T> {
  return {
    ...opts,
    name,
    schema,
    default: defaultValue,
  } as StyleArgDef<Name, T>;
}

// # Shared types

export interface FeatureModifiers {
  label?: string;
}

export interface BuildState {
  options: Readonly<Options>;
  style: Readonly<Style>;
  modifiers: Readonly<FeatureModifiers>;
}

// # Base classes

type CategoryType = "style" | "global" | "feature-modifier" | "feature";

export abstract class Command {
  static readonly category: CategoryType;
  static readonly type: string;
  static readonly alt: string[] = [];
  static readonly args: ArgDef[];

  readonly parsedAs?: string;

  get type(): string {
    return (this.constructor as typeof Command).type;
  }

  get category(): CategoryType {
    return (this.constructor as typeof Command).category;
  }

  static parse(name: string, parts: string[]): Command {
    try {
      const args = this.args;

      const restIdx = args.findIndex((a) => a.rest);
      if (restIdx !== -1 && restIdx !== args.length - 1) {
        throw new ParseError("args after rest arg");
      }

      const data: Record<string, unknown> = {};

      if (restIdx !== -1) {
        for (let i = 0; i < restIdx; i++) {
          const raw = parts[i];
          if (raw === undefined) {
            throw new ParseError(`Missing argument ${i} (${args[i]!.name})`);
          }
          data[args[i]!.name] = parseArgValue(args[i]!, raw, i);
        }
        const restArg = args[restIdx]!;
        const restParts = parts.slice(restIdx);
        data[restArg.name] = restParts.map((p, j) =>
          parseArgValue(restArg, p, restIdx + j),
        );
      } else {
        if (parts.length !== args.length) {
          throw new ParseError(
            `expected ${args.length} arguments, got ${parts.length}`,
          );
        }
        for (let i = 0; i < args.length; i++) {
          const raw = parts[i];
          if (raw === undefined) {
            throw new ParseError(`Missing argument ${i} (${args[i]!.name})`);
          }
          data[args[i]!.name] = parseArgValue(args[i]!, raw, i);
        }
      }

      const instance = new (this as unknown as new (
        data: Record<string, unknown>,
      ) => Command)(data);
      (instance as { parsedAs?: string }).parsedAs = name;
      return instance;
    } catch (err) {
      if (err instanceof ParseError && !err.command) {
        throw ParseError.withCommand(err, name);
      }
      throw err;
    }
  }

  serialize(): string {
    const prefix = this.parsedAs ?? this.type;
    const values = serializeArgs(this);
    return values.length ? `${prefix}:${values.join(":")}` : prefix;
  }
}

function parseArgValue(argDef: ArgDef, raw: string, idx: number): unknown {
  const result = argDef.schema.safeParse(
    argDef.schema instanceof z.ZodNumber ? Number(raw) : raw,
  );
  if (!result.success) {
    throw new ParseError(
      `Invalid value for argument ${idx} (${argDef.name}): ${result.error.issues[0]?.message ?? "invalid"}`,
    );
  }
  return result.data;
}

function serializeArgs(cmd: Command): string[] {
  const args = (cmd.constructor as typeof Command).args;
  const data = (cmd as unknown as { data: Record<string, unknown> }).data;
  const values: string[] = [];
  for (const argDef of args) {
    const val = data[argDef.name];
    if (argDef.rest) {
      for (const v of val as unknown[]) {
        values.push(encodeURIComponent(String(v)));
      }
    } else {
      values.push(encodeURIComponent(String(val)));
    }
  }
  return values;
}

export abstract class StyleCommand extends Command {
  static readonly category = "style" as const;
  static readonly args: StyleArgDef[];
  abstract applyStyle(style: Partial<Style>): void;

  static default(): StyleCommand {
    const data: Record<string, unknown> = {};
    for (const a of this.args) data[a.name] = a.default;
    const instance = new (this as unknown as new (
      data: Record<string, unknown>,
    ) => StyleCommand)(data);
    return instance;
  }
}

export abstract class GlobalCommand extends Command {
  static readonly category = "global" as const;
  abstract applyGlobal(options: Partial<Options>): void;
}

export abstract class FeatureModifierCommand extends Command {
  static readonly category = "feature-modifier" as const;
  abstract applyModifier(modifiers: FeatureModifiers): void;
}

export abstract class FeatureCommand extends Command {
  static readonly category = "feature" as const;
  abstract buildFeature(state: BuildState): Feature;
}

export type CommandClass = {
  readonly type: string;
  readonly alt: string[];
  readonly args: ArgDef[];
  parse(name: string, parts: string[]): Command;
};

export type StyleCommandClass = CommandClass & { default(): StyleCommand };
export type GlobalCommandClass = CommandClass;
export type FeatureModifierCommandClass = CommandClass;
export type FeatureCommandClass = CommandClass;

// # Factory helpers

type FactoryInstance<TBase, TArgs extends readonly ArgDef[]> = TBase & {
  readonly data: ArgsToData<TArgs>;
};

type FactoryClass<TBase, TClass, TArgs extends readonly ArgDef[]> = TClass &
  (new (data: ArgsToData<TArgs>) => FactoryInstance<TBase, TArgs>);

export function defineStyleCommand<
  const TArgs extends readonly StyleArgDef[],
>(config: {
  type: string;
  alt?: string[];
  args: TArgs;
  applyStyle: (style: Partial<Style>, data: ArgsToData<TArgs>) => void;
  parse?: (name: string, parts: string[]) => StyleCommand;
  serialize?: (
    self: StyleCommand & { data: ArgsToData<TArgs> },
    data: ArgsToData<TArgs>,
  ) => string;
}): FactoryClass<StyleCommand, StyleCommandClass, TArgs> {
  return class extends StyleCommand {
    static readonly type = config.type;
    static readonly alt = config.alt ?? [];
    static readonly args = config.args as unknown as StyleArgDef[];
    readonly data: ArgsToData<TArgs>;
    constructor(data: ArgsToData<TArgs>) {
      super();
      this.data = data;
    }
    applyStyle(style: Partial<Style>) {
      config.applyStyle(style, this.data);
    }
    static parse(name: string, parts: string[]) {
      return config.parse
        ? config.parse(name, parts)
        : super.parse(name, parts);
    }
    serialize() {
      return config.serialize
        ? config.serialize(this, this.data)
        : super.serialize();
    }
  };
}

export function defineGlobalCommand<
  const TArgs extends readonly ArgDef[],
>(config: {
  type: string;
  alt?: string[];
  args: TArgs;
  applyGlobal: (options: Partial<Options>, data: ArgsToData<TArgs>) => void;
  parse?: (name: string, parts: string[]) => GlobalCommand;
  serialize?: (
    self: GlobalCommand & { data: ArgsToData<TArgs> },
    data: ArgsToData<TArgs>,
  ) => string;
}): FactoryClass<GlobalCommand, GlobalCommandClass, TArgs> {
  return class Cmd extends GlobalCommand {
    static readonly type = config.type;
    static readonly alt = config.alt ?? [];
    static readonly args = config.args as unknown as ArgDef[];
    readonly data: ArgsToData<TArgs>;
    constructor(data: ArgsToData<TArgs>) {
      super();
      this.data = data;
    }
    applyGlobal(options: Partial<Options>) {
      config.applyGlobal(options, this.data);
    }
    static parse(name: string, parts: string[]) {
      return config.parse
        ? config.parse(name, parts)
        : super.parse(name, parts);
    }
    serialize() {
      return config.serialize
        ? config.serialize(this, this.data)
        : super.serialize();
    }
  };
}

export function defineFeatureModifierCommand<
  const TArgs extends readonly ArgDef[],
>(config: {
  type: string;
  alt?: string[];
  args: TArgs;
  applyModifier: (modifiers: FeatureModifiers, data: ArgsToData<TArgs>) => void;
  parse?: (name: string, parts: string[]) => FeatureModifierCommand;
  serialize?: (
    self: FeatureModifierCommand & { data: ArgsToData<TArgs> },
    data: ArgsToData<TArgs>,
  ) => string;
}): FactoryClass<FeatureModifierCommand, FeatureModifierCommandClass, TArgs> {
  return class Cmd extends FeatureModifierCommand {
    static readonly type = config.type;
    static readonly alt = config.alt ?? [];
    static readonly args = config.args as unknown as ArgDef[];
    readonly data: ArgsToData<TArgs>;
    constructor(data: ArgsToData<TArgs>) {
      super();
      this.data = data;
    }
    applyModifier(modifiers: FeatureModifiers) {
      config.applyModifier(modifiers, this.data);
    }
    static parse(name: string, parts: string[]) {
      return config.parse
        ? config.parse(name, parts)
        : super.parse(name, parts);
    }
    serialize() {
      return config.serialize
        ? config.serialize(this, this.data)
        : super.serialize();
    }
  };
}

export function defineFeatureCommand<
  const TArgs extends readonly ArgDef[],
>(config: {
  type: string;
  alt?: string[];
  args: TArgs;
  buildFeature: (state: BuildState, data: ArgsToData<TArgs>) => Feature;
  parse?: (name: string, parts: string[]) => FeatureCommand;
  serialize?: (
    self: FeatureCommand & { data: ArgsToData<TArgs> },
    data: ArgsToData<TArgs>,
  ) => string;
}): FactoryClass<FeatureCommand, FeatureCommandClass, TArgs> {
  return class Cmd extends FeatureCommand {
    static readonly type = config.type;
    static readonly alt = config.alt ?? [];
    static readonly args = config.args as unknown as ArgDef[];
    readonly data: ArgsToData<TArgs>;
    constructor(data: ArgsToData<TArgs>) {
      super();
      this.data = data;
    }
    buildFeature(state: BuildState) {
      return config.buildFeature(state, this.data);
    }
    static parse(name: string, parts: string[]) {
      return config.parse
        ? config.parse(name, parts)
        : super.parse(name, parts);
    }
    serialize() {
      return config.serialize
        ? config.serialize(this, this.data)
        : super.serialize();
    }
  };
}
