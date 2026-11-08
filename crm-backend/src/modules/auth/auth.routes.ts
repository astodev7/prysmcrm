import { FastifyInstance } from "fastify";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { AppError } from "../../utils/errors.js";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "A nova senha precisa ter pelo menos 8 caracteres"),
});

// Mesma mensagem para "usuário não existe", "inativo" e "senha errada"
// (não revela quais e-mails estão cadastrados).
const INVALID_LOGIN = "E-mail ou senha inválidos";

export async function authRoutes(app: FastifyInstance) {
  // POST /auth/login
  app.post("/login", async (request, reply) => {
    const body = loginSchema.parse(request.body);

    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user || !user.active) {
      throw new AppError(INVALID_LOGIN, 401);
    }

    const valid = await bcrypt.compare(body.password, user.password);
    if (!valid) {
      throw new AppError(INVALID_LOGIN, 401);
    }

    const token = app.jwt.sign({ sub: user.id, role: user.role });

    return reply.send({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  });

  // NOTA: a antiga rota POST /auth/register foi removida de propósito.
  // Ela deixava qualquer pessoa criar o primeiro ADMIN quando o banco estava vazio.
  // Agora: o primeiro admin nasce pelo seed (ADMIN_EMAIL/ADMIN_PASSWORD) ou por
  // `npm run user:create`, e os demais são criados por um ADMIN em POST /users.

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

  // PUT /auth/password — o próprio usuário troca a senha
  app.put(
    "/password",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const body = changePasswordSchema.parse(request.body);

      const user = await prisma.user.findUnique({ where: { id: request.user.sub } });
      if (!user) throw new AppError("Usuário não encontrado", 404);

      const ok = await bcrypt.compare(body.currentPassword, user.password);
      if (!ok) throw new AppError("Senha atual incorreta", 400);

      const hash = await bcrypt.hash(body.newPassword, env.BCRYPT_SALT_ROUNDS);
      await prisma.user.update({ where: { id: user.id }, data: { password: hash } });

      return reply.status(204).send();
    },
  );
}
