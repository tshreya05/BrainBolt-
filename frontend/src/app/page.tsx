"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { fetchNext, submitAnswer } from "@/lib/api";
import {
  clearSessionId,
  loadSessionId,
  loadUserId,
  saveSessionId,
  saveUserId
} from "@/lib/storage";
import type { QuizAnswerResponse, QuizNextResponse } from "@/types";

/* ---------- TYPES ---------- */
type ViewState =
  | { kind: "needsUser" }
  | { kind: "loading"; message: string }
  | { kind: "error"; message: string }
  | { kind: "question"; q: QuizNextResponse; last?: QuizAnswerResponse };

export default function HomePage() {
  const [userId, setUserId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [view, setView] = useState<ViewState>({
    kind: "loading",
    message: "Loading..."
  });
  const [answering, setAnswering] = useState(false);

  /* ---------- AUTO RESUME ---------- */
  useEffect(() => {
    const u = loadUserId();
    const s = loadSessionId();

    setUserId(u);
    setSessionId(s);

    if (u) {
      setView({ kind: "loading", message: "Fetching your next question..." });
      startOrResumeWith(u, s);
    } else {
      setView({ kind: "needsUser" });
    }
  }, []);

  const canStart = useMemo(() => userId.trim().length > 0, [userId]);

  /* ---------- FETCH QUESTION ---------- */
  async function startOrResumeWith(u: string, s?: string) {
    try {
      const q = await fetchNext({
        userId: u,
        sessionId: s || undefined
      });

      setSessionId(q.sessionId);
      saveSessionId(q.sessionId);

      setView({ kind: "question", q });
    } catch (e: any) {
      setView({
        kind: "error",
        message: String(e?.message ?? "Failed to start")
      });
    }
  }

  async function startOrResume() {
    if (!canStart) return;

    const u = userId.trim();
    saveUserId(u);

    setView({
      kind: "loading",
      message: "Fetching your next question..."
    });

    await startOrResumeWith(u, sessionId || undefined);
  }

  /* ---------- SUBMIT ANSWER ---------- */
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

      const nextQ = await fetchNext({
        userId: userId.trim(),
        sessionId: view.q.sessionId
      });

      setSessionId(nextQ.sessionId);
      saveSessionId(nextQ.sessionId);

      setView({
        kind: "question",
        q: nextQ,
        last: result
      });
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
      {/* HEADER */}
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-6">
        <div>
          <div className="text-xl font-semibold tracking-tight">
            BrainBolt
          </div>
          <div className="text-sm text-slate-600 dark:text-slate-400">
            Adaptive infinite quiz, one question at a time.
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/leaderboards"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium shadow-sm"
          >
            Leaderboards
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 pb-12">
        {/* USER INPUT */}
        {view.kind === "needsUser" && (
          <div className="rounded-2xl border p-6">
            <div className="text-lg font-semibold">Start a session</div>

            <div className="mt-4 flex gap-3">
              <input
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="e.g. shreya"
                className="w-full rounded-xl border px-4 py-3"
              />

              <button
                onClick={startOrResume}
                disabled={!canStart}
                className="rounded-xl bg-slate-900 px-5 py-3 text-white"
              >
                Start
              </button>
            </div>
          </div>
        )}

        {/* LOADING */}
        {view.kind === "loading" && (
          <div className="rounded-2xl border p-6">
            {view.message}
          </div>
        )}

        {/* ERROR */}
        {view.kind === "error" && (
          <div className="border rounded-2xl p-6 text-red-500">
            {view.message}
          </div>
        )}

        {/* QUESTION */}
        {view.kind === "question" && (
          <div className="rounded-2xl border p-6">

            {/* SCORE + STREAK + DIFFICULTY */}
            <div className="flex flex-wrap gap-3 mb-4 text-sm">
              <span>Score: {view.q.currentScore ?? 0}</span>
              <span>Streak: {view.q.currentStreak ?? 0}</span>
              <span>Difficulty: {view.q.difficulty ?? 1}</span>
            </div>

            {/* RESULT */}
            {view.last && (
              <div className="mb-4 text-sm">
                {view.last.correct ? "✅ Correct" : "❌ Incorrect"}
              </div>
            )}

            <div className="text-lg font-semibold">{view.q.prompt}</div>

            <div className="mt-4 grid gap-3">
              {(view.q.choices ?? []).map((c) => (
                <button
                  key={c}
                  disabled={answering}
                  onClick={() => answer(c)}
                  className="border rounded-xl px-4 py-3 text-left"
                >
                  {c}
                </button>
              ))}
            </div>

            <div className="mt-3 text-xs text-gray-500">
              Session: {view.q.sessionId}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
