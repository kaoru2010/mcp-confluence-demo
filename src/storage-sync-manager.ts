import fs from "node:fs/promises";
import path from "node:path";
import { ConfluenceClient } from "./confluence-client.js";
import { ConfluenceClientError } from "./errors.js";
import {
  computeFileSha256,
  computeSha256,
  ensureDir,
  fileExists,
  guessContentType,
  readBinaryFile,
  readJsonFile,
  safeUnlink,
  sanitizePathSegment,
  writeJsonFile,
  writeTextFile,
} from "./file-utils.js";
import { logger } from "./logger.js";
import type {
  AttachmentMeta,
  AttachmentsDownloadResult,
  AttachmentsUploadResult,
  BodyDownloadResult,
  BodyUploadResult,
  ConfluenceConfig,
  ConfluenceDataPaths,
  IOOptions,
  PageMeta,
} from "./types.js";

interface AttachmentFilterOptions {
  includeTitles?: string[];
}

export class StorageSyncManager {
  private client: ConfluenceClient;

  constructor(private readonly config: ConfluenceConfig) {
    this.client = new ConfluenceClient(config);
  }

  /**
   * テーブルXHTMLに階層的なインデントと改行を追加して可読性を向上させる
   *
   * 階層構造の例:
   * <table>
   *   <tbody>
   *     <tr>
   *       <td>content</td>
   *       <th>content</th>
   *     </tr>
   *   </tbody>
   * </table>
   *
   * 注意: td/th タグ内のテキストコンテンツには影響を与えず、
   * タグ間の空白のみを操作します。
   */
  private formatTableXhtml(xhtml: string): string {
    let result = xhtml;

    // Step 1: table の開始タグの後に改行を追加（属性を考慮）
    result = result.replace(/(<table[^>]*>)/g, "$1\n");

    // Step 2: tbody/thead/tfoot の開始タグの後に改行を追加
    result = result.replace(/<tbody>/g, "<tbody>\n  ");
    result = result.replace(/<thead>/g, "<thead>\n  ");
    result = result.replace(/<tfoot>/g, "<tfoot>\n  ");

    // Step 3: tbody/thead/tfoot の終了タグの前に改行を追加
    result = result.replace(/<\/tbody>/g, "\n</tbody>");
    result = result.replace(/<\/thead>/g, "\n</thead>");
    result = result.replace(/<\/tfoot>/g, "\n</tfoot>");

    // Step 4: thead/tbody/tfoot の組み合わせに改行を追加
    result = result.replace(/<\/thead><tbody>/g, "</thead>\n<tbody>");
    result = result.replace(/<\/tbody><tfoot>/g, "</tbody>\n<tfoot>");
    result = result.replace(/<\/tfoot><tbody>/g, "</tfoot>\n<tbody>");

    // Step 5: tbody/thead/tfoot と table の終了タグの間に改行を追加
    result = result.replace(/<\/tbody><\/table>/g, "</tbody>\n</table>");
    result = result.replace(/<\/thead><\/table>/g, "</thead>\n</table>");
    result = result.replace(/<\/tfoot><\/table>/g, "</tfoot>\n</table>");

    // Step 6: table の終了タグの後に改行を追加
    result = result.replace(/<\/table>/g, "</table>\n");

    // Step 7: tr タグの間に改行を追加
    result = result.replace(/<\/tr><tr>/g, "</tr>\n  <tr>");

    // Step 8: tr の開始タグの後に改行とインデントを追加
    result = result.replace(/<tr>/g, "<tr>\n    ");

    // Step 9: tr の終了タグの前に改行とインデントを追加
    result = result.replace(/<\/tr>/g, "\n  </tr>");

    // Step 10: td/th タグの間に改行とインデントを追加（属性付きも考慮）
    result = result.replace(/<\/td><td(\s|>)/g, "</td>\n    <td$1");
    result = result.replace(/<\/th><th(\s|>)/g, "</th>\n    <th$1");
    result = result.replace(/<\/td><th(\s|>)/g, "</td>\n    <th$1");
    result = result.replace(/<\/th><td(\s|>)/g, "</th>\n    <td$1");

    // Step 11: colgroup の処理
    result = result.replace(/>\n<colgroup>/g, ">\n<colgroup>");
    result = result.replace(/<\/colgroup><tbody>/g, "</colgroup>\n<tbody>");
    result = result.replace(/<\/colgroup><thead>/g, "</colgroup>\n<thead>");

    // Step 12: p/h?/div の処理
    result = result.replace(/><(p|h[1-6]|div [^>]+)>/g, ">\n      <$1>");
    result = result.replace(/<\/(p|h[1-6]|div)><\/(td|th)>/g, "</$1>\n    </$2>");

    // Step 13: ul/li の処理
    result = result.replace(/><((?:li|ul)(?: [^>]+)?)>/g, ">\n      <$1>");
    result = result.replace(/<\/(li|ul)><\//g, "</$1>\n    </");

    return result;
  }

  /**
   * フォーマットされたテーブルXHTMLから改行とインデントを削除して元に戻す
   *
   * タグ間の空白（改行、スペース、タブ）を削除し、元のコンパクトな形式に戻す
   * ただし、td/th タグ内のテキストコンテンツは保持します。
   */
  private unformatTableXhtml(xhtml: string): string {
    let result = xhtml;

    // Step 1: table の開始タグ直後の改行を削除
    result = result.replace(/(<table[^>]*>)\n\s*/g, "$1");

    // Step 2: tbody/thead/tfoot の開始タグ直後の改行とインデントを削除
    result = result.replace(/<tbody>\n\s*/g, "<tbody>");
    result = result.replace(/<thead>\n\s*/g, "<thead>");
    result = result.replace(/<tfoot>\n\s*/g, "<tfoot>");

    // Step 3: tbody/thead/tfoot の終了タグ直前の改行とインデントを削除
    result = result.replace(/\n\s*<\/tbody>/g, "</tbody>");
    result = result.replace(/\n\s*<\/thead>/g, "</thead>");
    result = result.replace(/\n\s*<\/tfoot>/g, "</tfoot>");

    // Step 4: thead/tbody/tfoot の組み合わせの改行を削除
    result = result.replace(/<\/thead>\n\s*<tbody>/g, "</thead><tbody>");
    result = result.replace(/<\/tbody>\n\s*<tfoot>/g, "</tbody><tfoot>");
    result = result.replace(/<\/tfoot>\n\s*<tbody>/g, "</tfoot><tbody>");

    // Step 5: tbody/thead/tfoot と table の終了タグの間の改行を削除
    result = result.replace(/<\/tbody>\n\s*<\/table>/g, "</tbody></table>");
    result = result.replace(/<\/thead>\n\s*<\/table>/g, "</thead></table>");
    result = result.replace(/<\/tfoot>\n\s*<\/table>/g, "</tfoot></table>");

    // Step 6: table の終了タグ直後の改行を削除
    result = result.replace(/<\/table>\n/g, "</table>");

    // Step 7: tr タグ間の改行とインデントを削除
    result = result.replace(/<\/tr>\n\s*<tr>/g, "</tr><tr>");

    // Step 8: tr の開始タグ直後の改行とインデントを削除
    result = result.replace(/<tr>\n\s*/g, "<tr>");

    // Step 9: tr の終了タグ直前の改行とインデントを削除
    result = result.replace(/\n\s*<\/tr>/g, "</tr>");

    // Step 10: td/th タグ間の改行とインデントを削除（属性付きも考慮）
    result = result.replace(/<\/td>\n\s*<td(\s|>)/g, "</td><td$1");
    result = result.replace(/<\/th>\n\s*<th(\s|>)/g, "</th><th$1");
    result = result.replace(/<\/td>\n\s*<th(\s|>)/g, "</td><th$1");
    result = result.replace(/<\/th>\n\s*<td(\s|>)/g, "</th><td$1");

    // Step 11: colgroup の改行を削除
    result = result.replace(/>\n<colgroup>/g, "><colgroup>");
    result = result.replace(/<\/colgroup>\n\s*<tbody>/g, "</colgroup><tbody>");
    result = result.replace(/<\/colgroup>\n\s*<thead>/g, "</colgroup><thead>");

    // Step 12: p/h?/div の処理
    result = result.replace(/>\n\s*<(p|h[1-6]|div [^>]+)>/g, "><$1>");
    result = result.replace(/<\/(p|h[1-6]|div)>\n\s*<\/(td|th)>/g, "</$1></$2>");

    // Step 13: ul/li の処理
    result = result.replace(/>\n\s*<((?:li|ul)(?: [^>]+)?)>/g, "><$1>");
    result = result.replace(/<\/(li|ul)>\n\s*<\//g, "</$1></");

    return result;
  }

  async downloadBody(params: {
    pageUrl: string;
    outputDir?: string;
    options?: IOOptions;
  }): Promise<BodyDownloadResult> {
    const { pageUrl, outputDir, options } = params;
    const pageId = ConfluenceClient.extractPageIdFromUrl(pageUrl);
    const paths = await this.preparePaths(pageId, outputDir);

    const logFiles: string[] = [];
    const startLog = await this.writeLog(
      paths.logDir,
      `download-body-${Date.now()}.log`,
      {
        event: "body_download",
        status: "started",
        pageId,
        targetFile: paths.pageFile,
      },
    );
    logFiles.push(startLog);

    const existingMeta = await readJsonFile<PageMeta>(paths.metaFile);

    try {
      const page = await this.client.getPage(pageId, options);
      const storageContent = page.body.storage.value;
      const storageSha = computeSha256(storageContent);
      const downloadedAt = new Date().toISOString();

      const shouldSkip =
        existingMeta?.version === page.version.number &&
        existingMeta?.storageSha256 === storageSha;

      if (!shouldSkip) {
        const formattedContent = this.formatTableXhtml(storageContent);
        await writeTextFile(paths.pageFile, formattedContent);
        logger.info({
          event: "body_download",
          status: "completed",
          target: `page/${pageId}`,
          pageVersion: page.version.number,
        });
      } else {
        logger.info({
          event: "body_download",
          status: "skipped",
          target: `page/${pageId}`,
          reason: "no_changes",
        });
      }

      const nextMeta: PageMeta = {
        pageId,
        title: page.title,
        version: page.version.number,
        downloadedAt,
        storagePath: paths.pageFile,
        storageSha256: shouldSkip
          ? (existingMeta?.storageSha256 ?? storageSha)
          : storageSha,
        ...(existingMeta?.lastUploadedAt && {
          lastUploadedAt: existingMeta.lastUploadedAt,
        }),
        ...(existingMeta?.lastAttachmentScanAt && {
          lastAttachmentScanAt: existingMeta.lastAttachmentScanAt,
        }),
        attachments: existingMeta?.attachments ?? [],
      };

      await writeJsonFile(paths.metaFile, nextMeta);

      return {
        success: true,
        skipped: shouldSkip,
        pageFile: paths.pageFile,
        metaFile: paths.metaFile,
        logFiles,
      };
    } catch (error) {
      const errorLog = await this.writeLog(
        paths.logDir,
        `error-body-download-${Date.now()}.log`,
        {
          event: "body_download",
          status: "failed",
          pageId,
          error,
        },
      );
      logFiles.push(errorLog);
      logger.error({
        event: "body_download",
        status: "failed",
        target: `page/${pageId}`,
        error: error instanceof Error ? error : { message: String(error) },
      });
      throw error;
    }
  }

  async uploadBody(params: {
    pageUrl: string;
    inputDir?: string;
    summary?: string;
    options?: IOOptions;
  }): Promise<BodyUploadResult> {
    const { pageUrl, inputDir, summary, options } = params;
    const pageId = ConfluenceClient.extractPageIdFromUrl(pageUrl);
    const paths = await this.preparePaths(pageId, inputDir);

    const logFiles: string[] = [];
    const startLog = await this.writeLog(
      paths.logDir,
      `upload-body-${Date.now()}.log`,
      {
        event: "body_upload",
        status: "started",
        pageId,
        sourceFile: paths.pageFile,
      },
    );
    logFiles.push(startLog);

    const meta = await readJsonFile<PageMeta>(paths.metaFile);
    if (!meta) {
      throw new ConfluenceClientError(
        `メタ情報が見つかりませんでした: ${paths.metaFile}`,
        undefined,
        "META_NOT_FOUND",
      );
    }

    if (!(await fileExists(paths.pageFile))) {
      throw new ConfluenceClientError(
        `ページファイルが存在しません: ${paths.pageFile}`,
        undefined,
        "PAGE_FILE_NOT_FOUND",
      );
    }

    try {
      const remotePage = await this.client.getPage(pageId, options);

      if (remotePage.version.number !== meta.version) {
        throw new ConfluenceClientError(
          `Confluenceのバージョンと一致しません。remote=${remotePage.version.number}, local=${meta.version}`,
          undefined,
          "VERSION_CONFLICT",
        );
      }

      const formattedContent = await fs.readFile(paths.pageFile, "utf-8");
      const storageContent = this.unformatTableXhtml(formattedContent);
      const localSha = computeSha256(formattedContent);
      const pageUpdated = localSha !== meta.storageSha256;

      let updatedMeta: PageMeta = { ...meta };

      if (pageUpdated) {
        const updatedPage = await this.client.updatePage(
          pageId,
          remotePage.title,
          storageContent,
          remotePage.version.number,
          options,
          summary,
        );
        updatedMeta = {
          ...updatedMeta,
          version: updatedPage.version.number,
          storageSha256: localSha,
          downloadedAt: new Date().toISOString(),
          storagePath: paths.pageFile,
          lastUploadedAt: new Date().toISOString(),
          ...(updatedMeta.lastAttachmentScanAt && {
            lastAttachmentScanAt: updatedMeta.lastAttachmentScanAt,
          }),
        };
      }

      await writeJsonFile(paths.metaFile, updatedMeta);

      return {
        success: true,
        pageUpdated,
        metaFile: paths.metaFile,
        logFiles,
      };
    } catch (error) {
      const errorLog = await this.writeLog(
        paths.logDir,
        `error-body-upload-${Date.now()}.log`,
        {
          event: "body_upload",
          status: "failed",
          pageId,
          error,
        },
      );
      logFiles.push(errorLog);
      logger.error({
        event: "body_upload",
        status: "failed",
        target: `page/${pageId}`,
        error: error instanceof Error ? error : { message: String(error) },
      });
      throw error;
    }
  }

  async downloadAttachments(params: {
    pageUrl: string;
    outputDir?: string;
    attachmentFilter?: AttachmentFilterOptions;
    options?: IOOptions;
  }): Promise<AttachmentsDownloadResult> {
    const { pageUrl, outputDir, attachmentFilter, options } = params;
    const pageId = ConfluenceClient.extractPageIdFromUrl(pageUrl);
    const paths = await this.preparePaths(pageId, outputDir);

    const includeTitles = attachmentFilter?.includeTitles?.map((title) =>
      title.trim(),
    );
    const filterSet =
      includeTitles && includeTitles.length > 0 ? new Set(includeTitles) : null;

    const logFiles: string[] = [];
    const startLog = await this.writeLog(
      paths.logDir,
      `download-attachments-${Date.now()}.log`,
      {
        event: "attachments_download",
        status: "started",
        pageId,
        filter: includeTitles ?? [],
      },
    );
    logFiles.push(startLog);

    const existingMeta = await readJsonFile<PageMeta>(paths.metaFile);

    try {
      const attachmentInfos = await this.client.getAttachments(pageId, options);
      const filteredAttachments = filterSet
        ? attachmentInfos.filter((info) => filterSet.has(info.title))
        : attachmentInfos;

      const downloaded: string[] = [];
      const skipped: string[] = [];
      const removed: string[] = [];

      let pageMeta = existingMeta;
      if (!pageMeta) {
        const page = await this.client.getPage(pageId, options);
        pageMeta = {
          pageId,
          title: page.title,
          version: page.version.number,
          downloadedAt: new Date().toISOString(),
          storagePath: paths.pageFile,
          storageSha256: "",
          attachments: [],
        };
      }

      const existingAttachments = pageMeta.attachments ?? [];
      const existingMap = new Map(
        existingAttachments.map((attachment) => [attachment.title, attachment]),
      );

      for (const attachmentInfo of filteredAttachments) {
        const existing = existingMap.get(attachmentInfo.title);
        const attachmentPath = path.join(
          paths.attachmentsDir,
          attachmentInfo.title,
        );

        if (
          existing &&
          existing.version === (attachmentInfo.version ?? existing.version) &&
          (await fileExists(attachmentPath))
        ) {
          skipped.push(attachmentInfo.title);
          continue;
        }

        try {
          const data = await this.client.downloadAttachment(
            pageId,
            attachmentInfo.id,
            options,
          );
          await fs.writeFile(attachmentPath, data);
          downloaded.push(attachmentInfo.title);
        } catch (error) {
          const errorLog = await this.writeLog(
            paths.logDir,
            `error-attachment-download-${Date.now()}.log`,
            {
              event: "attachments_download",
              status: "failed",
              pageId,
              attachmentId: attachmentInfo.id,
              attachmentTitle: attachmentInfo.title,
              error,
            },
          );
          logFiles.push(errorLog);
          throw error;
        }
      }

      if (!filterSet) {
        const infoTitles = new Set(attachmentInfos.map((info) => info.title));
        for (const existing of existingAttachments) {
          if (!infoTitles.has(existing.title)) {
            const attachmentPath = path.join(
              paths.attachmentsDir,
              existing.title,
            );
            if (await fileExists(attachmentPath)) {
              await safeUnlink(attachmentPath);
            }
            removed.push(existing.title);
          }
        }
      }

      const updatedAttachments: AttachmentMeta[] = existingAttachments.filter(
        (attachment) => !removed.includes(attachment.title),
      );

      const nowIso = new Date().toISOString();
      const infoMap = new Map(
        filteredAttachments.map((info) => [info.title, info]),
      );

      for (const title of downloaded) {
        const info = infoMap.get(title);
        if (!info) {
          continue;
        }
        const attachmentPath = path.join(paths.attachmentsDir, title);
        const data = await fs.readFile(attachmentPath);
        const sha256 = computeSha256(data);

        const existingMetaEntry = existingAttachments.find(
          (attachment) => attachment.title === title,
        );

        const metaEntry: AttachmentMeta = {
          id: info.id,
          title,
          version: info.version ?? existingMetaEntry?.version ?? 1,
          downloadedAt: nowIso,
          storagePath: attachmentPath,
          sha256,
          mediaType: info.mediaType,
          fileSize: info.fileSize,
          ...(existingMetaEntry?.lastUploadedAt && {
            lastUploadedAt: existingMetaEntry.lastUploadedAt,
          }),
        };

        const existingIndex = updatedAttachments.findIndex(
          (attachment) => attachment.title === title,
        );
        if (existingIndex >= 0) {
          updatedAttachments[existingIndex] = metaEntry;
        } else {
          updatedAttachments.push(metaEntry);
        }
      }

      const nextMeta: PageMeta = {
        ...pageMeta,
        attachments: updatedAttachments,
        lastAttachmentScanAt: new Date().toISOString(),
      };

      await writeJsonFile(paths.metaFile, nextMeta);

      return {
        success: true,
        downloaded,
        skipped,
        removed,
        metaFile: paths.metaFile,
        logFiles,
      };
    } catch (error) {
      const errorLog = await this.writeLog(
        paths.logDir,
        `error-attachments-download-${Date.now()}.log`,
        {
          event: "attachments_download",
          status: "failed",
          pageId,
          error,
        },
      );
      logFiles.push(errorLog);
      logger.error({
        event: "attachments_download",
        status: "failed",
        target: `page/${pageId}`,
        error: error instanceof Error ? error : { message: String(error) },
      });
      throw error;
    }
  }

  async uploadAttachments(params: {
    pageUrl: string;
    inputDir?: string;
    attachmentFilter?: AttachmentFilterOptions;
    options?: IOOptions;
  }): Promise<AttachmentsUploadResult> {
    const { pageUrl, inputDir, attachmentFilter, options } = params;
    const pageId = ConfluenceClient.extractPageIdFromUrl(pageUrl);
    const paths = await this.preparePaths(pageId, inputDir);

    const includeTitles = attachmentFilter?.includeTitles?.map((title) =>
      title.trim(),
    );
    const filterSet =
      includeTitles && includeTitles.length > 0 ? new Set(includeTitles) : null;

    const logFiles: string[] = [];
    const startLog = await this.writeLog(
      paths.logDir,
      `upload-attachments-${Date.now()}.log`,
      {
        event: "attachments_upload",
        status: "started",
        pageId,
        filter: includeTitles ?? [],
      },
    );
    logFiles.push(startLog);

    const meta = await readJsonFile<PageMeta>(paths.metaFile);
    if (!meta) {
      throw new ConfluenceClientError(
        `メタ情報が見つかりませんでした: ${paths.metaFile}`,
        undefined,
        "META_NOT_FOUND",
      );
    }

    const attachmentsToProcess = filterSet
      ? meta.attachments.filter((attachment) => filterSet.has(attachment.title))
      : meta.attachments;

    const uploaded: string[] = [];
    const skipped: string[] = [];
    const updatedAttachments: AttachmentMeta[] = [...meta.attachments];

    for (const attachmentMeta of attachmentsToProcess) {
      const attachmentPath = path.join(
        paths.attachmentsDir,
        attachmentMeta.title,
      );
      if (!(await fileExists(attachmentPath))) {
        const missingLog = await this.writeLog(
          paths.logDir,
          `error-attachment-missing-${Date.now()}.log`,
          {
            event: "attachments_upload",
            status: "failed",
            pageId,
            attachmentTitle: attachmentMeta.title,
            error: "ローカルの添付ファイルが見つかりませんでした",
          },
        );
        logFiles.push(missingLog);
        throw new ConfluenceClientError(
          `添付ファイルが見つかりません: ${attachmentMeta.title}`,
          undefined,
          "ATTACHMENT_FILE_NOT_FOUND",
        );
      }

      const localSha = await computeFileSha256(attachmentPath);
      if (localSha === attachmentMeta.sha256) {
        skipped.push(attachmentMeta.title);
        continue;
      }

      const data = await readBinaryFile(attachmentPath);
      const contentType = guessContentType(attachmentMeta.title);
      try {
        const updatedAttachment = await this.client.uploadAttachment(
          pageId,
          attachmentMeta.title,
          data,
          contentType,
          options,
        );

        const newMeta: AttachmentMeta = {
          ...attachmentMeta,
          id: updatedAttachment.id,
          version: updatedAttachment.version ?? attachmentMeta.version + 1,
          sha256: computeSha256(data),
          mediaType: updatedAttachment.mediaType,
          fileSize: updatedAttachment.fileSize,
          downloadedAt: attachmentMeta.downloadedAt,
          lastUploadedAt: new Date().toISOString(),
        };

        const index = updatedAttachments.findIndex(
          (att) => att.title === attachmentMeta.title,
        );
        if (index >= 0) {
          updatedAttachments[index] = newMeta;
        } else {
          updatedAttachments.push(newMeta);
        }

        uploaded.push(attachmentMeta.title);
      } catch (error) {
        const uploadErrorLog = await this.writeLog(
          paths.logDir,
          `error-attachment-upload-${Date.now()}.log`,
          {
            event: "attachments_upload",
            status: "failed",
            pageId,
            attachmentTitle: attachmentMeta.title,
            error,
          },
        );
        logFiles.push(uploadErrorLog);
        throw error;
      }
    }

    const nextMeta: PageMeta = {
      ...meta,
      attachments: updatedAttachments,
      ...(meta.lastAttachmentScanAt && {
        lastAttachmentScanAt: meta.lastAttachmentScanAt,
      }),
    };

    await writeJsonFile(paths.metaFile, nextMeta);

    return {
      success: true,
      uploaded,
      skipped,
      metaFile: paths.metaFile,
      logFiles,
    };
  }

  private async preparePaths(
    pageId: string,
    rootDir?: string,
  ): Promise<ConfluenceDataPaths> {
    const baseDir = rootDir
      ? path.resolve(rootDir)
      : path.resolve("confluence-data");
    const pageDir = path.join(baseDir, sanitizePathSegment(pageId));
    const attachmentsDir = path.join(pageDir, "attachments");
    const logDir = path.join(baseDir, "log");

    await Promise.all([
      ensureDir(baseDir),
      ensureDir(pageDir),
      ensureDir(attachmentsDir),
      ensureDir(logDir),
    ]);

    return {
      baseDir,
      pageDir,
      pageFile: path.join(pageDir, "page.xhtml"),
      metaFile: path.join(pageDir, "meta.json"),
      attachmentsDir,
      logDir,
    };
  }

  private async writeLog(
    logDir: string,
    fileName: string,
    entry: Record<string, unknown>,
  ): Promise<string> {
    const logFilePath = path.join(logDir, fileName);
    const sanitizedEntry = this.maskSensitive(entry);
    const content = `${JSON.stringify({ ...sanitizedEntry, timestamp: new Date().toISOString() })}\n`;
    await fs.appendFile(logFilePath, content, "utf-8");
    return logFilePath;
  }

  private maskSensitive(
    entry: Record<string, unknown>,
  ): Record<string, unknown> {
    const sensitiveKeys = [
      "token",
      "password",
      "apitoken",
      "api_token",
      "email",
    ];
    const maskedEntry: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(entry)) {
      if (
        sensitiveKeys.some((sensitive) => key.toLowerCase().includes(sensitive))
      ) {
        maskedEntry[key] = "***MASKED***";
        continue;
      }
      if (value && typeof value === "object" && !Array.isArray(value)) {
        maskedEntry[key] = this.maskSensitive(value as Record<string, unknown>);
      } else {
        maskedEntry[key] = value;
      }
    }
    return maskedEntry;
  }
}
