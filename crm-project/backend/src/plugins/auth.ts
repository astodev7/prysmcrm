import fp from "fastify-plugin";
import fjwt from "@fastify/jwt";
import { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config/env.js";
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

export default fp(async (app) => {
  await app.register(fjwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_EXPIRES_IN },
  });

  app.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ message: "Não autorizado" });
    }
  });

  app.decorate("authorize", (...roles: Role[]) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify();
        if (roles.length && !roles.includes(request.user.role)) {
          return reply.status(403).send({ message: "Acesso negado" });
        }
      } catch {
        return reply.status(401).send({ message: "Não autorizado" });
      }
    };
  });
});
