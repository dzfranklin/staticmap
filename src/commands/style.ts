import { z } from "zod";
import type { Style } from "../style.js";
import { styleArg as arg, defineStyleCommand } from "./base.js";
import type { StyleCommandClass } from "./base.js";
import type { LabelAnchor } from "../style.js";
import { LabelAnchorSchema } from "./enums.js";
import { ParseError } from "../errors.js";

export const ColorCommand = defineStyleCommand({
  type: "color",
  args: [arg("value", z.string(), "#000000")] as const,
  applyStyle: (style, { value }) => {
    style.color = value;
  },
});
export type ColorCommand = InstanceType<typeof ColorCommand>;

export const WidthCommand = defineStyleCommand({
  type: "width",
  args: [arg("value", z.number(), 4)] as const,
  applyStyle: (style, { value }) => {
    style.width = value;
  },
});
export type WidthCommand = InstanceType<typeof WidthCommand>;

export const BorderColorCommand = defineStyleCommand({
  type: "borderColor",
  alt: ["border"],
  args: [arg("value", z.string(), "#000000")] as const,
  applyStyle: (style, { value }) => {
    style.borderColor = value;
  },
});
export type BorderColorCommand = InstanceType<typeof BorderColorCommand>;

export const BorderWidthCommand = defineStyleCommand({
  type: "borderWidth",
  args: [arg("value", z.number(), 0)] as const,
  applyStyle: (style, { value }) => {
    style.borderWidth = value === 0 ? undefined : value;
  },
});
export type BorderWidthCommand = InstanceType<typeof BorderWidthCommand>;

export const LineDasharrayCommand = defineStyleCommand({
  type: "lineDasharray",
  alt: ["dash"],
  args: [arg("values", z.number(), [] as number[], { rest: true })] as const,
  applyStyle: (style, { values }) => {
    if (values.some((v) => v <= 0))
      throw new ParseError("values must be positive");
    if (values.length === 0) {
      style.lineDasharray = undefined;
    } else {
      style.lineDasharray = values;
      if (style.lineCap === "round") style.lineCap = "butt";
    }
  },
  serialize: (self, { values }) => {
    const prefix = self.parsedAs ?? self.type;
    return values.length ? `${prefix}:${values.join(":")}` : prefix;
  },
});
export type LineDasharrayCommand = InstanceType<typeof LineDasharrayCommand>;

export const CapCommand = defineStyleCommand({
  type: "cap",
  args: [arg("value", z.enum(["butt", "round", "square"]), "round")] as const,
  applyStyle: (style, { value }) => {
    style.lineCap = value;
  },
});
export type CapCommand = InstanceType<typeof CapCommand>;

export const JoinCommand = defineStyleCommand({
  type: "join",
  args: [arg("value", z.enum(["round", "bevel", "miter"]), "round")] as const,
  applyStyle: (style, { value }) => {
    style.lineJoin = value;
  },
});
export type JoinCommand = InstanceType<typeof JoinCommand>;

export const LabelColorCommand = defineStyleCommand({
  type: "labelColor",
  args: [arg("value", z.string(), "#000000")] as const,
  applyStyle: (style, { value }) => {
    style.labelColor = value;
  },
});
export type LabelColorCommand = InstanceType<typeof LabelColorCommand>;

export const LabelAnchorCommand = defineStyleCommand({
  type: "labelAnchor",
  args: [arg("value", LabelAnchorSchema, "bottom" as LabelAnchor)] as const,
  applyStyle: (style, { value }) => {
    style.labelAnchor = value;
  },
});
export type LabelAnchorCommand = InstanceType<typeof LabelAnchorCommand>;

export const LabelOffsetCommand = defineStyleCommand({
  type: "labelOffset",
  args: [arg("value", z.number(), 2)] as const,
  applyStyle: (style, { value }) => {
    style.labelOffset = value;
  },
});
export type LabelOffsetCommand = InstanceType<typeof LabelOffsetCommand>;

export const LabelSizeCommand = defineStyleCommand({
  type: "labelSize",
  args: [arg("value", z.number(), 16)] as const,
  applyStyle: (style, { value }) => {
    style.labelSize = value;
  },
});
export type LabelSizeCommand = InstanceType<typeof LabelSizeCommand>;

export const LabelHaloWidthCommand = defineStyleCommand({
  type: "labelHaloWidth",
  args: [arg("value", z.number(), 0)] as const,
  applyStyle: (style, { value }) => {
    style.labelHaloWidth = value;
  },
});
export type LabelHaloWidthCommand = InstanceType<typeof LabelHaloWidthCommand>;

export const LabelHaloColorCommand = defineStyleCommand({
  type: "labelHaloColor",
  args: [arg("value", z.string(), "#ffffff")] as const,
  applyStyle: (style, { value }) => {
    style.labelHaloColor = value;
  },
});
export type LabelHaloColorCommand = InstanceType<typeof LabelHaloColorCommand>;

export const STYLE_COMMANDS: StyleCommandClass[] = [
  ColorCommand,
  WidthCommand,
  BorderColorCommand,
  BorderWidthCommand,
  LineDasharrayCommand,
  CapCommand,
  JoinCommand,
  LabelColorCommand,
  LabelAnchorCommand,
  LabelOffsetCommand,
  LabelSizeCommand,
  LabelHaloWidthCommand,
  LabelHaloColorCommand,
];

export const DEFAULT_STYLE: Style = (() => {
  const style = {} as Style;
  for (const C of STYLE_COMMANDS) {
    C.default().applyStyle(style);
  }
  return style;
})();
