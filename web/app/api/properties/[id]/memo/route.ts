import { isPropertyId, reply } from "@/lib/apiSession";
import { getStore } from "@/lib/gwStore";
import { verifyMemoDigest } from "@/lib/propertyInvestigator";

export const runtime = "nodejs";

/** The most recent saved memo for a property. Always live: false; the UI shows generated_at and "Saved". */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isPropertyId(id)) return reply(req, 404, { detail: "Unknown property." });
  try {
    const memo = await (await getStore()).loadLatestMemo(id);
    if (!memo) return reply(req, 404, { detail: "No saved memo for this property." });
    return reply(req, 200, { ...memo, live: false, digest_matches: verifyMemoDigest(memo) });
  } catch {
    console.error("Memo lookup failed");
    return reply(req, 503, { detail: "Memos are temporarily unavailable." });
  }
}
