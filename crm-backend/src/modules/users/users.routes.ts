import { FastifyInstance } from "fastify";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { AppError } from "../../utils/errors.js";

const strongPassword = z.string().min(12).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/).regex(/[^A-Za-z0-9]/);

const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: strongPassword,
  role: z.enum(["ADMIN", "COMERCIAL", "FINANCEIRO", "OPERACIONAL"]).default("COMERCIAL"),
});

const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  password: strongPassword.optional(),
  role: z.enum(["ADMIN", "COMERCIAL", "FINANCEIRO", "OPERACIONAL"]).optional(),
  active: z.boolean().optional(),
});

export async function usersRoutes(app: FastifyInstance) {
  // Listar usuários (ADMIN)
  app.get(
    "/",
    { onRequest: [app.authorize("ADMIN")] },
    async () => {
      return prisma.user.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          active: true,
          createdAt: true,
        },
        orderBy: { name: "asc" },
      });
    },
  );

  // Criar usuário (ADMIN)
  app.post(
    "/",
    { onRequest: [app.authorize("ADMIN")] },
    async (request, reply) => {
      const body = createUserSchema.parse(request.body);

      const exists = await prisma.user.findUnique({ where: { email: body.email } });
      if (exists) throw new AppError("E-mail já cadastrado", 409);

      const hash = await bcrypt.hash(body.password, env.BCRYPT_SALT_ROUNDS);

      const user = await prisma.user.create({
        data: {
          name: body.name,
          email: body.email,
          password: hash,
          role: body.role,
        },
        select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
      });

      return reply.status(201).send(user);
    },
  );

  // Atualizar usuário (ADMIN)
  app.put(
    "/:id",
    { onRequest: [app.authorize("ADMIN")] },
    async (request) => {
      const { id } = request.params as { id: string };
      const body = updateUserSchema.parse(request.body);

      const data: Record<string, unknown> = { ...body };
      if (body.password) {
        data.password = await bcrypt.hash(body.password, env.BCRYPT_SALT_ROUNDS);
      }

      try {
        return await prisma.user.update({
          where: { id },
          data,
          select: { id: true, name: true, email: true, role: true, active: true, updatedAt: true },
        });
      } catch {
        throw new AppError("Usuário não encontrado", 404);
      }
    },
  );

  // Desativar usuário (ADMIN)
  app.delete(
    "/:id",
    { onRequest: [app.authorize("ADMIN")] },
    async (request) => {
      const { id } = request.params as { id: string };

      if (id === request.user.sub) {
        throw new AppError("Você não pode desativar a si mesmo", 400);
      }

      try {
        return await prisma.user.update({
          where: { id },
          data: { active: false },
          select: { id: true, name: true, active: true },
        });
      } catch {
        throw new AppError("Usuário não encontrado", 404);
      }
    },
  );
}
