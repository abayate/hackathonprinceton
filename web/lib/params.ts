function finiteNumber(raw: unknown): number | undefined {
  if (typeof raw !== "string" && typeof raw !== "number") return undefined;
  if (typeof raw === "string" && raw.trim() === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

export function parseMw(raw: unknown): number {
  const value = finiteNumber(raw);
  return value === undefined ? 100 : Math.min(5000, Math.max(1, value));
}

export function parseMinAcres(raw: unknown): number | undefined {
  const value = finiteNumber(raw);
  return value !== undefined && value >= 0 ? value : undefined;
}

export function parseMaxWaterStress(raw: unknown): number | undefined {
  const value = finiteNumber(raw);
  return value !== undefined && value >= 0 && value <= 5 ? value : undefined;
}

export function isClientId(value: unknown): value is string {
  return typeof value === "string" && value.length === 36 && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value);
}

export function isWatchlistId(value: unknown): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= 100 && !/[^A-Za-z0-9_-]/.test(value);
}

export function parseAsOf(raw: unknown): string | undefined {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw) || raw.startsWith("0000")) return undefined;
  const date = new Date(`${raw}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === raw ? raw : undefined;
}
