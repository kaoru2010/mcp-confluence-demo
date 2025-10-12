/**
 * Correlation Context
 * Provides request-scoped correlation ID tracking using AsyncLocalStorage
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

/**
 * Manages correlation IDs across async operations
 * Each request gets a unique correlation ID that persists through the call stack
 */
export class CorrelationContext {
  private static storage = new AsyncLocalStorage<string>();

  /**
   * Runs a function with a new correlation ID
   * The correlation ID will be available to all async operations within the function
   */
  static run<T>(fn: () => T): T {
    const correlationId = randomUUID();
    return CorrelationContext.storage.run(correlationId, fn);
  }

  /**
   * Runs a function with a specific correlation ID
   * Useful for testing or when correlation ID is provided externally
   */
  static runWith<T>(correlationId: string, fn: () => T): T {
    return CorrelationContext.storage.run(correlationId, fn);
  }

  /**
   * Gets the current correlation ID
   * Returns undefined if not within a correlation context
   */
  static get(): string | undefined {
    return CorrelationContext.storage.getStore();
  }

  /**
   * Gets the current correlation ID or generates a new one
   * Use this when you need to ensure a correlation ID exists
   */
  static getOrCreate(): string {
    return CorrelationContext.get() || randomUUID();
  }
}
