/** Public mode is explicit so missing database configuration cannot silently change data sources. */
export function isPublicDataMode(): boolean {
  const mode = process.env.DATA_MODE;
  if (mode === undefined) return false;
  if (mode === "public") return true;
  throw new Error(`Unsupported DATA_MODE: ${mode}`);
}
