import { FastifyInstance } from "fastify";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { AppError } from "../../utils/errors.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["ADMIN", "COMERCIAL", "FINANCEIRO", "OPERACIONAL"]).optional(),
});

export async function authRoutes(app: FastifyInstance) {
  // POST /auth/login
  app.post("/login", async (request, reply) => {
    const body = loginSchema.parse(request.body);

    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user || !user.active) {
      throw new AppError("E-mail ou senha inválidos", 401);
    }

    const valid = await bcrypt.compare(body.password, user.password);
    if (!valid) {
      throw new AppError("E-mail ou senha inválidos", 401);
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

  // POST /auth/register (somente ADMIN ou primeiro usuário)
  app.post("/register", async (request, reply) => {
    const body = registerSchema.parse(request.body);

    const exists = await prisma.user.findUnique({ where: { email: body.email } });
    if (exists) {
      throw new AppError("E-mail já cadastrado", 409);
    }

    const usersCount = await prisma.user.count();
    const role = usersCount === 0 ? "ADMIN" : body.role ?? "COMERCIAL";

    // Se já existe usuário e não é o primeiro, exige auth de ADMIN
    if (usersCount > 0) {
      try {
        await request.jwtVerify();
        if (request.user.role !== "ADMIN") {
          throw new AppError("Apenas administradores podem criar usuários", 403);
        }
      } catch (err) {
        if (err instanceof AppError) throw err;
        throw new AppError("Não autorizado", 401);
      }
    }

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
