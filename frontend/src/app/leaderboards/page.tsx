"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { fetchScoreLeaderboard, fetchStreakLeaderboard } from "@/lib/api";
import type { LeaderboardItem } from "@/types";

function Table({ title, items, label }: { title: string; items: LeaderboardItem[]; label: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="text-lg font-semibold">{title}</div>
      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600 dark:bg-slate-950/60 dark:text-slate-300">
            <tr>
              <th className="px-4 py-3">Rank</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">{label}</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-slate-600 dark:text-slate-400" colSpan={3}>
                  No data yet. Answer some questions to appear here.
                </td>
              </tr>
            ) : (
              items.map((it) => (
                <tr key={`${title}-${it.userId}`} className="border-t border-slate-200 dark:border-slate-800">
                  <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">{it.rank}</td>
                  <td className="px-4 py-3 font-medium">{it.userId}</td>
                  <td className="px-4 py-3 font-semibold">{it.value}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function LeaderboardsPage() {
  const [score, setScore] = useState<LeaderboardItem[]>([]);
  const [streak, setStreak] = useState<LeaderboardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const [s1, s2] = await Promise.all([fetchScoreLeaderboard(), fetchStreakLeaderboard()]);
        if (!alive) return;
        setScore(s1.items);
        setStreak(s2.items);
      } catch (e: any) {
        if (!alive) return;
        setError(String(e?.message ?? "Failed to load leaderboards"));
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-6">
        <div>
          <div className="text-xl font-semibold tracking-tight">Leaderboards</div>
          <div className="text-sm text-slate-600 dark:text-slate-400">Updated after every answer.</div>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
          >
            Back to quiz
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 pb-12">
        {loading && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="text-sm text-slate-600 dark:text-slate-400">Loading...</div>
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-900 shadow-sm dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-100">
            <div className="font-semibold">Could not load leaderboards</div>
            <div className="mt-1 text-sm opacity-90">{error}</div>
          </div>
        )}

        {!loading && !error && (
          <div className="grid gap-6">
            <Table title="Top by Total Score" items={score} label="Score" />
            <Table title="Top by Highest Streak" items={streak} label="Streak" />
          </div>
        )}
      </main>
    </div>
  );
}

