import type { AxiosInstance } from "axios";
import axios from "axios";
import FormData from "form-data";
import { createAbortSignal, getAbortReason, isAbortError } from "./abort.js";
import {
  AuthenticationError,
  AuthorizationError,
  ExternalServiceError,
  InvalidUrlError,
  PageNotFoundError,
  RateLimitError,
} from "./errors.js";
import { Logger, logger } from "./logger.js";
import type {
  AttachmentInfo,
  ConfluenceConfig,
  ConfluencePage,
  IOOptions,
  PageUpdateRequest,
} from "./types.js";

export class ConfluenceClient {
  private api: AxiosInstance;

  constructor(config: ConfluenceConfig) {
    this.api = axios.create({
      baseURL: `${config.baseUrl}/wiki/rest/api`,
      auth: {
        username: config.email,
        password: config.apiToken,
      },
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });
  }

  /**
   * ページIDからページ情報を取得
   * @param pageId - Confluence page ID
   * @param options - IO options for timeout and cancellation
   */
  async getPage(pageId: string, options?: IOOptions): Promise<ConfluencePage> {
    const startTime = Date.now();
    const url = `/content/${pageId}`;
    const signal = createAbortSignal(options);

    logger.debug({
      event: "confluence_api_call",
      status: "started",
      method: "GET",
      target: `page/${pageId}`,
      timeoutMs: options?.timeoutMs,
    });

    try {
      const response = await this.api.get(url, {
        params: {
          expand: "body.storage,version",
        },
        signal,
      });

      const durationMs = Date.now() - startTime;
      logger.info({
        event: "confluence_api_call",
        status: "completed",
        durationMs,
        method: "GET",
        target: `page/${pageId}`,
        statusCode: response.status,
      });

      return response.data;
    } catch (error) {
      const durationMs = Date.now() - startTime;

      // Handle abort/timeout
      if (isAbortError(error)) {
        const reason = getAbortReason(signal);
        logger.warn({
          event: "confluence_api_call",
          status: "failed",
          durationMs,
          method: "GET",
          target: `page/${pageId}`,
          abortReason: reason,
        });
        throw error; // Don't suppress abort errors
      }

      if (axios.isAxiosError(error)) {
        const status = error.response?.status || 0;

        // Classify error by status code
        let domainError: Error;
        switch (status) {
          case 401:
            domainError = new AuthenticationError(
              "Invalid credentials or token",
              error,
            );
            break;
          case 403:
            domainError = new AuthorizationError(
              `page/${pageId}`,
              "Insufficient permissions",
            );
            break;
          case 404:
            domainError = new PageNotFoundError(pageId);
            break;
          case 429:
            domainError = new RateLimitError("confluence");
            break;
          case 500:
          case 502:
          case 503:
            domainError = new ExternalServiceError(
              "confluence",
              `Server error: ${status}`,
              error,
            );
            break;
          default:
            domainError = new ExternalServiceError(
              "confluence",
              `Failed to get page ${pageId}: ${status} ${error.response?.statusText || error.message}`,
              error,
            );
        }

        // Log at debug level - will be handled by caller
        logger.debug({
          event: "confluence_api_call",
          status: "failed",
          durationMs,
          method: "GET",
          target: `page/${pageId}`,
          statusCode: status,
          error: Logger.serializeError(domainError),
        });

        throw domainError;
      }

      // Non-Axios error
      const unknownError = new ExternalServiceError(
        "confluence",
        `Unexpected error while getting page ${pageId}`,
        error,
      );

      logger.debug({
        event: "confluence_api_call",
        status: "failed",
        durationMs,
        method: "GET",
        target: `page/${pageId}`,
        error: Logger.serializeError(unknownError),
      });

      throw unknownError;
    }
  }

  /**
   * ページを更新
   * @param pageId - Confluence page ID
   * @param title - Page title
   * @param content - Page content in storage format
   * @param version - Current version number
   * @param options - IO options for timeout and cancellation
   */
  async updatePage(
    pageId: string,
    title: string,
    content: string,
    version: number,
    options?: IOOptions,
  ): Promise<ConfluencePage> {
    const startTime = Date.now();
    const url = `/content/${pageId}`;
    const signal = createAbortSignal(options);

    logger.debug({
      event: "confluence_api_call",
      status: "started",
      method: "PUT",
      target: `page/${pageId}`,
      version,
      timeoutMs: options?.timeoutMs,
    });

    const updateRequest: PageUpdateRequest = {
      id: pageId,
      type: "page",
      title,
      body: {
        storage: {
          value: content,
          representation: "storage",
        },
      },
      version: {
        number: version + 1,
        message: "auto-generated by mcp-confluence-demo",
      },
    };

    try {
      const response = await this.api.put(url, updateRequest, { signal });

      const durationMs = Date.now() - startTime;
      logger.info({
        event: "confluence_api_call",
        status: "completed",
        durationMs,
        method: "PUT",
        target: `page/${pageId}`,
        statusCode: response.status,
        newVersion: version + 1,
      });

      return response.data;
    } catch (error) {
      const durationMs = Date.now() - startTime;

      // Handle abort/timeout
      if (isAbortError(error)) {
        const reason = getAbortReason(signal);
        logger.warn({
          event: "confluence_api_call",
          status: "failed",
          durationMs,
          method: "PUT",
          target: `page/${pageId}`,
          abortReason: reason,
        });
        throw error; // Don't suppress abort errors
      }

      if (axios.isAxiosError(error)) {
        const status = error.response?.status || 0;

        // Classify error by status code
        let domainError: Error;
        switch (status) {
          case 401:
            domainError = new AuthenticationError(
              "Invalid credentials or token",
              error,
            );
            break;
          case 403:
            domainError = new AuthorizationError(
              `page/${pageId}`,
              "Insufficient permissions to update",
            );
            break;
          case 404:
            domainError = new PageNotFoundError(pageId);
            break;
          case 409:
            domainError = new ExternalServiceError(
              "confluence",
              `Version conflict: page ${pageId} was modified`,
              error,
            );
            break;
          case 429:
            domainError = new RateLimitError("confluence");
            break;
          case 500:
          case 502:
          case 503:
            domainError = new ExternalServiceError(
              "confluence",
              `Server error: ${status}`,
              error,
            );
            break;
          default:
            domainError = new ExternalServiceError(
              "confluence",
              `Failed to update page ${pageId}: ${status} ${error.response?.statusText || error.message}`,
              error,
            );
        }

        // Log at debug level - will be handled by caller
        logger.debug({
          event: "confluence_api_call",
          status: "failed",
          durationMs,
          method: "PUT",
          target: `page/${pageId}`,
          statusCode: status,
          error: Logger.serializeError(domainError),
        });

        throw domainError;
      }

      // Non-Axios error
      const unknownError = new ExternalServiceError(
        "confluence",
        `Unexpected error while updating page ${pageId}`,
        error,
      );

      logger.debug({
        event: "confluence_api_call",
        status: "failed",
        durationMs,
        method: "PUT",
        target: `page/${pageId}`,
        error: Logger.serializeError(unknownError),
      });

      throw unknownError;
    }
  }

  /**
   * アタッチメント一覧を取得
   * @param pageId - Confluence page ID
   * @param options - IO options for timeout and cancellation
   */
  async getAttachments(
    pageId: string,
    options?: IOOptions,
  ): Promise<AttachmentInfo[]> {
    const startTime = Date.now();
    const url = `/content/${pageId}/child/attachment`;
    const signal = createAbortSignal(options);

    logger.debug({
      event: "confluence_api_call",
      status: "started",
      method: "GET",
      target: `page/${pageId}/attachments`,
      timeoutMs: options?.timeoutMs,
    });

    try {
      const response = await this.api.get(url, {
        params: {
          limit: 1000,
        },
        signal,
      });

      const durationMs = Date.now() - startTime;
      logger.info({
        event: "confluence_api_call",
        status: "completed",
        durationMs,
        method: "GET",
        target: `page/${pageId}/attachments`,
        statusCode: response.status,
        count: response.data.results?.length || 0,
      });

      return (
        response.data.results?.map((attachment: any) => ({
          id: attachment.id,
          title: attachment.title,
          downloadUrl: attachment._links?.download || "",
          fileSize: attachment.extensions?.fileSize || 0,
          mediaType: attachment.extensions?.mediaType || "",
        })) || []
      );
    } catch (error) {
      const durationMs = Date.now() - startTime;

      if (isAbortError(error)) {
        const reason = getAbortReason(signal);
        logger.warn({
          event: "confluence_api_call",
          status: "failed",
          durationMs,
          method: "GET",
          target: `page/${pageId}/attachments`,
          abortReason: reason,
        });
        throw error;
      }

      if (axios.isAxiosError(error)) {
        const status = error.response?.status || 0;
        const domainError = this.createDomainError(
          error,
          pageId,
          "get attachments",
        );

        logger.debug({
          event: "confluence_api_call",
          status: "failed",
          durationMs,
          method: "GET",
          target: `page/${pageId}/attachments`,
          statusCode: status,
          error: Logger.serializeError(domainError),
        });

        throw domainError;
      }

      const unknownError = new ExternalServiceError(
        "confluence",
        `Unexpected error while getting attachments for page ${pageId}`,
        error,
      );

      logger.debug({
        event: "confluence_api_call",
        status: "failed",
        durationMs,
        method: "GET",
        target: `page/${pageId}/attachments`,
        error: Logger.serializeError(unknownError),
      });

      throw unknownError;
    }
  }

  /**
   * アタッチメントをアップロード（既存の場合は新バージョンとして追加）
   * @param pageId - Confluence page ID
   * @param fileName - File name
   * @param fileData - File data as Buffer
   * @param contentType - MIME type
   * @param options - IO options for timeout and cancellation
   */
  async uploadAttachment(
    pageId: string,
    fileName: string,
    fileData: Buffer,
    contentType: string,
    options?: IOOptions,
  ): Promise<AttachmentInfo> {
    const startTime = Date.now();
    const signal = createAbortSignal(options);

    logger.debug({
      event: "confluence_api_call",
      status: "started",
      method: "PUT",
      target: `page/${pageId}/attachment/${fileName}`,
      fileSize: fileData.length,
      timeoutMs: options?.timeoutMs,
    });

    // Check if attachment already exists
    const existingAttachments = await this.getAttachments(pageId, options);
    const existing = existingAttachments.find((att) => att.title === fileName);

    const formData = new FormData();
    formData.append("file", fileData, {
      filename: fileName,
      contentType,
    });

    // Confluence API: PUT to /content/{id}/child/attachment
    // If file exists, it creates a new version automatically
    const url = `/content/${pageId}/child/attachment`;
    const method = "PUT";

    logger.debug({
      event: "attachment_operation",
      action: existing ? "update_version" : "create",
      attachmentId: existing?.id,
      fileName,
    });

    try {
      const response = await this.api.request({
        method,
        url,
        data: formData,
        headers: {
          ...formData.getHeaders(),
          "X-Atlassian-Token": "no-check",
        },
        signal,
      });

      const durationMs = Date.now() - startTime;
      logger.info({
        event: "confluence_api_call",
        status: "completed",
        durationMs,
        method,
        target: `page/${pageId}/attachment/${fileName}`,
        statusCode: response.status,
        action: existing ? "update_version" : "create",
      });

      const result = response.data.results?.[0] || response.data;
      return {
        id: result.id,
        title: result.title,
        downloadUrl: result._links?.download || "",
        fileSize: result.extensions?.fileSize || 0,
        mediaType: result.extensions?.mediaType || "",
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;

      if (isAbortError(error)) {
        const reason = getAbortReason(signal);
        logger.warn({
          event: "confluence_api_call",
          status: "failed",
          durationMs,
          method,
          target: `page/${pageId}/attachment/${fileName}`,
          abortReason: reason,
        });
        throw error;
      }

      if (axios.isAxiosError(error)) {
        const status = error.response?.status || 0;
        const domainError = this.createDomainError(
          error,
          pageId,
          "upload attachment",
        );

        logger.debug({
          event: "confluence_api_call",
          status: "failed",
          durationMs,
          method,
          target: `page/${pageId}/attachment/${fileName}`,
          statusCode: status,
          error: Logger.serializeError(domainError),
        });

        throw domainError;
      }

      const unknownError = new ExternalServiceError(
        "confluence",
        `Unexpected error while uploading attachment ${fileName} to page ${pageId}`,
        error,
      );

      logger.debug({
        event: "confluence_api_call",
        status: "failed",
        durationMs,
        method,
        target: `page/${pageId}/attachment/${fileName}`,
        error: Logger.serializeError(unknownError),
      });

      throw unknownError;
    }
  }

  /**
   * アタッチメントをダウンロード
   * @param pageId - Confluence page ID
   * @param attachmentId - Attachment ID
   * @param options - IO options for timeout and cancellation
   */
  async downloadAttachment(
    pageId: string,
    attachmentId: string,
    options?: IOOptions,
  ): Promise<Buffer> {
    const startTime = Date.now();
    const signal = createAbortSignal(options);
    const url = `/content/${pageId}/child/attachment/${attachmentId}/download`;

    logger.debug({
      event: "confluence_api_call",
      status: "started",
      method: "GET",
      target: `page/${pageId}/attachment/${attachmentId}/download`,
      timeoutMs: options?.timeoutMs,
    });

    try {
      const response = await this.api.get(url, {
        responseType: "arraybuffer",
        signal,
      });

      const durationMs = Date.now() - startTime;
      logger.info({
        event: "confluence_api_call",
        status: "completed",
        durationMs,
        method: "GET",
        target: `page/${pageId}/attachment/${attachmentId}/download`,
        statusCode: response.status,
        size: response.data.length,
      });

      return Buffer.from(response.data);
    } catch (error) {
      const durationMs = Date.now() - startTime;

      if (isAbortError(error)) {
        const reason = getAbortReason(signal);
        logger.warn({
          event: "confluence_api_call",
          status: "failed",
          durationMs,
          method: "GET",
          target: `page/${pageId}/attachment/${attachmentId}/download`,
          abortReason: reason,
        });
        throw error;
      }

      if (axios.isAxiosError(error)) {
        const status = error.response?.status || 0;
        const domainError = this.createDomainError(
          error,
          `page/${pageId}/attachment/${attachmentId}`,
          "download attachment",
        );

        logger.debug({
          event: "confluence_api_call",
          status: "failed",
          durationMs,
          method: "GET",
          target: `page/${pageId}/attachment/${attachmentId}/download`,
          statusCode: status,
          error: Logger.serializeError(domainError),
        });

        throw domainError;
      }

      const unknownError = new ExternalServiceError(
        "confluence",
        `Unexpected error while downloading attachment ${attachmentId} from page ${pageId}`,
        error,
      );

      logger.debug({
        event: "confluence_api_call",
        status: "failed",
        durationMs,
        method: "GET",
        target: `page/${pageId}/attachment/${attachmentId}/download`,
        error: Logger.serializeError(unknownError),
      });

      throw unknownError;
    }
  }

  /**
   * Create domain-specific error from Axios error
   */
  private createDomainError(
    error: any,
    resource: string,
    operation: string,
  ): Error {
    const status = error.response?.status || 0;

    switch (status) {
      case 401:
        return new AuthenticationError("Invalid credentials or token", error);
      case 403:
        return new AuthorizationError(
          resource,
          `Insufficient permissions to ${operation}`,
        );
      case 404:
        return new PageNotFoundError(resource);
      case 429:
        return new RateLimitError("confluence");
      case 500:
      case 502:
      case 503:
        return new ExternalServiceError(
          "confluence",
          `Server error: ${status}`,
          error,
        );
      default:
        return new ExternalServiceError(
          "confluence",
          `Failed to ${operation} for ${resource}: ${status} ${error.response?.statusText || error.message}`,
          error,
        );
    }
  }

  /**
   * URLからページIDを抽出
   * Supports URLs with or without trailing slash
   */
  static extractPageIdFromUrl(url: string): string {
    const match = url.match(/\/pages\/(\d+)(?:\/|$)/);
    if (!match || !match[1]) {
      throw new InvalidUrlError(url, "Cannot extract page ID from URL");
    }
    return match[1];
  }
}
