export type QuizNextRequest = {
  userId: string;
  sessionId?: string;
};

export type QuizNextResponse = {
  questionId: string;
  difficulty: number;
  prompt: string;
  choices: string[];
  sessionId: string;
  currentScore: number;
  currentStreak: number;
};

export type QuizAnswerRequest = {
  userId: string;
  sessionId: string;
  questionId: string;
  answer: string;
};

export type QuizAnswerResponse = {
  correct: boolean;
  newDifficulty: number;
  newStreak: number;
  scoreDelta: number;
  totalScore: number;
};

export type LeaderboardItem = {
  rank: number;
  userId: string;
  value: number;
};

export type LeaderboardResponse = {
  items: LeaderboardItem[];
};

