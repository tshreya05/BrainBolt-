import crypto from "crypto";

/**
 * Normalize user answer exactly like our DB seed hashing.
 * - trim whitespace
 * - lowercase
 */
export function normalizeAnswer(answer: string): string {
  return answer.trim().toLowerCase();
}

export function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

