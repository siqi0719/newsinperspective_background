import { createHash } from "node:crypto";
import { normalizeWhitespace } from "./text.js";

function normalizeForFingerprint(value: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildTextFingerprint(...parts: Array<string | null | undefined>): string | null {
  const combined = parts
    .filter(Boolean)
    .map((part) => normalizeForFingerprint(part!))
    .join(" ")
    .trim();

  if (combined.length < 120) {
    return null;
  }

  return createHash("sha256").update(combined).digest("hex");
}
