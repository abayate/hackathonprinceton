"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [{ href: "/", label: "Prospects" }, { href: "/projects", label: "Project research" }, { href: "/watchlist", label: "Saved" }, { href: "/evidence", label: "Evidence" }];

export default function AppNavigation() {
  const pathname = usePathname();
  return <header className="sticky top-0 z-20 border-b border-slate-200 bg-white print:hidden"><nav aria-label="Main navigation" className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-10 px-4 py-3 sm:px-6">
    <Link href="/" className="flex items-center gap-2.5 text-xl font-bold tracking-tight text-[#173831]"><span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-lg bg-[#215f4c] text-sm text-white">G</span>Groundwork</Link>
    <div className="mt-2 flex w-full items-center justify-between gap-1 text-xs font-medium sm:mt-0 sm:w-auto sm:justify-start sm:gap-5 sm:text-sm">{LINKS.map(({ href, label }) => {
      const active = pathname === href || (href === "/" && pathname.startsWith("/listings/")) || (href === "/projects" && (pathname.startsWith("/sites/") || pathname === "/workspace"));
      return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`whitespace-nowrap rounded-md px-2 py-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#215f4c] ${active ? "bg-[#e7eee8] text-[#173831]" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}>{label}</Link>;
    })}</div>
  </nav></header>;
}
