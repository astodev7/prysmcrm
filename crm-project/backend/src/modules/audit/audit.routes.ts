import { FastifyInstance } from "fastify";
import { prisma } from "../../config/prisma.js";

export async function auditRoutes(app: FastifyInstance) {
  app.get("/", { onRequest: [app.authorize("ADMIN")] }, async () => {
    return prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
    });
  });
}
