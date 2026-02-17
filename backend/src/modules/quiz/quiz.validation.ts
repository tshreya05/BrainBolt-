import { z } from "zod";

export const QuizNextRequestSchema = z.object({
  userId: z.string().min(1),
  sessionId: z.string().min(1).optional()
});

export const QuizAnswerRequestSchema = z.object({
  userId: z.string().min(1),
  sessionId: z.string().min(1),
  questionId: z.string().uuid(),
  answer: z.string().min(1)
});

export type QuizNextRequest = z.infer<typeof QuizNextRequestSchema>;
export type QuizAnswerRequest = z.infer<typeof QuizAnswerRequestSchema>;

