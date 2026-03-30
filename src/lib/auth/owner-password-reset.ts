import { createHash, randomInt } from "crypto";

const CODE_LENGTH = 6;
const MAX_ATTEMPTS = 8;
const TTL_MINUTES = 15;

export function getPasswordResetCodePepper(): string {
  const p = process.env.PASSWORD_RESET_CODE_SECRET?.trim();
  if (p) return p;
  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!fallback) throw new Error("Missing PASSWORD_RESET_CODE_SECRET or SUPABASE_SERVICE_ROLE_KEY");
  return fallback;
}

export function hashOwnerResetCode(code: string): string {
  const pepper = getPasswordResetCodePepper();
  return createHash("sha256").update(`${pepper}:${code}`, "utf8").digest("hex");
}

export function generateOwnerResetNumericCode(): string {
  const min = 10 ** (CODE_LENGTH - 1);
  const max = 10 ** CODE_LENGTH - 1;
  return String(randomInt(min, max + 1));
}

export function normalizeBrazilPhoneDigits(input: string): string {
  return input.replace(/\D/g, "");
}

export function isLikelyBrazilCellular(digits: string): boolean {
  return digits.length >= 10 && digits.length <= 13;
}

export { MAX_ATTEMPTS, TTL_MINUTES };
