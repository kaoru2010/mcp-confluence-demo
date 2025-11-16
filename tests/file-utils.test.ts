import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as path from "node:path";
import {
  fileExists,
  listFiles,
  readJsonFile,
  writeJsonFile,
  sanitizePathSegment,
  guessContentType,
  computeSha256,
  getRelativePath,
} from "../src/file-utils.js";

// fsモジュールをモック
vi.mock("node:fs/promises", () => {
  const mockAccessFn = vi.fn();
  const mockReaddirFn = vi.fn();
  const mockReadFileFn = vi.fn();
  const mockWriteFileFn = vi.fn();
  const mockMkdirFn = vi.fn();
  const mockUnlinkFn = vi.fn();

  // グローバルにアクセスできるようにする
  (globalThis as { mockAccess?: typeof mockAccessFn }).mockAccess = mockAccessFn;
  (globalThis as { mockReaddir?: typeof mockReaddirFn }).mockReaddir = mockReaddirFn;
  (globalThis as { mockReadFile?: typeof mockReadFileFn }).mockReadFile = mockReadFileFn;
  (globalThis as { mockWriteFile?: typeof mockWriteFileFn }).mockWriteFile = mockWriteFileFn;
  (globalThis as { mockMkdir?: typeof mockMkdirFn }).mockMkdir = mockMkdirFn;
  (globalThis as { mockUnlink?: typeof mockUnlinkFn }).mockUnlink = mockUnlinkFn;

  return {
    default: {
      access: mockAccessFn,
      readdir: mockReaddirFn,
      readFile: mockReadFileFn,
      writeFile: mockWriteFileFn,
      mkdir: mockMkdirFn,
      unlink: mockUnlinkFn,
    },
    access: mockAccessFn,
    readdir: mockReaddirFn,
    readFile: mockReadFileFn,
    writeFile: mockWriteFileFn,
    mkdir: mockMkdirFn,
    unlink: mockUnlinkFn,
  };
});

// モック関数を取得
const getMockAccess = () => (globalThis as { mockAccess?: ReturnType<typeof vi.fn> }).mockAccess!;
const getMockReaddir = () => (globalThis as { mockReaddir?: ReturnType<typeof vi.fn> }).mockReaddir!;
const getMockReadFile = () => (globalThis as { mockReadFile?: ReturnType<typeof vi.fn> }).mockReadFile!;
const getMockWriteFile = () => (globalThis as { mockWriteFile?: ReturnType<typeof vi.fn> }).mockWriteFile!;
const getMockMkdir = () => (globalThis as { mockMkdir?: ReturnType<typeof vi.fn> }).mockMkdir!;
const getMockUnlink = () => (globalThis as { mockUnlink?: ReturnType<typeof vi.fn> }).mockUnlink!;

describe("file-utils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("fileExists", () => {
    it("should return true when file exists", async () => {
      const mockAccess = getMockAccess();
      mockAccess.mockResolvedValue(undefined);
      const result = await fileExists("/path/to/file.txt");
      expect(result).toBe(true);
      expect(mockAccess).toHaveBeenCalledWith("/path/to/file.txt");
    });

    it("should return false when file does not exist (ENOENT)", async () => {
      const mockAccess = getMockAccess();
      const error = new Error("File not found");
      (error as { code?: string }).code = "ENOENT";
      mockAccess.mockRejectedValue(error);
      const result = await fileExists("/path/to/nonexistent.txt");
      expect(result).toBe(false);
    });

    it("should throw error for other access errors", async () => {
      const mockAccess = getMockAccess();
      const error = new Error("Permission denied");
      (error as { code?: string }).code = "EACCES";
      mockAccess.mockRejectedValue(error);
      await expect(fileExists("/path/to/file.txt")).rejects.toThrow(
        "Permission denied",
      );
    });
  });

  describe("listFiles", () => {
    it("should return list of files in directory", async () => {
      const mockReaddir = getMockReaddir();
      const mockFiles = ["file1.txt", "file2.txt", "file3.txt"];
      mockReaddir.mockResolvedValue(mockFiles as never);
      const result = await listFiles("/path/to/dir");
      expect(result).toEqual(mockFiles);
      expect(mockReaddir).toHaveBeenCalledWith("/path/to/dir");
    });

    it("should return empty array when directory does not exist (ENOENT)", async () => {
      const mockReaddir = getMockReaddir();
      const error = new Error("Directory not found");
      (error as { code?: string }).code = "ENOENT";
      mockReaddir.mockRejectedValue(error);
      const result = await listFiles("/path/to/nonexistent");
      expect(result).toEqual([]);
    });

    it("should throw error for other readdir errors", async () => {
      const mockReaddir = getMockReaddir();
      const error = new Error("Permission denied");
      (error as { code?: string }).code = "EACCES";
      mockReaddir.mockRejectedValue(error);
      await expect(listFiles("/path/to/dir")).rejects.toThrow(
        "Permission denied",
      );
    });
  });

  describe("readJsonFile", () => {
    it("should read and parse JSON file", async () => {
      const mockReadFile = getMockReadFile();
      const jsonData = { name: "test", value: 123 };
      mockReadFile.mockResolvedValue(JSON.stringify(jsonData));
      const result = await readJsonFile<{ name: string; value: number }>(
        "/path/to/file.json",
      );
      expect(result).toEqual(jsonData);
      expect(mockReadFile).toHaveBeenCalledWith("/path/to/file.json", "utf-8");
    });

    it("should return null when file does not exist (ENOENT)", async () => {
      const mockReadFile = getMockReadFile();
      const error = new Error("File not found");
      (error as { code?: string }).code = "ENOENT";
      mockReadFile.mockRejectedValue(error);
      const result = await readJsonFile("/path/to/nonexistent.json");
      expect(result).toBeNull();
    });

    it("should throw error for invalid JSON", async () => {
      const mockReadFile = getMockReadFile();
      mockReadFile.mockResolvedValue("invalid json {");
      await expect(readJsonFile("/path/to/invalid.json")).rejects.toThrow();
    });
  });

  describe("writeJsonFile", () => {
    it("should write JSON file with proper formatting", async () => {
      const mockWriteFile = getMockWriteFile();
      const data = { name: "test", value: 123 };
      mockWriteFile.mockResolvedValue(undefined);
      await writeJsonFile("/path/to/file.json", data);
      expect(mockWriteFile).toHaveBeenCalledWith(
        "/path/to/file.json",
        expect.stringContaining('"name": "test"'),
        "utf-8",
      );
      // 末尾に改行が含まれていることを確認
      const callArgs = mockWriteFile.mock.calls[0];
      if (callArgs && callArgs[1]) {
        const content = callArgs[1] as string;
        expect(content.endsWith("\n")).toBe(true);
      }
    });

    it("should format JSON with 2-space indentation", async () => {
      const mockWriteFile = getMockWriteFile();
      const data = { nested: { key: "value" } };
      mockWriteFile.mockResolvedValue(undefined);
      await writeJsonFile("/path/to/file.json", data);
      const callArgs = mockWriteFile.mock.calls[0];
      if (callArgs && callArgs[1]) {
        const content = callArgs[1] as string;
        // 2スペースのインデントが含まれていることを確認
        expect(content).toContain("  \"nested\"");
      }
    });
  });

  describe("sanitizePathSegment", () => {
    it("should replace invalid path characters with dash", () => {
      expect(sanitizePathSegment("file<>name")).toBe("file--name");
      expect(sanitizePathSegment("file:name")).toBe("file-name");
      expect(sanitizePathSegment("file/name")).toBe("file-name");
      expect(sanitizePathSegment("file\\name")).toBe("file-name");
      expect(sanitizePathSegment("file|name")).toBe("file-name");
      expect(sanitizePathSegment("file?name")).toBe("file-name");
      expect(sanitizePathSegment("file*name")).toBe("file-name");
    });

    it("should preserve valid characters", () => {
      expect(sanitizePathSegment("valid-name_123")).toBe("valid-name_123");
      expect(sanitizePathSegment("file.txt")).toBe("file.txt");
    });
  });

  describe("guessContentType", () => {
    it("should return correct content type for image files", () => {
      expect(guessContentType("image.png")).toBe("image/png");
      expect(guessContentType("image.jpg")).toBe("image/jpeg");
      expect(guessContentType("image.jpeg")).toBe("image/jpeg");
      expect(guessContentType("image.gif")).toBe("image/gif");
      expect(guessContentType("image.webp")).toBe("image/webp");
      expect(guessContentType("image.svg")).toBe("image/svg+xml");
    });

    it("should return correct content type for document files", () => {
      expect(guessContentType("doc.pdf")).toBe("application/pdf");
      expect(guessContentType("text.txt")).toBe("text/plain");
      expect(guessContentType("readme.md")).toBe("text/markdown");
      expect(guessContentType("page.html")).toBe("application/xhtml+xml");
      expect(guessContentType("page.xhtml")).toBe("application/xhtml+xml");
    });

    it("should return default content type for unknown extensions", () => {
      expect(guessContentType("file.unknown")).toBe("application/octet-stream");
      expect(guessContentType("file")).toBe("application/octet-stream");
    });

    it("should handle case-insensitive extensions", () => {
      expect(guessContentType("IMAGE.PNG")).toBe("image/png");
      expect(guessContentType("Image.Jpg")).toBe("image/jpeg");
    });
  });

  describe("computeSha256", () => {
    it("should compute SHA256 hash from string", () => {
      const result = computeSha256("test");
      expect(result).toBe(
        "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      );
    });

    it("should compute SHA256 hash from Buffer", () => {
      const buffer = Buffer.from("test", "utf-8");
      const result = computeSha256(buffer);
      expect(result).toBe(
        "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      );
    });

    it("should produce same hash for same input", () => {
      const input = "same input";
      const hash1 = computeSha256(input);
      const hash2 = computeSha256(input);
      expect(hash1).toBe(hash2);
    });
  });

  describe("getRelativePath", () => {
    it("should return relative path from base directory", () => {
      const result = getRelativePath("/base", "/base/sub/file.txt");
      expect(result).toBe("sub/file.txt");
    });

    it("should return '.' when paths are the same", () => {
      const result = getRelativePath("/base", "/base");
      expect(result).toBe(".");
    });

    it("should handle parent directory references", () => {
      const result = getRelativePath("/base/sub", "/base");
      expect(result).toBe("..");
    });
  });
});


