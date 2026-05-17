import { z } from "zod";
import type { Feature } from "../staticmap.js";
import { decodePolyline } from "../polyline.js";
import { ParseError } from "../errors.js";
import {
  arg,
  defineFeatureModifierCommand,
  defineFeatureCommand,
} from "./base.js";
import type {
  FeatureModifiers,
  BuildState,
  FeatureModifierCommandClass,
  FeatureCommandClass,
} from "./base.js";
export type { LngLat } from "../polyline.js";

export const LabelCommand = defineFeatureModifierCommand({
  type: "label",
  example: ["Summit"],
  args: [arg("value", z.string())] as const,
  applyModifier: (modifiers, { value }) => {
    modifiers.label = value;
  },
});
export type LabelCommand = InstanceType<typeof LabelCommand>;

export const LineCommand = defineFeatureCommand({
  type: "line",
  example: ["miv{IrbzUvBwDtCeA~BwB~E{G~IyQlBaIvDyHlHuFpAkBhFuK~@q@Z}BjDsG"],
  args: [arg("value", z.string())] as const,
  buildFeature: ({ style }, { value }) => {
    const path = decodePolyline(value);
    if (path.length < 2) {
      throw new ParseError("Polyline must contain at least two points");
    }
    return { kind: "line", path, style: { ...style } };
  },
});
export type LineCommand = InstanceType<typeof LineCommand>;

export const LineWithPrecisionCommand = defineFeatureCommand({
  type: "line",
  example: [5, "miv{IrbzUvBwDtCeA~BwB~E{G~IyQlBaIvDyHlHuFpAkBhFuK~@q@Z}BjDsG"],
  args: [arg("precision", z.number()), arg("value", z.string())] as const,
  buildFeature: ({ style }, { precision, value }) => {
    const path = decodePolyline(value, precision);
    if (path.length < 2) {
      throw new ParseError("Polyline must contain at least two points");
    }
    return { kind: "line", path, style: { ...style } };
  },
});
export type LineWithPrecisionCommand = InstanceType<
  typeof LineWithPrecisionCommand
>;

export const PointCommand = defineFeatureCommand({
  type: "point",
  example: [-0.118, 51.509],
  args: [arg("lng", z.number()), arg("lat", z.number())] as const,
  buildFeature: ({ style, modifiers }, { lng, lat }) => ({
    kind: "point",
    lng,
    lat,
    style: { ...style },
    label: modifiers.label,
  }),
});
export type PointCommand = InstanceType<typeof PointCommand>;

export const FEATURE_MODIFIER_COMMANDS: FeatureModifierCommandClass[] = [
  LabelCommand,
];

export const FEATURE_COMMANDS: FeatureCommandClass[] = [
  LineCommand,
  LineWithPrecisionCommand,
  PointCommand,
];
