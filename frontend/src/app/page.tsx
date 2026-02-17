"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { fetchNext, submitAnswer } from "@/lib/api";
import { clearSessionId, loadSessionId, loadUserId, saveSessionId, saveUserId } from "@/lib/storage";
import type { QuizAnswerResponse, QuizNextResponse } from "@/types";

type ViewState =
  | { kind: "needsUser" }
  | { kind: "loading"; message: string }
  | { kind: "question"; q: QuizNextResponse; last?: QuizAnswerResponse }
  | { kind: "error"; message: string };

export default function HomePage() {
  const [userId, setUserId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [view, setView] = useState<ViewState>({ kind: "loading", message: "Loading..." });
  const [answering, setAnswering] = useState(false);

  useEffect(() => {
    const u = loadUserId();
    const s = loadSessionId();
    setUserId(u);
    setSessionId(s);
    setView(u ? { kind: "loading", message: "Fetching your next question..." } : { kind: "needsUser" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canStart = useMemo(() => userId.trim().length > 0, [userId]);

  async function startOrResume() {
    if (!canStart) return;
    const u = userId.trim();
    saveUserId(u);
    setView({ kind: "loading", message: "Fetching your next question..." });

    try {
      const q = await fetchNext({ userId: u, sessionId: sessionId || undefined });
      setSessionId(q.sessionId);
      saveSessionId(q.sessionId);
      setView({ kind: "question", q });
    } catch (e: any) {
      setView({ kind: "error", message: String(e?.message ?? "Failed to start") });
    }
  }

  async function answer(choice: string) {
    if (view.kind !== "question") return;
    if (answering) return;

    setAnswering(true);
    try {
      const result = await submitAnswer({
        userId: userId.trim(),
        sessionId: view.q.sessionId,
        questionId: view.q.questionId,
        answer: choice
      });

      // Immediately fetch /next so the UI always shows exactly one "active" question.
      const nextQ = await fetchNext({ userId: userId.trim(), sessionId: view.q.sessionId });
      setSessionId(nextQ.sessionId);
      saveSessionId(nextQ.sessionId);
      setView({ kind: "question", q: nextQ, last: result });
    } catch (e: any) {
      const msg = String(e?.message ?? "Answer failed");
      if (msg.toLowerCase().includes("session expired")) {
        clearSessionId();
        setSessionId("");
      }
      setView({ kind: "error", message: msg });
    } finally {
      setAnswering(false);
    }
  }

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-6">
        <div>
          <div className="text-xl font-semibold tracking-tight">BrainBolt</div>
          <div className="text-sm text-slate-600 dark:text-slate-400">Adaptive infinite quiz, one question at a time.</div>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/leaderboards"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
          >
            Leaderboards
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 pb-12">
        {view.kind === "needsUser" && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="text-lg font-semibold">Start a session</div>
            <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Enter a user ID (any string). Your session ID will be created automatically.
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="e.g. shreya"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-800 dark:bg-slate-950 dark:focus:ring-slate-800"
              />
              <button
                type="button"
                onClick={startOrResume}
                disabled={!canStart}
                className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
              >
                Start
              </button>
            </div>
          </div>
        )}

        {view.kind === "loading" && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="text-sm text-slate-600 dark:text-slate-400">{view.message}</div>
          </div>
        )}

        {view.kind === "error" && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-900 shadow-sm dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-100">
            <div className="font-semibold">Something went wrong</div>
            <div className="mt-1 text-sm opacity-90">{view.message}</div>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => setView(userId.trim() ? { kind: "loading", message: "Retrying..." } : { kind: "needsUser" })}
                className="rounded-xl bg-rose-900 px-4 py-2 text-sm font-semibold text-white dark:bg-rose-200 dark:text-rose-950"
              >
                Back
              </button>
              <button
                type="button"
                onClick={startOrResume}
                className="rounded-xl border border-rose-300 bg-transparent px-4 py-2 text-sm font-semibold text-rose-900 hover:bg-rose-100 dark:border-rose-900/40 dark:text-rose-100 dark:hover:bg-rose-950/60"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {view.kind === "question" && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-slate-600 dark:text-slate-400">
                User: <span className="font-medium text-slate-900 dark:text-slate-100">{userId || "—"}</span>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  Score: <span className="font-semibold">{view.q.currentScore}</span>
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  Streak: <span className="font-semibold">{view.q.currentStreak}</span>
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  Difficulty: <span className="font-semibold">{view.q.difficulty}</span>
                </span>
              </div>
            </div>

            {view.last && (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-800 dark:bg-slate-950/60">
                <div className="font-semibold">
                  {view.last.correct ? "Correct" : "Incorrect"}{" "}
                  <span className="font-normal text-slate-600 dark:text-slate-400">
                    (+{view.last.scoreDelta} points)
                  </span>
                </div>
                <div className="mt-1 text-slate-600 dark:text-slate-400">
                  New streak: <span className="font-semibold">{view.last.newStreak}</span> · New difficulty:{" "}
                  <span className="font-semibold">{view.last.newDifficulty}</span> · Total score:{" "}
                  <span className="font-semibold">{view.last.totalScore}</span>
                </div>
              </div>
            )}

            <div className="mt-5 text-lg font-semibold">{view.q.prompt}</div>
            <div className="mt-4 grid gap-3">
              {view.q.choices.map((c) => (
                <button
                  key={c}
                  type="button"
                  disabled={answering}
                  onClick={() => answer(c)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-medium shadow-sm hover:bg-slate-50 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900"
                >
                  {c}
                </button>
              ))}
            </div>

            <div className="mt-4 text-xs text-slate-500 dark:text-slate-400">
              Session: <span className="font-mono">{view.q.sessionId}</span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

