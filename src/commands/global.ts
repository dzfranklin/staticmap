import { z } from "zod";
import type { Options } from "../staticmap.js";
import { arg, defineGlobalCommand } from "./base.js";
import type { GlobalCommandClass } from "./base.js";

export const SizeCommand = defineGlobalCommand({
  type: "size",
  example: [600, 400],
  args: [arg("width", z.number()), arg("height", z.number())] as const,
  applyGlobal: (options, { width, height }) => {
    options.size = { width, height };
  },
});
export type SizeCommand = InstanceType<typeof SizeCommand>;

export const PaddingCommand = defineGlobalCommand({
  type: "padding",
  example: [48],
  args: [arg("value", z.number())] as const,
  applyGlobal: (options, { value }) => {
    options.padding = value;
  },
});
export type PaddingCommand = InstanceType<typeof PaddingCommand>;

export const ZoomCommand = defineGlobalCommand({
  type: "zoom",
  example: [14],
  args: [arg("value", z.number())] as const,
  applyGlobal: (options, { value }) => {
    options.zoom = value;
  },
});
export type ZoomCommand = InstanceType<typeof ZoomCommand>;

export const CenterCommand = defineGlobalCommand({
  type: "center",
  example: [-0.118, 51.509],
  args: [arg("lng", z.number()), arg("lat", z.number())] as const,
  applyGlobal: (options, { lng, lat }) => {
    options.center = { lng, lat };
  },
});
export type CenterCommand = InstanceType<typeof CenterCommand>;

export const PageOverlapCommand = defineGlobalCommand({
  type: "pageOverlap",
  example: [50],
  args: [arg("value", z.number())] as const,
  applyGlobal: (options, { value }) => {
    options.pageOverlap = value;
  },
});
export type PageOverlapCommand = InstanceType<typeof PageOverlapCommand>;

export const DebugCommand = defineGlobalCommand({
  type: "debug",
  args: [] as const,
  applyGlobal: (options) => {
    options.debug = true;
  },
});
export type DebugCommand = InstanceType<typeof DebugCommand>;

export const GLOBAL_COMMANDS = [
  SizeCommand,
  PaddingCommand,
  ZoomCommand,
  CenterCommand,
  PageOverlapCommand,
  DebugCommand,
] satisfies GlobalCommandClass[];
