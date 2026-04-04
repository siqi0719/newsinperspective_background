import { existsSync } from "node:fs";
import { resolve } from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

for (const candidate of [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "../../.env"),
  resolve(process.cwd(), "../../../.env"),
]) {
  if (existsSync(candidate)) {
    dotenv.config({ path: candidate });
    break;
  }
}

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(4400),
  HOST: z.string().default("0.0.0.0"),
  WEB_ORIGIN: z.string().default("http://localhost:5317"),
  KAGI_KITE_URL: z
    .string()
    .url()
    .default("https://raw.githubusercontent.com/kagisearch/kite-public/main/kite_feeds.json"),
  AUTO_INGEST: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  AUTO_INGEST_TIME_UTC: z.string().default("12:30"),
  RSS_FETCH_TIMEOUT_MS: z.coerce.number().default(10000),
  INGEST_FEED_LIMIT: z.coerce.number().optional(),
});

export const env = envSchema.parse(process.env);
