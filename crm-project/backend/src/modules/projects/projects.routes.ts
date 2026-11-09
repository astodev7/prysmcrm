import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../utils/errors.js";

const projectStatusEnum = z.enum([
  "ORCAMENTO",
  "EM_DESENVOLVIMENTO",
  "EM_REVISAO",
  "ENTREGUE",
  "PAUSADO",
  "CANCELADO",
]);

const createProjectSchema = z.object({
  name: z.string().min(1),
  clientId: z.string(),
  status: projectStatusEnum.optional(),
  value: z.number().min(0).optional(),
  progress: z.number().min(0).max(100).optional(),
  deadline: z.string().datetime().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const updateProjectSchema = createProjectSchema.partial().omit({ clientId: true }).extend({
  clientId: z.string().optional(),
});

export async function projectsRoutes(app: FastifyInstance) {
  app.get(
    "/",
    { onRequest: [app.authorize("ADMIN","OPERACIONAL")] },
    async (request) => {
      const query = request.query as { status?: string; clientId?: string; search?: string };

      const where: Record<string, unknown> = request.user.role === "ADMIN" ? {} : { ownerId: request.user.sub };
      if (query.status) where.status = query.status;
      if (query.clientId) where.clientId = query.clientId;
      if (query.search) {
        where.name = { contains: query.search, mode: "insensitive" };
      }

      const projects = await prisma.project.findMany({
        where,
        include: {
          client: { select: { id: true, company: true, contact: true } },
          tasks: { select: { id: true, title: true, status: true, priority: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      return projects.map((p) => ({
        ...p,
        value: Number(p.value),
      }));
    },
  );

  app.get(
    "/:id",
    { onRequest: [app.authorize("ADMIN","OPERACIONAL")] },
    async (request) => {
      const { id } = request.params as { id: string };

      const project = await prisma.project.findUnique({
        where: { id, ...(request.user.role === "ADMIN" ? {} : { ownerId: request.user.sub }) },
        include: {
          client: true,
          tasks: true,
        },
      });

      if (!project) throw new AppError("Projeto não encontrado", 404);

      return { ...project, value: Number(project.value) };
    },
  );

  app.post(
    "/",
    { onRequest: [app.authorize("ADMIN","OPERACIONAL")] },
    async (request, reply) => {
      const body = createProjectSchema.parse(request.body);

      const client = await prisma.client.findFirst({ where: { id: body.clientId, ...(request.user.role === "ADMIN" ? {} : { ownerId: request.user.sub }) } });
      if (!client) throw new AppError("Cliente não encontrado", 404);

      const project = await prisma.project.create({
        data: {
          ...body,
          ownerId: request.user.role === "ADMIN" ? undefined : request.user.sub,
          deadline: body.deadline ? new Date(body.deadline) : null,
        },
        include: {
          client: { select: { id: true, company: true } },
        },
      });

      return reply.status(201).send({ ...project, value: Number(project.value) });
    },
  );

  app.put(
    "/:id",
    { onRequest: [app.authorize("ADMIN","OPERACIONAL")] },
    async (request) => {
      const { id } = request.params as { id: string };
      const body = updateProjectSchema.parse(request.body);
      const existing = await prisma.project.findFirst({ where: { id, ...(request.user.role === "ADMIN" ? {} : { ownerId: request.user.sub }) } });
      if (!existing) throw new AppError("Projeto não encontrado", 404);
      if (body.clientId && request.user.role !== "ADMIN") {
        const client = await prisma.client.findFirst({ where: { id: body.clientId, ownerId: request.user.sub } });
        if (!client) throw new AppError("Cliente não encontrado", 404);
      }

      try {
        const project = await prisma.project.update({
          where: { id },
          data: {
            ...body,
            deadline: body.deadline ? new Date(body.deadline) : undefined,
          },
          include: {
            client: { select: { id: true, company: true } },
          },
        });
        return { ...project, value: Number(project.value) };
      } catch {
        throw new AppError("Projeto não encontrado", 404);
      }
    },
  );

  app.delete(
    "/:id",
    { onRequest: [app.authorize("ADMIN","OPERACIONAL")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        const existing = await prisma.project.findFirst({ where: { id, ...(request.user.role === "ADMIN" ? {} : { ownerId: request.user.sub }) } });
        if (!existing) throw new AppError("Projeto não encontrado", 404);
        await prisma.project.delete({ where: { id } });
        return reply.status(204).send();
      } catch {
        throw new AppError("Projeto não encontrado", 404);
      }
    },
  );
}
