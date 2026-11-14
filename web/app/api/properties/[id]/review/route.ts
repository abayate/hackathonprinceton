import { clientSession, isPropertyId, isSameOrigin, reply } from "@/lib/apiSession";
import { getStore } from "@/lib/gwStore";
import { emptyPropertyReview, isPropertyReview } from "@/lib/propertyReview";
import { readJsonBody } from "@/lib/requestBody";

export const runtime = "nodejs";
const BODY_LIMIT = 16_384;

/** This browser's review of one property (decision, notes, diligence tasks done). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isPropertyId(id)) return reply(req, 404, { detail: "Unknown property." });
  const session = await clientSession();
  try {
    const review = session.isNew ? null : await (await getStore()).loadPropertyReview(session.id, id);
    return reply(req, 200, review ?? emptyPropertyReview(id), session);
  } catch {
    console.error("Property review lookup failed");
    return reply(req, 503, { detail: "Reviews are temporarily unavailable." }, session);
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isPropertyId(id)) return reply(req, 404, { detail: "Unknown property." });
  if (!isSameOrigin(req)) return reply(req, 422, { detail: "Save reviews from this site." });
  const body = await readJsonBody(req, BODY_LIMIT);
  if (!body.ok || !isPropertyReview(body.value, id)) return reply(req, 422, { detail: "A valid review is required." });
  const session = await clientSession();
  try {
    const { version, propertyId, decision, notes, reviewed } = body.value;
    const review = { version, propertyId, decision, notes, reviewed: [...reviewed] };
    await (await getStore()).savePropertyReview(session.id, review);
    return reply(req, 200, review, session);
  } catch {
    console.error("Property review save failed");
    return reply(req, 503, { detail: "Reviews are temporarily unavailable." }, session);
  }
}
