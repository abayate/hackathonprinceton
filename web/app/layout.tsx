import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Groundwork",
  description: "Browse data center sites like listings and see, in months and dollars, whether each one will get built.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} bg-white antialiased`}>
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
          <nav className="mx-auto flex h-16 max-w-[1600px] items-center gap-8 px-4 sm:px-6">
            <Link href="/" className="flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-900 text-sm text-white">G</span>
              Groundwork
            </Link>
            <div className="hidden gap-6 text-sm font-medium text-slate-600 md:flex">
              <Link href="/" className="hover:text-slate-900">Find sites</Link>
              <Link href="/evidence" className="hover:text-slate-900">Evidence</Link>
              <Link href="/watchlist" className="hover:text-slate-900">Watchlist</Link>
            </div>
            <span className="ml-auto hidden rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 sm:block">
              Risk model trained on 102 real Texas projects
            </span>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
