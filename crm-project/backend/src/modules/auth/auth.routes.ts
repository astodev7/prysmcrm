import { FastifyInstance } from "fastify";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { AppError } from "../../utils/errors.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const attempts = new Map<string, { count: number; since: number }>();
const passwordSchema = z.string().min(12).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/).regex(/[^A-Za-z0-9]/);

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: passwordSchema,
  bootstrapKey: z.string().optional(),
  role: z.enum(["ADMIN", "COMERCIAL", "FINANCEIRO", "OPERACIONAL"]).optional(),
});

export async function authRoutes(app: FastifyInstance) {
  // POST /auth/login
  app.post("/login", async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const key = request.ip;
    const now = Date.now();
    const current = attempts.get(key);
    if (current && now - current.since < 15 * 60_000 && current.count >= 5) {
      throw new AppError("Muitas tentativas. Aguarde 15 minutos.", 429);
    }
    if (!current || now - current.since >= 15 * 60_000) attempts.set(key, { count: 0, since: now });

    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user || !user.active) {
      attempts.set(key, { count: (attempts.get(key)?.count ?? 0) + 1, since: attempts.get(key)?.since ?? now });
      throw new AppError("E-mail ou senha inválidos", 401);
    }

    const valid = await bcrypt.compare(body.password, user.password);
    if (!valid) {
      attempts.set(key, { count: (attempts.get(key)?.count ?? 0) + 1, since: attempts.get(key)?.since ?? now });
      throw new AppError("E-mail ou senha inválidos", 401);
    }
    attempts.delete(key);

    const token = app.jwt.sign({ sub: user.id, role: user.role, ver: user.authVersion }, { expiresIn: "15m" });
    const secure = env.NODE_ENV === "production" ? "; Secure" : "";
    reply.header("Set-Cookie", `crm_session=${encodeURIComponent(token)}; HttpOnly; SameSite=${env.NODE_ENV === "production" ? "None" : "Lax"}; Path=/; Max-Age=900${secure}`);

    return reply.send({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  });

  // POST /auth/register (somente ADMIN ou primeiro usuário)
  app.post("/register", async (request, reply) => {
    const body = registerSchema.parse(request.body);

    const usersCount = await prisma.user.count();
    if (usersCount === 0) {
      if (!env.BOOTSTRAP_ADMIN_SECRET || body.bootstrapKey !== env.BOOTSTRAP_ADMIN_SECRET) {
        throw new AppError("Cadastro inicial exige a chave de configuração do administrador", 403);
      }
    } else {
      await app.authenticate(request, reply);
      if (reply.sent) return;
      if (request.user.role !== "ADMIN") throw new AppError("Apenas administradores podem criar usuários", 403);
    }

    const exists = await prisma.user.findUnique({ where: { email: body.email } });
    if (exists) {
      throw new AppError("E-mail já cadastrado", 409);
    }

    const role = usersCount === 0 ? "ADMIN" : body.role ?? "COMERCIAL";

    const hash = await bcrypt.hash(body.password, env.BCRYPT_SALT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        password: hash,
        role,
      },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });

    return reply.status(201).send(user);
  });

  app.post("/logout", { onRequest: [app.authenticate] }, async (request, reply) => {
    await prisma.user.update({ where: { id: request.user.sub }, data: { authVersion: { increment: 1 } } });
    const secure = env.NODE_ENV === "production" ? "; Secure" : "";
    reply.header("Set-Cookie", `crm_session=; HttpOnly; SameSite=${env.NODE_ENV === "production" ? "None" : "Lax"}; Path=/; Max-Age=0${secure}`);
    return reply.status(204).send();
  });

  app.post("/change-password", { onRequest: [app.authenticate] }, async (request, reply) => {
    const body = z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema }).parse(request.body);
    const user = await prisma.user.findUnique({ where: { id: request.user.sub } });
    if (!user || !(await bcrypt.compare(body.currentPassword, user.password))) {
      throw new AppError("Senha atual incorreta", 400);
    }
    await prisma.user.update({ where: { id: user.id }, data: { password: await bcrypt.hash(body.newPassword, env.BCRYPT_SALT_ROUNDS), authVersion: { increment: 1 } } });
    const secure = env.NODE_ENV === "production" ? "; Secure" : "";
    reply.header("Set-Cookie", `crm_session=; HttpOnly; SameSite=${env.NODE_ENV === "production" ? "None" : "Lax"}; Path=/; Max-Age=0${secure}`);
    return { message: "Senha alterada. Entre novamente." };
  });

  // GET /auth/me
  app.get(
    "/me",
    { onRequest: [app.authenticate] },
    async (request) => {
      const user = await prisma.user.findUnique({
        where: { id: request.user.sub },
        select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
      });

      if (!user || !user.active) {
        throw new AppError("Usuário não encontrado", 404);
      }

      return user;
    },
  );
}
