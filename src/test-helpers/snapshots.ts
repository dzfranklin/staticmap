import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import PDFDocument from "pdfkit";
import { registerFonts } from "../print/fonts.js";
import { expect } from "vitest";
export interface SnapshotResult {
  name: string;
  success: boolean;
  message?: string;
  expected?: PNG;
  actual?: PNG;
  diff?: PNG;
  diffPixels?: number;
}

const snapshotUpdateNames: Set<string> = new Set(
  process.env.UPDATE_SNAPSHOTS
    ? process.env.UPDATE_SNAPSHOTS.split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [],
);

export function assertVisualSnapshot(
  snapshotDir: string,
  name: string,
  buffer: Buffer,
): void {
  const failureArtifactDir = path.join(snapshotDir, "__artifacts__");
  const result = snapshotTest(snapshotDir, name, buffer);
  if (snapshotUpdateNames.has(name)) {
    writeSnapshot(snapshotDir, name, buffer);
    console.warn(`Updated snapshot for ${name}`);
    return;
  }

  if (!result.success) {
    writeSnapshotFailureArtifacts(failureArtifactDir, result);
    expect
      .soft(false, result.message ?? `Snapshot assertion failed for ${name}`)
      .toBe(true);
  } else if (result.diffPixels) {
    console.warn(
      `Snapshot for ${name} has ${result.diffPixels} differing pixels. ` +
        `Consider updating the snapshot if this change is expected. (UPDATE_SNAPSHOTS=${name})`,
    );
  }
}

export function snapshotTest(
  snapshotDir: string,
  name: string,
  buffer: Buffer,
  {
    threshold = 0.1,
    maxDiffRatio = 0.0003,
  }: { threshold?: number; maxDiffRatio?: number } = {},
): SnapshotResult {
  const r: SnapshotResult = { name, success: false };

  const snapshotPath = path.join(snapshotDir, `${name}.png`);
  try {
    r.expected = PNG.sync.read(fs.readFileSync(snapshotPath));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        ...r,
        message: `Missing snapshot for ${name}. Run with UPDATE_SNAPSHOTS=${name} to create it.`,
      };
    } else {
      throw err;
    }
  }

  r.actual = PNG.sync.read(buffer);
  if (
    r.expected.width !== r.actual.width ||
    r.expected.height !== r.actual.height
  ) {
    const message =
      `Snapshot size mismatch for ${name}. ` +
      `Expected ${r.expected.width}x${r.expected.height}, got ${r.actual.width}x${r.actual.height}. Run with UPDATE_SNAPSHOTS=${name} to update the snapshot if this change is expected.`;
    return { ...r, message };
  }

  r.diff = new PNG({ width: r.expected.width, height: r.expected.height });
  r.diffPixels = pixelmatch(
    r.expected.data,
    r.actual.data,
    r.diff.data,
    r.expected.width,
    r.expected.height,
    { threshold },
  );

  const totalPixels = r.expected.width * r.expected.height;
  const diffRatio = r.diffPixels / totalPixels;

  if (diffRatio > maxDiffRatio) {
    const message =
      `Snapshot mismatch for ${name}. ` +
      `${(diffRatio * 100).toFixed(2)}% of pixels differ (${r.diffPixels} pixels), ` +
      `exceeding the threshold of ${(maxDiffRatio * 100).toFixed(2)}%. If this change is expected, run UPDATE_SNAPSHOTS=${name} npm test.`;
    return { ...r, message };
  }

  return { ...r, success: true };
}

function writeSnapshotFailureArtifacts(
  failureArtifactDir: string,
  r: SnapshotResult,
): void {
  if (r.success) throw new Error("bad state: success");

  const expectedPath = path.join(failureArtifactDir, `${r.name}.expected.png`);
  const actualPath = path.join(failureArtifactDir, `${r.name}.actual.png`);
  const diffPath = path.join(failureArtifactDir, `${r.name}.diff.png`);

  fs.mkdirSync(failureArtifactDir, { recursive: true });
  const writtenFiles: string[] = [];
  if (r.expected) {
    fs.writeFileSync(expectedPath, PNG.sync.write(r.expected));
    writtenFiles.push(expectedPath);
  }
  if (r.actual) {
    fs.writeFileSync(actualPath, PNG.sync.write(r.actual));
    writtenFiles.push(actualPath);
  }
  if (r.diff) {
    fs.writeFileSync(diffPath, PNG.sync.write(r.diff));
    writtenFiles.push(diffPath);
  }
  console.error(
    `Snapshot test failed for ${r.name}. ` +
      `Wrote failure artifacts to:\n` +
      writtenFiles.map((f) => `  ${f}`).join("\n"),
  );
}

export function assertPDFPageSnapshot(
  snapshotDir: string,
  name: string,
  drawFn: (doc: InstanceType<typeof PDFDocument>) => void,
  widthMm: number,
  heightMm: number,
  dpi = 150,
): Promise<void> {
  const PT_PER_MM = 72 / 25.4;
  const doc = new PDFDocument({
    size: [widthMm * PT_PER_MM, heightMm * PT_PER_MM],
    margin: 0,
    autoFirstPage: true,
  });
  registerFonts(doc);
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<void>((resolve) =>
    doc.on("end", () => {
      const pdfBuffer = Buffer.concat(chunks);
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pdf-snapshot-"));
      try {
        const pdfPath = path.join(tmp, "page.pdf");
        fs.writeFileSync(pdfPath, pdfBuffer);
        execFileSync("pdftoppm", [
          "-r",
          String(dpi),
          "-png",
          "-f",
          "1",
          "-l",
          "1",
          pdfPath,
          path.join(tmp, "out"),
        ]);
        const png = fs.readFileSync(path.join(tmp, "out-1.png"));
        assertVisualSnapshot(snapshotDir, name, png);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
      resolve();
    }),
  );
  drawFn(doc);
  doc.end();
  return done;
}

function existingPDFSnapshotCount(snapshotDir: string, name: string): number {
  let count = 0;
  while (fs.existsSync(path.join(snapshotDir, `${name}.${count + 1}.png`)))
    count++;
  return count;
}

export function assertPDFSnapshot(
  snapshotDir: string,
  name: string,
  pdfBuffer: Buffer,
  dpi = 150,
): void {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pdf-snapshot-"));
  try {
    const pdfPath = path.join(tmp, "page.pdf");
    fs.writeFileSync(pdfPath, pdfBuffer);
    execFileSync("pdftoppm", [
      "-r",
      String(dpi),
      "-png",
      pdfPath,
      path.join(tmp, "out"),
    ]);
    const pngFiles = fs
      .readdirSync(tmp)
      .filter((f) => f.startsWith("out-") && f.endsWith(".png"))
      .sort();
    const existingCount = existingPDFSnapshotCount(snapshotDir, name);
    if (existingCount > 0) {
      expect(
        pngFiles.length,
        `Expected ${existingCount} pages but got ${pngFiles.length}`,
      ).toBe(existingCount);
    }
    for (let i = 0; i < pngFiles.length; i++) {
      const png = fs.readFileSync(path.join(tmp, pngFiles[i]!));
      assertVisualSnapshot(snapshotDir, `${name}.${i + 1}`, png);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function writeSnapshot(
  snapshotDir: string,
  name: string,
  buffer: Buffer,
): void {
  const snapshotPath = path.join(snapshotDir, `${name}.png`);
  fs.mkdirSync(snapshotDir, { recursive: true });
  fs.writeFileSync(snapshotPath, buffer);
}
