import { reply } from "@/lib/apiSession";
import { getStore } from "@/lib/gwStore";
import type { Run } from "@/lib/runTypes";

export const runtime = "nodejs";

const LIVE_WINDOW_MS = 5 * 60_000;
const isRunId =(value: string) => /^run_[0-9a-f-]{36}$/.test(value);

/** Poll every 2 seconds while status is "running" (contract §6). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isRunId(id)) return reply(req, 404, { detail: "Unknown run." });
  try {
    const store = await getStore();
    const record = await store.loadRun(id);
    if (!record) return reply(req, 404, { detail: "Unknown run." });
    const { memo_id, ...rest } = record;
    const memo = memo_id ? await store.loadMemo(memo_id) : null;
    // Live only right after generation; revisiting an old run shows the memo as saved (contract rule 6).
    const live = memo !== null && Date.now() - Date.parse(memo.generated_at) < LIVE_WINDOW_MS;
    const run: Run = { ...rest, memo: memo ? { ...memo, live } : null };
    return reply(req, 200, run);
  } catch {
    console.error("Run lookup failed");
    return reply(req, 503, { detail: "Runs are temporarily unavailable." });
  }
}
