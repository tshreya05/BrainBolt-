import { Router } from "express";
import { QuizAnswerRequestSchema, QuizNextRequestSchema } from "./quiz.validation";
import { getNextQuestion, submitAnswer } from "./quiz.service";

export const quizRouter = Router();

function pickFromQueryOrBody(req: any) {
  return {
    userId: (req.body?.userId ?? req.query?.userId) as unknown,
    sessionId: (req.body?.sessionId ?? req.query?.sessionId) as unknown
  };
}

// GET /v1/quiz/next
// Note: Assignment shows a JSON request body for a GET.
// Many HTTP clients do not send bodies for GET, so we support both:
// - query params: ?userId=...&sessionId=...
// - JSON body: { userId, sessionId }
quizRouter.get("/next", async (req, res) => {
  const parsed = QuizNextRequestSchema.safeParse(pickFromQueryOrBody(req));
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten().fieldErrors });
  }

  const data = await getNextQuestion(parsed.data.userId, parsed.data.sessionId);
  return res.json(data);
});

// POST /v1/quiz/answer
quizRouter.post("/answer", async (req, res) => {
  const parsed = QuizAnswerRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten().fieldErrors });
  }

  try {
    const out = await submitAnswer(parsed.data);
    return res.json(out);
  } catch (e: any) {
    const status = typeof e?.statusCode === "number" ? e.statusCode : 500;
    const msg = status === 500 ? "Internal Server Error" : String(e?.message ?? "Error");
    return res.status(status).json({ error: msg });
  }
});

