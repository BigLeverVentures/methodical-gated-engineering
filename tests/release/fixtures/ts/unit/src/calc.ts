/** The sum of values. */
export function total(values: readonly number[]): number {
  return values.reduce((sum, v) => sum + v, 0);
}

/** The arithmetic mean of values; throws on an empty list. */
export function mean(values: readonly number[]): number {
  if (values.length === 0) throw new RangeError("mean of an empty list");
  return total(values) / values.length;
}
