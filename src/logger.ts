/**
 * Logger for MCP Confluence Server
 * Provides structured logging with correlation ID tracking
 */

import { CorrelationContext } from "./correlation.js";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogStatus = "started" | "completed" | "failed";

/**
 * Standard log entry structure
 * All logs should follow this structure for consistent observability
 */
export interface StandardLogEntry {
  // Required fields
  level: LogLevel;
  event: string;
  status: LogStatus;
  timestamp: string;

  // Recommended fields
  durationMs?: number | undefined;
  target?: string | undefined;
  correlationId?: string | undefined;

  // Error information
  error?:
    | {
        name: string;
        message: string;
        cause?: unknown;
        stack?: string | undefined;
      }
    | undefined;

  // Additional context
  [key: string]: unknown;
}

/**
 * Log level configuration
 */
const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Structured logger with correlation ID support
 */
export class Logger {
  private minLevel: number = LOG_LEVELS.info;
  private prefix: string;

  constructor(prefix = "MCP-Confluence") {
    this.prefix = prefix;

    // Set log level from environment variable
    const envLevel = process.env.LOG_LEVEL?.toLowerCase() as LogLevel;
    if (envLevel && envLevel in LOG_LEVELS) {
      this.minLevel = LOG_LEVELS[envLevel];
    }
  }

  /**
   * Set minimum log level
   */
  setLevel(level: LogLevel): void {
    this.minLevel = LOG_LEVELS[level];
  }

  /**
   * Log a structured entry
   * This is the main entry point for all logging
   */
  log(entry: Omit<StandardLogEntry, "timestamp" | "correlationId">): void {
    const level = entry.level as LogLevel;
    const levelValue = LOG_LEVELS[level];
    if (levelValue < this.minLevel) {
      return;
    }

    const fullEntry: StandardLogEntry = {
      ...(entry as any),
      timestamp: new Date().toISOString(),
      correlationId: CorrelationContext.get(),
    };

    this.output(fullEntry);
  }

  /**
   * Convenience method: Log debug level
   */
  debug(
    entry: Omit<StandardLogEntry, "timestamp" | "correlationId" | "level">,
  ): void {
    this.log({ level: "debug", ...entry });
  }

  /**
   * Convenience method: Log info level
   */
  info(
    entry: Omit<StandardLogEntry, "timestamp" | "correlationId" | "level">,
  ): void {
    this.log({ level: "info", ...entry });
  }

  /**
   * Convenience method: Log warn level
   */
  warn(
    entry: Omit<StandardLogEntry, "timestamp" | "correlationId" | "level">,
  ): void {
    this.log({ level: "warn", ...entry });
  }

  /**
   * Convenience method: Log error level
   */
  error(
    entry: Omit<StandardLogEntry, "timestamp" | "correlationId" | "level">,
  ): void {
    this.log({ level: "error", ...entry });
  }

  /**
   * Output formatted log entry
   */
  private output(entry: StandardLogEntry): void {
    const emoji = this.getLevelEmoji(entry.level);
    const timestamp = entry.timestamp.slice(11, 23); // HH:mm:ss.sss
    const correlationId = entry.correlationId || "no-correlation";

    // Build base message
    const parts = [
      timestamp,
      emoji,
      `[${this.prefix}]`,
      `[${correlationId.slice(0, 8)}]`,
      `[${entry.event}]`,
      `[${entry.status}]`,
    ];

    if (entry.target) {
      parts.push(`target=${entry.target}`);
    }

    if (entry.durationMs !== undefined) {
      parts.push(`duration=${entry.durationMs}ms`);
    }

    const baseMessage = parts.join(" ");

    // Add additional context (excluding standard fields)
    const standardFields = new Set([
      "level",
      "event",
      "status",
      "timestamp",
      "durationMs",
      "target",
      "correlationId",
      "error",
    ]);

    const contextFields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(entry)) {
      if (!standardFields.has(key)) {
        contextFields[key] = this.maskSensitiveData(key, value);
      }
    }

    let logMessage = baseMessage;
    if (Object.keys(contextFields).length > 0) {
      logMessage += ` ${JSON.stringify(contextFields)}`;
    }

    // Add error information
    if (entry.error) {
      logMessage += `\n  Error: ${entry.error.name}: ${entry.error.message}`;
      if (entry.error.cause) {
        logMessage += `\n  Cause: ${JSON.stringify(entry.error.cause)}`;
      }
      if (this.minLevel === LOG_LEVELS.debug && entry.error.stack) {
        logMessage += `\n  Stack: ${entry.error.stack}`;
      }
    }

    // Output to appropriate stream
    if (entry.level === "error") {
      console.error(logMessage);
    } else {
      console.log(logMessage);
    }
  }

  /**
   * Get emoji for log level
   */
  private getLevelEmoji(level: LogLevel): string {
    switch (level) {
      case "debug":
        return "🐛";
      case "info":
        return "ℹ️";
      case "warn":
        return "⚠️";
      case "error":
        return "❌";
      default:
        return "📝";
    }
  }

  /**
   * Mask sensitive data in log output
   */
  private maskSensitiveData(key: string, value: unknown): unknown {
    const sensitiveKeys = [
      "token",
      "password",
      "apitoken",
      "api_token",
      "email",
    ];
    const lowerKey = key.toLowerCase();

    if (sensitiveKeys.some((k) => lowerKey.includes(k))) {
      return "***MASKED***";
    }

    // Recursively mask objects
    if (typeof value === "object" && value !== null) {
      const masked: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        masked[k] = this.maskSensitiveData(k, v);
      }
      return masked;
    }

    return value;
  }

  /**
   * Convert Error to structured error object
   */
  static serializeError(
    error: unknown,
  ): StandardLogEntry["error"] | undefined {
    if (error instanceof Error) {
      const result: {
        name: string;
        message: string;
        cause?: unknown;
        stack?: string;
      } = {
        name: error.name,
        message: error.message,
      };

      // Add cause if present
      if ("cause" in error && error.cause !== undefined) {
        result.cause = error.cause;
      }

      // Add stack if present
      if (error.stack) {
        result.stack = error.stack;
      }

      return result;
    }

    return {
      name: "UnknownError",
      message: String(error),
    };
  }
}

// Default logger instance
export const logger = new Logger();
