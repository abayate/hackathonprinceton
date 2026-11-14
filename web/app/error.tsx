"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-6 text-center">
      <h1 className="text-xl font-semibold text-slate-900">Data is temporarily unavailable. Please try again.</h1>
      <button type="button" onClick={reset} className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
        Try again
      </button>
    </main>
  );
}
