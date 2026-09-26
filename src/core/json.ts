import type { JsonValue } from './types';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Copy only JSON-shaped values, with bounds for deeply nested or oversized unknown data. */
export function toJsonValue(value: unknown, depth = 0, budget = { remaining: 20_000 }): JsonValue | undefined {
  if (budget.remaining <= 0 || depth > 48) return undefined;
  budget.remaining -= 1;

  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) {
    const result: JsonValue[] = [];
    for (const item of value) {
      if (budget.remaining <= 0) break;
      const converted = toJsonValue(item, depth + 1, budget);
      if (converted !== undefined) result.push(converted);
    }
    return result;
  }
  if (!isRecord(value)) return undefined;

  const result: Record<string, JsonValue> = {};
  for (const [key, item] of Object.entries(value)) {
    if (budget.remaining <= 0) break;
    const converted = toJsonValue(item, depth + 1, budget);
    if (converted !== undefined) result[key] = converted;
  }
  return result;
}

export function stringProperty(record: Record<string, unknown>, ...keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return undefined;
}
