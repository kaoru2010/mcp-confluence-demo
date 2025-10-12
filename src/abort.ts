/**
 * Abort Signal Utilities
 * Provides helper functions for timeout and cancellation handling
 */

import type { IOOptions } from "./types.js";

/**
 * Default timeout for external I/O operations (10 seconds)
 */
export const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Creates an AbortSignal with timeout and optional parent signal
 *
 * @param options - IO options containing optional signal and timeout
 * @returns Combined AbortSignal that triggers on either timeout or parent signal abort
 *
 * @example
 * ```typescript
 * const signal = createAbortSignal({ timeoutMs: 5000 });
 * await fetch(url, { signal });
 * ```
 *
 * @example
 * ```typescript
 * // Combine with parent signal
 * const parentSignal = AbortSignal.timeout(30000);
 * const signal = createAbortSignal({ signal: parentSignal, timeoutMs: 10000 });
 * // Will abort after 10 seconds OR when parent aborts
 * ```
 */
export function createAbortSignal(options?: IOOptions): AbortSignal {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeoutSignal = AbortSignal.timeout(timeoutMs);

  if (options?.signal) {
    // Combine parent signal and timeout signal
    return AbortSignal.any([options.signal, timeoutSignal]);
  }

  return timeoutSignal;
}

/**
 * Checks if an error is an AbortError
 *
 * @param error - Error to check
 * @returns True if error is an AbortError
 */
export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/**
 * Gets the abort reason (timeout or cancelled)
 *
 * @param signal - AbortSignal to check
 * @returns "timeout" if timed out, "cancelled" otherwise
 */
export function getAbortReason(signal: AbortSignal): "timeout" | "cancelled" {
  // Check if the reason is a timeout
  if (
    signal.reason instanceof Error &&
    signal.reason.message?.includes("timeout")
  ) {
    return "timeout";
  }
  return "cancelled";
}
