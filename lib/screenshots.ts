import { promises as fs } from "node:fs";
import path from "node:path";
import { MAX_SCREENSHOT_BYTES } from "@/lib/config";
import type { Screenshot } from "@/lib/types";

/**
 * Live scan screenshots travel inline in the response because the hosting
 * filesystem is read only at runtime. Oversized captures are dropped rather
 * than truncated so a report never carries a corrupt image.
 */
export function toScreenshot(buffer: Buffer, url: string, id: string): Screenshot | null {
  if (buffer.byteLength > MAX_SCREENSHOT_BYTES) return null;
  return {
    id,
    url,
    capturedAt: new Date().toISOString(),
    source: "inline",
    dataUrl: `data:image/jpeg;base64,${buffer.toString("base64")}`,
  };
}

export async function persistForDev(
  scanId: string,
  id: string,
  buffer: Buffer,
): Promise<string | undefined> {
  if (process.env.NODE_ENV === "production") return undefined;
  const directory = path.join(process.cwd(), "reports", scanId);
  await fs.mkdir(directory, { recursive: true });
  const file = path.join(directory, `${id}.jpg`);
  await fs.writeFile(file, buffer);
  return file;
}
