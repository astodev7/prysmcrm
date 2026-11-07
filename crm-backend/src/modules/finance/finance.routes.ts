import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../utils/errors.js";

const moneyKindEnum = z.enum(["RECEITA", "DESPESA"]);
const moneyStatusEnum = z.enum(["PENDENTE", "PAGO", "ATRASADO", "CANCELADO"]);

const createFinanceSchema = z.object({
  name: z.string().min(1),
  value: z.number().positive(),
  kind: moneyKindEnum,
  status: moneyStatusEnum.optional(),
  relation: z.string().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  paidAt: z.string().datetime().optional().nullable(),
  category: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const updateFinanceSchema = createFinanceSchema.partial();

export async function financeRoutes(app: FastifyInstance) {
  // Listar lançamentos
  app.get(
    "/",
    { onRequest: [app.authenticate] },
    async (request) => {
      const query = request.query as {
        kind?: string;
        status?: string;
        category?: string;
      };

      const where: Record<string, unknown> = {};
      if (query.kind) where.kind = query.kind;
      if (query.status) where.status = query.status;
      if (query.category) where.category = query.category;

      const items = await prisma.finance.findMany({
        where,
        orderBy: { createdAt: "desc" },
      });

      return items.map((i) => ({ ...i, value: Number(i.value) }));
    },
  );

  // Resumo financeiro (dashboard)
  app.get(
    "/summary",
    { onRequest: [app.authenticate] },
    async () => {
      const [receitas, despesas] = await Promise.all([
        prisma.finance.aggregate({
          where: { kind: "RECEITA", status: { not: "CANCELADO" } },
          _sum: { value: true },
        }),
        prisma.finance.aggregate({
          where: { kind: "DESPESA", status: { not: "CANCELADO" } },
          _sum: { value: true },
        }),
      ]);

      const totalReceitas = Number(receitas._sum.value ?? 0);
      const totalDespesas = Number(despesas._sum.value ?? 0);

      const pendentes = await prisma.finance.aggregate({
        where: { status: "PENDENTE" },
        _sum: { value: true },
        _count: { id: true },
      });

      return {
        totalReceitas,
        totalDespesas,
        saldo: totalReceitas - totalDespesas,
        pendentes: {
          count: pendentes._count.id,
          value: Number(pendentes._sum.value ?? 0),
        },
      };
    },
  );

  app.get(
    "/:id",
    { onRequest: [app.authenticate] },
    async (request) => {
      const { id } = request.params as { id: string };

      const item = await prisma.finance.findUnique({ where: { id } });
      if (!item) throw new AppError("Lançamento não encontrado", 404);

      return { ...item, value: Number(item.value) };
    },
  );

  app.post(
    "/",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const body = createFinanceSchema.parse(request.body);

      const item = await prisma.finance.create({
        data: {
          ...body,
          dueDate: body.dueDate ? new Date(body.dueDate) : null,
          paidAt: body.paidAt ? new Date(body.paidAt) : null,
        },
      });

      return reply.status(201).send({ ...item, value: Number(item.value) });
    },
  );

  app.put(
    "/:id",
    { onRequest: [app.authenticate] },
    async (request) => {
      const { id } = request.params as { id: string };
      const body = updateFinanceSchema.parse(request.body);

      try {
        const item = await prisma.finance.update({
          where: { id },
          data: {
            ...body,
            dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
            paidAt: body.paidAt ? new Date(body.paidAt) : undefined,
          },
        });
        return { ...item, value: Number(item.value) };
      } catch {
        throw new AppError("Lançamento não encontrado", 404);
      }
    },
  );

  app.delete(
    "/:id",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        await prisma.finance.delete({ where: { id } });
        return reply.status(204).send();
      } catch {
        throw new AppError("Lançamento não encontrado", 404);
      }
    },
  );
}
