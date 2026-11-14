"use client";

import { useEffect, useState } from "react";
import { emptyPropertyReview, loadPropertyReview, PROPERTY_DECISIONS, PROPERTY_DILIGENCE_TASKS, PROPERTY_REVIEW_NOTE_LIMIT, propertyReviewKey, savePropertyReview, type PropertyReview } from "@/lib/propertyReview";

export default function PropertyDiligence({ propertyId }: { propertyId: string }) {
  const [review, setReview] = useState(() => emptyPropertyReview(propertyId));
  const [base, setBase] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("Opening your property review…");

  useEffect(() => {
    try {
      const loaded = loadPropertyReview(window.localStorage, propertyId);
      if (loaded.review) {
        setReview(loaded.review); setBase(loaded.raw);
        setMessage(loaded.raw ? "Loaded your saved review." : "Start a review for this property.");
      } else {
        setBlocked(true);
        setMessage("Saved notes could not be opened. Existing browser data has been kept; changes cannot be saved here.");
      }
    } catch {
      setBlocked(true); setMessage("Browser storage is unavailable. Your notes cannot be saved here.");
    }
    setReady(true);
    const onStorage = (event: StorageEvent) => {
      if (event.key === propertyReviewKey(propertyId) || event.key === null) {
        setConflict(true);
        setMessage("This property's saved review changed in another tab. Your draft is kept here; load the saved version before saving again.");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [propertyId]);

  function change(next: PropertyReview) {
    setReview(next); setDirty(true);
    if (!conflict && !blocked) setMessage("Unsaved changes. Save this property review before leaving.");
  }

  function save() {
    try {
      const result = savePropertyReview(window.localStorage, propertyId, base, review);
      if (result.ok) {
        setBase(result.raw); setDirty(false); setMessage("Property review saved in this browser.");
      } else if (result.reason === "conflict") {
        setConflict(true); setMessage("A newer review was saved in another tab. Your draft has not overwritten it.");
      } else {
        setMessage("The review could not be saved. Keep this page open and copy your notes before leaving.");
      }
    } catch { setMessage("Browser storage is unavailable. Copy your notes before leaving."); }
  }

  function reloadSaved() {
    try {
      const loaded = loadPropertyReview(window.localStorage, propertyId);
      if (!loaded.review) { setMessage("Saved notes could not be opened. Your current draft is kept."); return; }
      setReview(loaded.review); setBase(loaded.raw); setConflict(false); setBlocked(false); setDirty(false);
      setMessage("Loaded the saved review. The previous draft was discarded.");
    } catch { setMessage("Browser storage is unavailable. Your current draft is kept."); }
  }

  return <section id="property-review" className="scroll-mt-24 rounded-2xl border border-[#cedbd5] bg-[#f5f8f6] p-5 sm:p-7">
    <h2 className="text-2xl font-semibold tracking-tight text-[#173831]">Your property review</h2>
    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Keep a next step and diligence checklist for this prospect. Your decision is separate from the model. Marking an item reviewed does not verify it or change a screening check.</p>
    <fieldset disabled={!ready} className="mt-6 space-y-5">
      <div>
        <label htmlFor="property-decision" className="block text-sm font-semibold text-slate-900">Your next move</label>
        <select id="property-decision" value={review.decision} onChange={(event) => change({ ...review, decision: event.target.value as PropertyReview["decision"] })} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base sm:max-w-xs">
          {Object.entries(PROPERTY_DECISIONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="property-notes" className="block text-sm font-semibold text-slate-900">Rationale and follow-up notes</label>
        <textarea id="property-notes" value={review.notes} maxLength={PROPERTY_REVIEW_NOTE_LIMIT} rows={4} onChange={(event) => change({ ...review, notes: event.target.value })} placeholder="What would you need to learn before pursuing this property?" className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base" aria-describedby="property-storage-note" />
        <p id="property-storage-note" className="mt-2 text-xs leading-5 text-slate-500">Saved only in this browser on this address, not shared with your team. Clearing browser data removes the review.</p>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Diligence to resolve</h3>
        <p className="mt-1 text-sm text-slate-600">{review.reviewed.length} of {PROPERTY_DILIGENCE_TASKS.length} items marked reviewed by you</p>
        <ul className="mt-3 divide-y divide-[#dce5df]">
          {PROPERTY_DILIGENCE_TASKS.map((task) => <li key={task.id} className="py-3">
            <label className="flex cursor-pointer items-start gap-3">
              <input type="checkbox" checked={review.reviewed.includes(task.id)} onChange={(event) => change({ ...review, reviewed: event.target.checked ? [...review.reviewed, task.id] : review.reviewed.filter((id) => id !== task.id) })} className="mt-1 h-4 w-4 shrink-0 accent-[#215f4c]" />
              <span><span className="block font-medium text-slate-900">{task.title}</span><span className="mt-1 block text-sm leading-5 text-slate-600">{task.action}</span></span>
            </label>
          </li>)}
        </ul>
      </div>
    </fieldset>
    <div className="mt-5 flex flex-wrap items-center gap-3">
      <button type="button" onClick={save} disabled={!ready || blocked || conflict || !dirty} className="rounded-lg bg-[#215f4c] px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Save property review</button>
      {conflict && <button type="button" onClick={reloadSaved} className="rounded-lg border border-slate-400 px-3 py-2 text-sm font-medium text-slate-800">Load saved version and discard this draft</button>}
    </div>
    <p role="status" className={`mt-3 text-sm leading-5 ${conflict || blocked ? "text-amber-900" : "text-slate-600"}`}>{message}</p>
  </section>;
}
