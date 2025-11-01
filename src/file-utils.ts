import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error) {
      const code = (error as { code?: string }).code;
      if (code === "ENOENT") {
        return false;
      }
    }
    throw error;
  }
}

export async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error) {
      const code = (error as { code?: string }).code;
      if (code === "ENOENT") {
        return null;
      }
    }
    throw error;
  }
}

export async function writeJsonFile(
  filePath: string,
  data: unknown,
): Promise<void> {
  const content = `${JSON.stringify(data, null, 2)}\n`;
  await fs.writeFile(filePath, content, "utf-8");
}

export async function safeUnlink(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error) {
      const code = (error as { code?: string }).code;
      if (code === "ENOENT") {
        return;
      }
    }
    throw error;
  }
}

export async function listFiles(dirPath: string): Promise<string[]> {
  try {
    return await fs.readdir(dirPath);
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error) {
      const code = (error as { code?: string }).code;
      if (code === "ENOENT") {
        return [];
      }
    }
    throw error;
  }
}

export function computeSha256(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

export async function computeFileSha256(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  return computeSha256(buffer);
}

export function sanitizePathSegment(segment: string): string {
  return segment.replace(/[<>:"/\\|?*]/g, "-");
}

export function getRelativePath(baseDir: string, targetPath: string): string {
  const relative = path.relative(baseDir, targetPath);
  if (!relative) {
    return ".";
  }
  return relative;
}

export function guessContentType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  switch (ext) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    case ".pdf":
      return "application/pdf";
    case ".txt":
      return "text/plain";
    case ".md":
      return "text/markdown";
    case ".html":
    case ".xhtml":
      return "application/xhtml+xml";
    default:
      return "application/octet-stream";
  }
}

export async function readBinaryFile(filePath: string): Promise<Buffer> {
  return fs.readFile(filePath);
}

export async function writeTextFile(
  filePath: string,
  content: string,
): Promise<void> {
  await fs.writeFile(filePath, content, "utf-8");
}
