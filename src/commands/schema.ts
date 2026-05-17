import z from "zod";
import { ALL_COMMANDS, StyleArgDef } from "./index.js";
import type { ExampleValue } from "./base.js";

export interface Schema {
  commands: CommandSchema[];
}

export interface CommandSchema {
  category: string;
  type: string;
  alt: string[];
  args: ArgSchema[];
  example?: readonly ExampleValue[];
}

export interface ArgSchema {
  name: string;
  schema: ArgSchemaType;
  rest?: boolean;
  default?: ArgDefaultType;
}

export type ArgSchemaType =
  | { type: "string" }
  | { type: "number" }
  | { type: "enum"; values: string[] };

export type ArgDefaultType = string | number | Array<ArgDefaultType>;

const commands = ALL_COMMANDS.map(
  (Cls): CommandSchema => ({
    category: Cls.category,
    type: Cls.type,
    alt: Cls.alt,
    example: Cls.example,
    args: Cls.args.map((arg) => {
      const { name, schema, rest } = arg;

      let argSchema: ArgSchemaType;
      if (schema instanceof z.ZodString) {
        argSchema = { type: "string" };
      } else if (schema instanceof z.ZodNumber) {
        argSchema = { type: "number" };
      } else if (schema instanceof z.ZodEnum) {
        argSchema = { type: "enum", values: schema.options };
      } else {
        throw new Error(`Unsupported schema type for argument "${name}"`);
      }

      let defaultValue: ArgDefaultType | undefined = undefined;
      if (Cls.category === "style") {
        const styleArg = arg as StyleArgDef;
        defaultValue = styleArg.default;
      }

      return { name, schema: argSchema, rest, default: defaultValue };
    }),
  }),
);

export default { commands } satisfies Schema;
