export default function PublicModeBanner({ savedLocalSession = false }: { savedLocalSession?: boolean }) {
  return (
    <aside className="mb-5 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
      <p>Public data mode: Texas tracked projects only. Sponsor listings, imagery and the live database are not loaded.</p>
      {savedLocalSession && <p className="mt-1 text-xs">Saved for this local session only.</p>}
    </aside>
  );
}
