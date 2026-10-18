/** The sum of values. */
export function total(values: readonly number[]): number {
  return values.reduce((sum, v) => sum + v, 0);
}
