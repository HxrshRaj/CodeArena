"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

const difficultyColor: Record<string, string> = {
  easy: "text-emerald-400",
  medium: "text-amber-400",
  hard: "text-rose-400",
};

export default function ChallengeListPage(): React.ReactNode {
  const { data, isLoading, error } = useQuery({
    queryKey: ["challenges"],
    queryFn: api.listChallenges,
  });

  return (
    <div>
      <h1 className="text-lg text-slate-100 mb-1">Coding challenges</h1>
      <p className="text-sm text-slate-400 mb-6">
        Pick a challenge, write a Python solution, submit. Test cases run in a sandbox and stream
        back live; a separate AI review comments on style.
      </p>

      {isLoading && <p className="text-slate-500 text-sm">Loading…</p>}
      {error && <p className="text-rose-400 text-sm">Failed to load: {String(error)}</p>}

      <ul className="grid gap-3 sm:grid-cols-2">
        {data?.map((c) => (
          <li key={c.id}>
            <Link
              href={`/challenges/${c.slug}`}
              className="block rounded-lg border border-slate-800 bg-slate-900/40 p-4 hover:border-slate-600 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="text-slate-100">{c.title}</span>
                <span className={`text-xs uppercase ${difficultyColor[c.difficulty] ?? ""}`}>
                  {c.difficulty}
                </span>
              </div>
              <span className="text-xs text-slate-500">{c.language}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
