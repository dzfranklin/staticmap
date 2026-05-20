export type Doc = InstanceType<typeof import("pdfkit")>;

export const PT_PER_MM = 72 / 25.4;

/** Convert millimeters to PDF points */
export function mm(mm: number) {
  return mm * PT_PER_MM;
}
