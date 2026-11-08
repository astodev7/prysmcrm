import { FastifyInstance } from "fastify";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { AppError } from "../../utils/errors.js";

const roleEnum = z.enum(["ADMIN", "COMERCIAL", "FINANCEIRO", "OPERACIONAL"]);
const email = z.string().trim().toLowerCase().email();
const password = z.string().min(8, "A senha precisa ter pelo menos 8 caracteres");

const createUserSchema = z.object({
  name: z.string().trim().min(2),
  email,
  password,
  role: roleEnum.default("COMERCIAL"),
});

const updateUserSchema = z.object({
  name: z.string().trim().min(2).optional(),
  email: email.optional(),
  password: password.optional(),
  role: roleEnum.optional(),
  active: z.boolean().optional(),
});

const publicUser = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  createdAt: true,
} as const;

function prismaCode(err: unknown): string | undefined {
  return typeof err === "object" && err !== null && "code" in err
    ? String((err as { code: unknown }).code)
    : undefined;
}

/** Garante que sempre sobre ao menos 1 ADMIN ativo no sistema. */
async function assertAnotherActiveAdmin(excludingUserId: string) {
  const others = await prisma.user.count({
    where: { role: "ADMIN", active: true, id: { not: excludingUserId } },
  });
  if (others === 0) {
    throw new AppError("O sistema precisa ter pelo menos um administrador ativo", 400);
  }
}

export async function usersRoutes(app: FastifyInstance) {
  // Listar usuários (ADMIN)
  app.get(
    "/",
    { onRequest: [app.authorize("ADMIN")] },
    async () => {
      return prisma.user.findMany({
        select: publicUser,
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
        select: publicUser,
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

      const target = await prisma.user.findUnique({ where: { id } });
      if (!target) throw new AppError("Usuário não encontrado", 404);

      const isSelf = id === request.user.sub;
      const losesAdmin =
        (body.role !== undefined && body.role !== "ADMIN" && target.role === "ADMIN") ||
        (body.active === false && target.role === "ADMIN");

      if (isSelf && losesAdmin) {
        throw new AppError("Você não pode remover seu próprio acesso de administrador", 400);
      }
      if (isSelf && body.active === false) {
        throw new AppError("Você não pode desativar a si mesmo", 400);
      }
      if (losesAdmin && target.active) {
        await assertAnotherActiveAdmin(id);
      }

      const { password: newPassword, ...rest } = body;
      const data: Record<string, unknown> = { ...rest };
      if (newPassword) {
        data.password = await bcrypt.hash(newPassword, env.BCRYPT_SALT_ROUNDS);
      }

      try {
        return await prisma.user.update({
          where: { id },
          data,
          select: publicUser,
        });
      } catch (err) {
        if (prismaCode(err) === "P2002") throw new AppError("E-mail já cadastrado", 409);
        throw new AppError("Usuário não encontrado", 404);
      }
    },
  );

  // Desativar usuário (ADMIN) — não apaga, só impede o login
  app.delete(
    "/:id",
    { onRequest: [app.authorize("ADMIN")] },
    async (request) => {
      const { id } = request.params as { id: string };

      if (id === request.user.sub) {
        throw new AppError("Você não pode desativar a si mesmo", 400);
      }

      const target = await prisma.user.findUnique({ where: { id } });
      if (!target) throw new AppError("Usuário não encontrado", 404);

      if (target.role === "ADMIN" && target.active) {
        await assertAnotherActiveAdmin(id);
      }

      return prisma.user.update({
        where: { id },
        data: { active: false },
        select: { id: true, name: true, active: true },
      });
    },
  );
}
