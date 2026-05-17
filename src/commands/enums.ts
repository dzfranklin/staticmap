import z from "zod";

export const LabelAnchorSchema = z.enum([
  "center",
  "left",
  "right",
  "top",
  "bottom",
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
]);

export type LabelAnchor = z.infer<typeof LabelAnchorSchema>;
