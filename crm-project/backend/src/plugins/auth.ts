import fp from "fastify-plugin";
import fjwt from "@fastify/jwt";
import { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config/env.js";
import { Role } from "@prisma/client";
import { prisma } from "../config/prisma.js";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; role: Role; ver: number };
    user: { sub: string; role: Role; ver: number };
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
      const cookie = request.headers.cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith("crm_session="));
      const cookieToken = cookie ? decodeURIComponent(cookie.slice("crm_session=".length)) : undefined;
      if (cookieToken) request.headers.authorization = `Bearer ${cookieToken}`;
      await request.jwtVerify();
      const user = await prisma.user.findUnique({ where: { id: request.user.sub }, select: { active: true, role: true, authVersion: true } });
      if (!user?.active || user.authVersion !== request.user.ver) throw new Error("Session expired");
      request.user.role = user.role;
    } catch {
      return reply.status(401).send({ message: "Não autorizado" });
    }
  });

  app.decorate("authorize", (...roles: Role[]) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await app.authenticate(request, reply);
        if (reply.sent) return;
        if (roles.length && !roles.includes(request.user.role)) {
          return reply.status(403).send({ message: "Acesso negado" });
        }
      } catch {
        return reply.status(401).send({ message: "Não autorizado" });
      }
    };
  });
});
