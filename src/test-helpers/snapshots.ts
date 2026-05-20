import fs from "fs";
import path from "path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
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

const snapshotUpdateMode: "missing-only" | "all" | "none" =
  process.env.UPDATE_ALL_SNAPSHOTS === "1"
    ? "all"
    : process.env.UPDATE_NEW_SNAPSHOTS === "1"
      ? "missing-only"
      : "none";

export function assertVisualSnapshot(
  snapshotDir: string,
  name: string,
  buffer: Buffer,
): void {
  const failureArtifactDir = path.join(snapshotDir, "__artifacts__");
  const result = snapshotTest(snapshotDir, name, buffer);
  if (!result.success) {
    if (!result.expected && snapshotUpdateMode !== "none") {
      writeSnapshot(snapshotDir, name, buffer);
      console.warn(`Created new snapshot for ${name}`);
      return;
    } else if (snapshotUpdateMode === "all") {
      writeSnapshot(snapshotDir, name, buffer);
      console.warn(`Updated snapshot for ${name}`);
      return;
    }

    writeSnapshotFailureArtifacts(failureArtifactDir, result);
  }

  expect(result.success, result.message).toBe(true);

  if (result.success && result.diffPixels) {
    console.warn(
      `Snapshot for ${name} has ${result.diffPixels} differing pixels. ` +
        `Consider updating the snapshot if this change is expected.`,
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
        message: `Missing snapshot for ${name}. Run with UPDATE_NEW_SNAPSHOTS=1 to create it.`,
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
      `Expected ${r.expected.width}x${r.expected.height}, got ${r.actual.width}x${r.actual.height}.`;
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
      `exceeding the threshold of ${(maxDiffRatio * 100).toFixed(2)}%.`;
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
  if (r.expected) {
    fs.writeFileSync(expectedPath, PNG.sync.write(r.expected));
    console.warn(`[${r.name}] Wrote expected image to ${expectedPath}`);
  }
  if (r.actual) {
    fs.writeFileSync(actualPath, PNG.sync.write(r.actual));
    console.warn(`[${r.name}] Wrote actual image to ${actualPath}`);
  }
  if (r.diff) {
    fs.writeFileSync(diffPath, PNG.sync.write(r.diff));
    console.warn(`[${r.name}] Wrote diff image to ${diffPath}`);
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
