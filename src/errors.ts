/**
 * Domain Error Classes
 * Provides structured error handling for MCP Confluence Server
 */

/**
 * Base domain error class
 * All domain-specific errors should extend this class
 */
export class DomainError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
    public readonly code?: string,
  ) {
    super(message);
    this.name = this.constructor.name;

    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * External service error (e.g., Confluence API failures)
 */
export class ExternalServiceError extends DomainError {
  constructor(
    public readonly service: string,
    message: string,
    cause?: unknown,
  ) {
    super(
      `External service error (${service}): ${message}`,
      cause,
      "EXTERNAL_SERVICE_ERROR",
    );
  }
}

/**
 * Validation error for input parameters
 */
export class ValidationError extends DomainError {
  constructor(
    public readonly field: string,
    message: string,
  ) {
    super(
      `Validation failed: ${field} - ${message}`,
      undefined,
      "VALIDATION_ERROR",
    );
  }
}

/**
 * Page not found error
 */
export class PageNotFoundError extends DomainError {
  constructor(public readonly pageId: string) {
    super(`Page not found: ${pageId}`, undefined, "PAGE_NOT_FOUND");
  }
}

/**
 * Authentication error
 */
export class AuthenticationError extends DomainError {
  constructor(message: string, cause?: unknown) {
    super(`Authentication failed: ${message}`, cause, "AUTHENTICATION_ERROR");
  }
}

/**
 * Authorization/Permission error
 */
export class AuthorizationError extends DomainError {
  constructor(
    public readonly resource: string,
    message?: string,
  ) {
    super(
      `Authorization failed: ${message || `Access denied to ${resource}`}`,
      undefined,
      "AUTHORIZATION_ERROR",
    );
  }
}

/**
 * Rate limit error
 */
export class RateLimitError extends DomainError {
  constructor(
    public readonly service: string,
    public readonly retryAfter?: number,
  ) {
    super(
      `Rate limit exceeded for ${service}${retryAfter ? `. Retry after ${retryAfter}s` : ""}`,
      undefined,
      "RATE_LIMIT_ERROR",
    );
  }
}

/**
 * Invalid URL format error
 */
export class InvalidUrlError extends DomainError {
  constructor(
    public readonly url: string,
    message?: string,
  ) {
    super(
      `Invalid URL: ${url}${message ? ` - ${message}` : ""}`,
      undefined,
      "INVALID_URL_ERROR",
    );
  }
}

export class ConfluenceClientError extends DomainError {
  constructor(message: string, cause?: unknown, code?: string) {
    super(message, cause, code ?? "CONFLUENCE_CLIENT_ERROR");
  }
}
