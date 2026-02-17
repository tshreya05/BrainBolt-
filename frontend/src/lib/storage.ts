const USER_ID_KEY = "brainbolt:userId";
const SESSION_ID_KEY = "brainbolt:sessionId";

export function loadUserId(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(USER_ID_KEY) ?? "";
}

export function saveUserId(userId: string): void {
  localStorage.setItem(USER_ID_KEY, userId);
}

export function loadSessionId(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(SESSION_ID_KEY) ?? "";
}

export function saveSessionId(sessionId: string): void {
  localStorage.setItem(SESSION_ID_KEY, sessionId);
}

export function clearSessionId(): void {
  localStorage.removeItem(SESSION_ID_KEY);
}

