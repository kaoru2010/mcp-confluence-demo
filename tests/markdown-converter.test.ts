import { describe, it, expect } from "vitest";
import { MarkdownConverter } from "../src/markdown-converter.js";

describe("MarkdownConverter", () => {
  const converter = new MarkdownConverter();

  describe("toMarkdown", () => {
    it("should convert simple paragraph from Confluence Storage Format to Markdown", () => {
      const storageFormat = "<p>Hello, World!</p>";
      const result = converter.toMarkdown(storageFormat);
      expect(result).toContain("Hello, World!");
      expect(result.trim()).toBe("Hello, World!");
    });

    it("should convert heading from Confluence Storage Format to Markdown", () => {
      const storageFormat = "<h1>Title</h1>";
      const result = converter.toMarkdown(storageFormat);
      expect(result.trim()).toBe("# Title");
    });

    it("should clean up excessive blank lines", () => {
      const storageFormat = "<p>Line 1</p><p>Line 2</p><p>Line 3</p>";
      const result = converter.toMarkdown(storageFormat);
      // 余分な空行が整理されていることを確認
      const lines = result.split("\n").filter((line) => line.trim() !== "");
      expect(lines.length).toBeGreaterThan(0);
    });

    it("should handle Confluence macro and convert to comment", () => {
      const storageFormat =
        '<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">javascript</ac:parameter><ac:plain-text-body><![CDATA[console.log("test");]]></ac:plain-text-body></ac:structured-macro>';
      const result = converter.toMarkdown(storageFormat);
      expect(result).toContain("Confluence Macro");
      expect(result).toContain("code");
    });
  });

  describe("extractImageReferences", () => {
    it("should extract image references from Markdown format", () => {
      const markdown = '![alt text](./images/test.png)';
      const baseDir = "/tmp";
      const result = converter.extractImageReferences(markdown, baseDir);

      expect(result).toHaveLength(1);
      expect(result[0]?.alt).toBe("alt text");
      expect(result[0]?.originalPath).toBe("./images/test.png");
      expect(result[0]?.resolvedPath).toContain("test.png");
    });

    it("should extract image references from HTML format", () => {
      const markdown = '<img src="./images/photo.jpg" alt="Photo" width="100" height="200">';
      const baseDir = "/tmp";
      const result = converter.extractImageReferences(markdown, baseDir);

      expect(result).toHaveLength(1);
      expect(result[0]?.alt).toBe("Photo");
      expect(result[0]?.originalPath).toBe("./images/photo.jpg");
      expect(result[0]?.attributes?.width).toBe(100);
      expect(result[0]?.attributes?.height).toBe(200);
    });

    it("should extract multiple image references", () => {
      const markdown =
        '![img1](./img1.png)\n![img2](./img2.png)\n<img src="./img3.jpg" alt="img3">';
      const baseDir = "/tmp";
      const result = converter.extractImageReferences(markdown, baseDir);

      expect(result).toHaveLength(3);
    });

    it("should exclude HTTP/HTTPS URLs", () => {
      const markdown =
        '![local](./local.png)\n![remote](https://example.com/image.png)';
      const baseDir = "/tmp";
      const result = converter.extractImageReferences(markdown, baseDir);

      expect(result).toHaveLength(1);
      expect(result[0]?.originalPath).toBe("./local.png");
    });

    it("should handle images without alt text", () => {
      const markdown = '![](./no-alt.png)';
      const baseDir = "/tmp";
      const result = converter.extractImageReferences(markdown, baseDir);

      expect(result).toHaveLength(1);
      expect(result[0]?.alt).toBe("");
    });
  });

  describe("replaceImageTagsWithMacros", () => {
    it("should replace HTML img tag with Confluence macro", () => {
      const html = '<img src="./test.png" alt="Test Image">';
      const imageMap = new Map<string, string>([["./test.png", "test.png"]]);
      const result = converter.replaceImageTagsWithMacros(html, imageMap);

      expect(result).toContain("<ac:image>");
      expect(result).toContain('ri:filename="test.png"');
    });

    it("should preserve width and height attributes in macro", () => {
      const html = '<img src="./test.png" width="100" height="200" alt="Test">';
      const imageMap = new Map<string, string>([["./test.png", "test.png"]]);
      const result = converter.replaceImageTagsWithMacros(html, imageMap);

      expect(result).toContain('ac:width="100"');
      expect(result).toContain('ac:height="200"');
    });

    it("should not replace img tags with HTTP/HTTPS URLs", () => {
      const html = '<img src="https://example.com/image.png" alt="Remote">';
      const imageMap = new Map<string, string>();
      const result = converter.replaceImageTagsWithMacros(html, imageMap);

      expect(result).toContain("https://example.com/image.png");
      expect(result).not.toContain("<ac:image>");
    });

    it("should handle multiple img tags", () => {
      const html =
        '<img src="./img1.png" alt="1"><img src="./img2.png" alt="2">';
      const imageMap = new Map<string, string>([
        ["./img1.png", "img1.png"],
        ["./img2.png", "img2.png"],
      ]);
      const result = converter.replaceImageTagsWithMacros(html, imageMap);

      expect(result).toContain("img1.png");
      expect(result).toContain("img2.png");
      // 両方ともマクロに置換されていることを確認
      const macroCount = (result.match(/<ac:image>/g) || []).length;
      expect(macroCount).toBe(2);
    });

    it("should not replace img tags when image is not in map", () => {
      const html = '<img src="./unknown.png" alt="Unknown">';
      const imageMap = new Map<string, string>();
      const result = converter.replaceImageTagsWithMacros(html, imageMap);

      expect(result).toContain("./unknown.png");
      expect(result).not.toContain("<ac:image>");
    });
  });
});


