import fp from "fastify-plugin";
import fjwt from "@fastify/jwt";
import { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config/env.js";
import { prisma } from "../config/prisma.js";
import { Role } from "@prisma/client";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; role: Role };
    user: { sub: string; role: Role };
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authorize: (...roles: Role[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

/**
 * Valida o token E confere no banco se o usuário continua ativo.
 * Assim, desativar um usuário (ou trocar o perfil dele) vale na hora,
 * sem esperar o token expirar. O perfil considerado é sempre o do banco.
 */
async function verifyActiveUser(request: FastifyRequest) {
  await request.jwtVerify();

  const dbUser = await prisma.user.findUnique({
    where: { id: request.user.sub },
    select: { id: true, role: true, active: true },
  });

  if (!dbUser || !dbUser.active) {
    throw new Error("Usuário inativo ou removido");
  }

  request.user = { sub: dbUser.id, role: dbUser.role };
}

export default fp(async (app) => {
  await app.register(fjwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_EXPIRES_IN },
  });

  app.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await verifyActiveUser(request);
    } catch {
      return reply.status(401).send({ message: "Não autorizado" });
    }
  });

  app.decorate("authorize", (...roles: Role[]) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await verifyActiveUser(request);
      } catch {
        return reply.status(401).send({ message: "Não autorizado" });
      }
      if (roles.length && !roles.includes(request.user.role)) {
        return reply.status(403).send({ message: "Acesso negado" });
      }
    };
  });
});
