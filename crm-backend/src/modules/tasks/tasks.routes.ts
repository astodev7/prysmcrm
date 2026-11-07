import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../utils/errors.js";

const taskStatusEnum = z.enum(["PENDENTE", "EM_ANDAMENTO", "CONCLUIDA", "CANCELADA"]);
const taskPriorityEnum = z.enum(["BAIXA", "MEDIA", "ALTA", "URGENTE"]);

const createTaskSchema = z.object({
  title: z.string().min(1),
  relation: z.string().optional().nullable(),
  status: taskStatusEnum.optional(),
  priority: taskPriorityEnum.optional(),
  dueDate: z.string().datetime().optional().nullable(),
  notes: z.string().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
});

const updateTaskSchema = createTaskSchema.partial();

export async function tasksRoutes(app: FastifyInstance) {
  app.get(
    "/",
    { onRequest: [app.authenticate] },
    async (request) => {
      const query = request.query as {
        status?: string;
        priority?: string;
        assigneeId?: string;
        projectId?: string;
      };

      const where: Record<string, unknown> = {};
      if (query.status) where.status = query.status;
      if (query.priority) where.priority = query.priority;
      if (query.assigneeId) where.assigneeId = query.assigneeId;
      if (query.projectId) where.projectId = query.projectId;

      return prisma.task.findMany({
        where,
        include: {
          assignee: { select: { id: true, name: true } },
          project: { select: { id: true, name: true } },
        },
        orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
      });
    },
  );

  app.get(
    "/:id",
    { onRequest: [app.authenticate] },
    async (request) => {
      const { id } = request.params as { id: string };

      const task = await prisma.task.findUnique({
        where: { id },
        include: {
          assignee: { select: { id: true, name: true } },
          project: { select: { id: true, name: true } },
        },
      });

      if (!task) throw new AppError("Tarefa não encontrada", 404);
      return task;
    },
  );

  app.post(
    "/",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const body = createTaskSchema.parse(request.body);

      const task = await prisma.task.create({
        data: {
          ...body,
          dueDate: body.dueDate ? new Date(body.dueDate) : null,
          assigneeId: body.assigneeId ?? request.user.sub,
        },
        include: {
          assignee: { select: { id: true, name: true } },
          project: { select: { id: true, name: true } },
        },
      });

      return reply.status(201).send(task);
    },
  );

  app.put(
    "/:id",
    { onRequest: [app.authenticate] },
    async (request) => {
      const { id } = request.params as { id: string };
      const body = updateTaskSchema.parse(request.body);

      try {
        return await prisma.task.update({
          where: { id },
          data: {
            ...body,
            dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
          },
          include: {
            assignee: { select: { id: true, name: true } },
            project: { select: { id: true, name: true } },
          },
        });
      } catch {
        throw new AppError("Tarefa não encontrada", 404);
      }
    },
  );

  app.delete(
    "/:id",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        await prisma.task.delete({ where: { id } });
        return reply.status(204).send();
      } catch {
        throw new AppError("Tarefa não encontrada", 404);
      }
    },
  );
}
