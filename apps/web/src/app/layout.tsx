import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "CodeArena",
  description: "Technical assessment platform — sandboxed execution + separate AI code review",
};

export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <html lang="en">
      <body className="min-h-screen font-mono">
        <Providers>
          <header className="border-b border-slate-800 px-6 py-3 flex items-center gap-6 text-sm">
            <Link href="/" className="font-semibold text-slate-100">
              CodeArena
            </Link>
            <nav className="flex gap-4 text-slate-400">
              <Link href="/" className="hover:text-slate-200">
                Challenges
              </Link>
              <Link href="/submissions" className="hover:text-slate-200">
                Recruiter dashboard
              </Link>
            </nav>
          </header>
          <main className="px-6 py-6 max-w-6xl mx-auto">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
