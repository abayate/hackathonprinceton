import { NextResponse } from "next/server";
import { isPublicDataMode } from "@/lib/dataMode";
import { isPropertyInvestigatorEnabled } from "@/lib/featureFlags";
import { isGeminiConfigured } from "@/lib/geminiClient";
import { storeKind } from "@/lib/gwStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Status = "ok" | "down" | "off";

/** Service status for deploy checks. Reports configuration and reachability only, never values. */
export async function GET() {
  let database: Status = "off";
  let store: string;
  try { store = storeKind(); } catch { store = "invalid"; }
  if (!isPublicDataMode()) {
    try {
      const { pool } = await import("@/lib/db");
      await pool.query("SELECT 1");
      database = "ok";
    } catch { database = "down"; }
  }
  const gemini: Status = isGeminiConfigured() ? "ok" : "off";
  const status = database === "down" || store === "invalid" ? "degraded" : "ok";
  return NextResponse.json({
    status,
    data_mode: isPublicDataMode() ? "public" : "database",
    tiger: database,
    store,
    gemini,
    property_investigator: isPropertyInvestigatorEnabled() ? "on" : "off",
    attestation: "unavailable",
  }, { status: status === "ok" ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
