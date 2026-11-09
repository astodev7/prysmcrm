import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../utils/errors.js";

const createClientSchema = z.object({
  company: z.string().min(1),
  contact: z.string().min(1),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  value: z.number().min(0).optional(),
  notes: z.string().optional().nullable(),
  leadId: z.string().optional().nullable(),
});

const updateClientSchema = createClientSchema.partial();

export async function clientsRoutes(app: FastifyInstance) {
  app.get(
    "/",
    { onRequest: [app.authorize("ADMIN","COMERCIAL","OPERACIONAL")] },
    async (request) => {
      const query = request.query as { search?: string };

      const where: Record<string, unknown> = request.user.role === "ADMIN" ? {} : { ownerId: request.user.sub };
      if (query.search) {
        where.OR = [
          { company: { contains: query.search, mode: "insensitive" } },
          { contact: { contains: query.search, mode: "insensitive" } },
        ];
      }

      const clients = await prisma.client.findMany({
        where,
        include: {
          lead: { select: { id: true, status: true } },
          projects: { select: { id: true, name: true, status: true, value: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      return clients.map((c) => ({
        ...c,
        value: Number(c.value),
        projects: c.projects.map((p) => ({ ...p, value: Number(p.value) })),
      }));
    },
  );

  app.get(
    "/:id",
    { onRequest: [app.authorize("ADMIN","COMERCIAL","OPERACIONAL")] },
    async (request) => {
      const { id } = request.params as { id: string };

      const client = await prisma.client.findUnique({
        where: { id, ...(request.user.role === "ADMIN" ? {} : { ownerId: request.user.sub }) },
        include: {
          lead: true,
          projects: true,
        },
      });

      if (!client) throw new AppError("Cliente não encontrado", 404);

      return {
        ...client,
        value: Number(client.value),
        projects: client.projects.map((p) => ({ ...p, value: Number(p.value) })),
      };
    },
  );

  app.post(
    "/",
    { onRequest: [app.authorize("ADMIN","COMERCIAL","OPERACIONAL")] },
    async (request, reply) => {
      const body = createClientSchema.parse(request.body);
      if (request.user.role !== "ADMIN" && body.leadId) {
        const lead = await prisma.lead.findFirst({ where: { id: body.leadId, ownerId: request.user.sub } });
        if (!lead) throw new AppError("Lead não encontrado", 404);
      }

      const client = await prisma.client.create({
        data: { ...body, ownerId: request.user.role === "ADMIN" ? undefined : request.user.sub },
      });

      return reply.status(201).send({ ...client, value: Number(client.value) });
    },
  );

  app.put(
    "/:id",
    { onRequest: [app.authorize("ADMIN","COMERCIAL","OPERACIONAL")] },
    async (request) => {
      const { id } = request.params as { id: string };
      const body = updateClientSchema.parse(request.body);
      const existing = await prisma.client.findFirst({ where: { id, ...(request.user.role === "ADMIN" ? {} : { ownerId: request.user.sub }) } });
      if (!existing) throw new AppError("Cliente não encontrado", 404);
      if (request.user.role !== "ADMIN" && body.leadId) {
        const lead = await prisma.lead.findFirst({ where: { id: body.leadId, ownerId: request.user.sub } });
        if (!lead) throw new AppError("Lead não encontrado", 404);
      }

      try {
        const client = await prisma.client.update({
          where: { id },
          data: body,
        });
        return { ...client, value: Number(client.value) };
      } catch {
        throw new AppError("Cliente não encontrado", 404);
      }
    },
  );

  app.delete(
    "/:id",
    { onRequest: [app.authorize("ADMIN","COMERCIAL","OPERACIONAL")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        const existing = await prisma.client.findFirst({ where: { id, ...(request.user.role === "ADMIN" ? {} : { ownerId: request.user.sub }) } });
        if (!existing) throw new AppError("Cliente não encontrado", 404);
        await prisma.client.delete({ where: { id } });
        return reply.status(204).send();
      } catch {
        throw new AppError("Cliente não encontrado", 404);
      }
    },
  );
}
