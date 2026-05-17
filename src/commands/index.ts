export * from "./base.js";
export * from "./style.js";
export * from "./global.js";
export * from "./feature.js";

import type { CommandClass } from "./base.js";
import { FEATURE_COMMANDS, FEATURE_MODIFIER_COMMANDS } from "./feature.js";
import { GLOBAL_COMMANDS } from "./global.js";
import { STYLE_COMMANDS } from "./style.js";

export const ALL_COMMANDS: CommandClass[] = [
  ...STYLE_COMMANDS,
  ...GLOBAL_COMMANDS,
  ...FEATURE_MODIFIER_COMMANDS,
  ...FEATURE_COMMANDS,
];
