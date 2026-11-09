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
    { onRequest: [app.authorize("ADMIN","FINANCEIRO")] },
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
    { onRequest: [app.authorize("ADMIN","FINANCEIRO")] },
    async (request) => {
      const query = request.query as { from?: string; to?: string };
      const from = query.from ? new Date(query.from) : undefined;
      const to = query.to ? new Date(query.to) : undefined;
      const [receitas, despesas, aReceber, despesasPendentes, vendas] = await Promise.all([
        prisma.finance.aggregate({
          where: { kind: "RECEITA", status: "PAGO", ...(from || to ? { paidAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) },
          _sum: { value: true },
        }),
        prisma.finance.aggregate({
          where: { kind: "DESPESA", status: "PAGO", ...(from || to ? { paidAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) },
          _sum: { value: true },
        }),
        prisma.finance.aggregate({ where: { kind: "RECEITA", status: { in: ["PENDENTE", "ATRASADO"] } }, _sum: { value: true } }),
        prisma.finance.aggregate({ where: { kind: "DESPESA", status: { in: ["PENDENTE", "ATRASADO"] } }, _sum: { value: true } }),
        prisma.closedSale.aggregate({ where: { ...(from || to ? { soldAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) }, _sum: { contractAmount: true }, _count: { id: true } }),
      ]);

      const totalReceitas = Number(receitas._sum.value ?? 0);
      const totalDespesas = Number(despesas._sum.value ?? 0);

      return {
        totalReceitas,
        totalDespesas,
        lucroRealizado: totalReceitas - totalDespesas,
        vendasFechadas: Number(vendas._sum.contractAmount ?? 0),
        quantidadeVendas: vendas._count.id,
        valoresAReceber: Number(aReceber._sum.value ?? 0),
        despesasPendentes: Number(despesasPendentes._sum.value ?? 0),
        lucroProjetado: totalReceitas + Number(aReceber._sum.value ?? 0) - totalDespesas - Number(despesasPendentes._sum.value ?? 0),
        pendentes: {
          value: Number(aReceber._sum.value ?? 0),
        },
      };
    },
  );

  // Cada recebimento é um lançamento pago separado; o saldo em aberto é reduzido
  // dentro da mesma transação, mantendo o contrato original no histórico da venda.
  app.post("/sales/:id/payments", { onRequest: [app.authorize("ADMIN", "FINANCEIRO")] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z.object({ amount: z.number().positive(), paidAt: z.string().datetime().optional() }).parse(request.body);
    const result = await prisma.$transaction(async (tx) => {
      const sale = await tx.closedSale.findUnique({ where: { id }, include: { payments: { where: { category: "Contrato", status: { in: ["PENDENTE", "ATRASADO"] } } } } });
      if (!sale) throw new AppError("Venda não encontrada", 404);
      const outstanding = sale.payments.reduce((sum, item) => sum + Number(item.value), 0);
      if (body.amount > outstanding) throw new AppError("O pagamento excede o saldo do contrato", 400);
      const pending = sale.payments[0];
      if (!pending) throw new AppError("Este contrato não possui saldo pendente", 409);
      const remainder = Math.round((outstanding - body.amount) * 100) / 100;
      if (remainder === 0) await tx.finance.update({ where: { id: pending.id }, data: { status: "CANCELADO" } });
      else await tx.finance.update({ where: { id: pending.id }, data: { value: remainder } });
      const payment = await tx.finance.create({ data: { name: `Recebimento — ${pending.name}`, value: body.amount, kind: "RECEITA", status: "PAGO", relation: pending.relation, category: "Parcela recebida", paidAt: body.paidAt ? new Date(body.paidAt) : new Date(), saleId: sale.id } });
      return payment;
    });
    return reply.status(201).send({ ...result, value: Number(result.value) });
  });

  app.get(
    "/:id",
    { onRequest: [app.authorize("ADMIN","FINANCEIRO")] },
    async (request) => {
      const { id } = request.params as { id: string };

      const item = await prisma.finance.findUnique({ where: { id } });
      if (!item) throw new AppError("Lançamento não encontrado", 404);

      return { ...item, value: Number(item.value) };
    },
  );

  app.post(
    "/",
    { onRequest: [app.authorize("ADMIN","FINANCEIRO")] },
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
    { onRequest: [app.authorize("ADMIN","FINANCEIRO")] },
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
    { onRequest: [app.authorize("ADMIN","FINANCEIRO")] },
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
