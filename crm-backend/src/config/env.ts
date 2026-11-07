import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3333),
  APP_URL: z.string().default("http://localhost:3333"),
  FRONTEND_URL: z.string().default("http://localhost:5173"),
  DATABASE_URL: z.string(),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default("7d"),
  BCRYPT_SALT_ROUNDS: z.coerce.number().default(12),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Variáveis de ambiente inválidas:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
