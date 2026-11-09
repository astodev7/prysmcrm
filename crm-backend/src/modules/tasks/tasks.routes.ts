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
    { onRequest: [app.authorize("ADMIN","OPERACIONAL","COMERCIAL")] },
    async (request) => {
      const query = request.query as {
        status?: string;
        priority?: string;
        assigneeId?: string;
        projectId?: string;
      };

      const where: Record<string, unknown> = request.user.role === "ADMIN" ? {} : { assigneeId: request.user.sub };
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
    { onRequest: [app.authorize("ADMIN","OPERACIONAL","COMERCIAL")] },
    async (request) => {
      const { id } = request.params as { id: string };

      const task = await prisma.task.findFirst({
        where: { id, ...(request.user.role === "ADMIN" ? {} : { assigneeId: request.user.sub }) },
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
    { onRequest: [app.authorize("ADMIN","OPERACIONAL","COMERCIAL")] },
    async (request, reply) => {
      const body = createTaskSchema.parse(request.body);

      const task = await prisma.task.create({
        data: {
          ...body,
          ...(request.user.role === "ADMIN" ? {} : { assigneeId: undefined }),
          dueDate: body.dueDate ? new Date(body.dueDate) : null,
          assigneeId: request.user.role === "ADMIN" ? (body.assigneeId ?? request.user.sub) : request.user.sub,
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
    { onRequest: [app.authorize("ADMIN","OPERACIONAL","COMERCIAL")] },
    async (request) => {
      const { id } = request.params as { id: string };
      const body = updateTaskSchema.parse(request.body);

      const existing = await prisma.task.findFirst({ where: { id, ...(request.user.role === "ADMIN" ? {} : { assigneeId: request.user.sub }) } });
      if (!existing) throw new AppError("Tarefa não encontrada", 404);
      try {
        return await prisma.task.update({
          where: { id },
          data: {
            ...body,
            ...(request.user.role === "ADMIN" ? {} : { assigneeId: undefined }),
            dueDate: body.dueDate ? new Date(body.dueDate) : (body.dueDate === null ? null : undefined),
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
    { onRequest: [app.authorize("ADMIN","OPERACIONAL","COMERCIAL")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const existing = await prisma.task.findFirst({ where: { id, ...(request.user.role === "ADMIN" ? {} : { assigneeId: request.user.sub }) } });
      if (!existing) throw new AppError("Tarefa não encontrada", 404);
      try {
        await prisma.task.delete({ where: { id } });
        return reply.status(204).send();
      } catch {
        throw new AppError("Tarefa não encontrada", 404);
      }
    },
  );
}
