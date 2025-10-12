/**
 * Logger for MCP Confluence Server
 * Provides structured logging with emoji icons and different levels
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, any>;
  error?: Error;
}

export class Logger {
  private level: LogLevel = LogLevel.INFO;
  private prefix: string;

  constructor(prefix: string = "MCP-Confluence") {
    this.prefix = prefix;

    // 環境変数でログレベルを設定可能
    const envLevel = process.env.LOG_LEVEL?.toUpperCase();
    if (envLevel && envLevel in LogLevel) {
      this.level = LogLevel[envLevel as keyof typeof LogLevel];
    }
  }

  /**
   * ログレベルを設定
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * DEBUGレベルログ
   */
  debug(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  /**
   * INFOレベルログ
   */
  info(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, context);
  }

  /**
   * WARNレベルログ
   */
  warn(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, context);
  }

  /**
   * ERRORレベルログ
   */
  error(message: string, error?: Error, context?: Record<string, any>): void {
    this.log(LogLevel.ERROR, message, context, error);
  }

  /**
   * ツール実行開始ログ
   */
  toolStart(toolName: string, params: Record<string, any>): void {
    this.info(`🔧 Tool execution started: ${toolName}`, {
      tool: toolName,
      params: this.sanitizeParams(params),
    });
  }

  /**
   * ツール実行完了ログ
   */
  toolComplete(toolName: string, executionTime: number, result?: any): void {
    this.info(`✅ Tool execution completed: ${toolName}`, {
      tool: toolName,
      executionTimeMs: executionTime,
      hasResult: !!result,
    });
  }

  /**
   * ツール実行失敗ログ
   */
  toolError(toolName: string, error: Error, executionTime: number): void {
    this.error(`❌ Tool execution failed: ${toolName}`, error, {
      tool: toolName,
      executionTimeMs: executionTime,
    });
  }

  /**
   * API呼び出し開始ログ
   */
  apiStart(method: string, url: string, pageId?: string): void {
    this.debug(`🌍 API request: ${method} ${url}`, {
      method,
      url: this.sanitizeUrl(url),
      pageId,
    });
  }

  /**
   * API呼び出し完了ログ
   */
  apiComplete(method: string, statusCode: number, responseTime: number): void {
    const emoji = statusCode < 400 ? "✅" : "⚠️";
    this.info(`${emoji} API response: ${statusCode}`, {
      method,
      statusCode,
      responseTimeMs: responseTime,
    });
  }

  /**
   * API呼び出し失敗ログ
   */
  apiError(
    method: string,
    statusCode: number,
    error: Error,
    responseTime: number,
  ): void {
    let emoji = "❌";
    let errorType = "API Error";

    // ステータスコードに応じたエラー分類
    switch (statusCode) {
      case 401:
        emoji = "🔐";
        errorType = "Authentication Error";
        break;
      case 403:
        emoji = "🚫";
        errorType = "Permission Error";
        break;
      case 404:
        emoji = "🔍";
        errorType = "Page Not Found";
        break;
      case 429:
        emoji = "⏱️";
        errorType = "Rate Limited";
        break;
      case 500:
      case 502:
      case 503:
        emoji = "🔥";
        errorType = "Server Error";
        break;
    }

    this.error(`${emoji} ${errorType}: ${method}`, error, {
      method,
      statusCode,
      responseTimeMs: responseTime,
      errorType,
    });
  }

  /**
   * Confluenceページ操作ログ
   */
  pageOperation(operation: string, pageId: string, pageTitle?: string): void {
    const emoji =
      operation === "read" ? "📖" : operation === "update" ? "✏️" : "📄";
    this.info(`${emoji} Page ${operation}: ${pageTitle || pageId}`, {
      operation,
      pageId,
      pageTitle,
    });
  }

  /**
   * サーバー起動・停止ログ
   */
  serverStart(): void {
    this.info("🚀 MCP Confluence Server started", {
      version: "1.0.0",
      logLevel: LogLevel[this.level],
    });
  }

  serverStop(): void {
    this.info("🛑 MCP Confluence Server stopped");
  }

  /**
   * ベースログ出力メソッド
   */
  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, any>,
    error?: Error,
  ): void {
    if (level < this.level) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(context && { context }),
      ...(error && { error }),
    };

    const levelName = LogLevel[level];
    const emoji = this.getLevelEmoji(level);
    const timestamp = entry.timestamp.slice(11, 23); // HH:mm:ss.sss

    let logMessage = `${timestamp} ${emoji} [${this.prefix}] ${message}`;

    // コンテキスト情報があれば追加
    if (context && Object.keys(context).length > 0) {
      logMessage += ` ${JSON.stringify(context)}`;
    }

    // エラー情報があれば追加
    if (error) {
      logMessage += `\\n  Error: ${error.message}`;
      if (level === LogLevel.DEBUG && error.stack) {
        logMessage += `\\n  Stack: ${error.stack}`;
      }
    }

    // コンソール出力（stderr for errors, stdout for others）
    if (level >= LogLevel.ERROR) {
      console.error(logMessage);
    } else {
      console.log(logMessage);
    }
  }

  /**
   * ログレベルに応じた絵文字を取得
   */
  private getLevelEmoji(level: LogLevel): string {
    switch (level) {
      case LogLevel.DEBUG:
        return "🐛";
      case LogLevel.INFO:
        return "ℹ️";
      case LogLevel.WARN:
        return "⚠️";
      case LogLevel.ERROR:
        return "❌";
      default:
        return "📝";
    }
  }

  /**
   * パラメータから機密情報を除去
   */
  private sanitizeParams(params: Record<string, any>): Record<string, any> {
    const sanitized = { ...params };

    // 機密情報をマスク
    const sensitiveKeys = ["token", "password", "email", "apiToken"];
    for (const key of sensitiveKeys) {
      if (sanitized[key]) {
        sanitized[key] = "***MASKED***";
      }
    }

    return sanitized;
  }

  /**
   * URLから機密情報を除去
   */
  private sanitizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      // クエリパラメータから機密情報を削除
      urlObj.searchParams.delete("token");
      urlObj.searchParams.delete("password");
      return urlObj.toString();
    } catch {
      return url;
    }
  }
}

// デフォルトロガーインスタンス
export const logger = new Logger();
