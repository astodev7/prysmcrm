import "dotenv/config";
import { z } from "zod";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const envSchema = z.object({
  NODE_ENV: z.preprocess(
    emptyToUndefined,
    z.enum(["development", "production", "test"]).default("production"),
  ),
  PORT: z.preprocess(emptyToUndefined, z.coerce.number().default(3333)),
  APP_URL: z.preprocess(
    emptyToUndefined,
    z.string().default("http://localhost:3333"),
  ),
  FRONTEND_URL: z.preprocess(
    emptyToUndefined,
    z.string().default("http://localhost:5173"),
  ),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  TOTP_ENCRYPTION_KEY: z.preprocess(emptyToUndefined, z.string().min(32).optional()),
  BOOTSTRAP_ADMIN_SECRET: z.preprocess(emptyToUndefined, z.string().min(32).optional()),
  JWT_EXPIRES_IN: z.preprocess(emptyToUndefined, z.string().default("7d")),
  BCRYPT_SALT_ROUNDS: z.preprocess(
    emptyToUndefined,
    z.coerce.number().default(12),
  ),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Variáveis de ambiente inválidas:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
