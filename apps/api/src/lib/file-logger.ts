import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

function resolveLogDir(): string {
  for (const candidate of [
    resolve(process.cwd(), "../../logs"),
    resolve(process.cwd(), "../../../logs"),
    resolve(process.cwd(), "logs"),
  ]) {
    const parent = resolve(candidate, "..");
    if (existsSync(parent)) {
      mkdirSync(candidate, { recursive: true });
      return candidate;
    }
  }

  const fallback = resolve(process.cwd(), "logs");
  mkdirSync(fallback, { recursive: true });
  return fallback;
}

function serializeMeta(meta?: Record<string, unknown>): string {
  if (!meta || Object.keys(meta).length === 0) return "";
  return ` ${JSON.stringify(meta)}`;
}

function writeLine(filename: string, level: string, message: string, meta?: Record<string, unknown>) {
  const logDir = resolveLogDir();
  const line = `${new Date().toISOString()} [${level}] ${message}${serializeMeta(meta)}\n`;
  appendFileSync(resolve(logDir, filename), line, "utf8");
}

export function createFileLogger(filename: string) {
  return {
    info(message: string, meta?: Record<string, unknown>) {
      writeLine(filename, "INFO", message, meta);
    },
    warn(message: string, meta?: Record<string, unknown>) {
      writeLine(filename, "WARN", message, meta);
    },
    error(message: string, meta?: Record<string, unknown>) {
      writeLine(filename, "ERROR", message, meta);
    },
  };
}
