/** Outcome of an operation that can fail in an expected way. Unexpected failures still throw. */
export type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

/**
 * Wraps a successful value.
 * @param value The value the operation produced.
 * @returns A successful result holding `value`.
 */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/**
 * Wraps an expected failure.
 * @param error What went wrong, as a value the caller can branch on.
 * @returns A failed result holding `error`.
 */
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
