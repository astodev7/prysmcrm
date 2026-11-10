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
  responsibleId: z.string().optional().nullable(),
  idempotencyKey: z.string().uuid(),
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
        include: { responsible: { select: { id: true, name: true } } },
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
      if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime())) || (from && to && from > to)) throw new AppError("Período inválido", 400);
      const duePeriod = from || to ? { dueDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {};
      const salePeriod = { reversedAt: null, ...(from || to ? { soldAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) };
      const [receitas, despesas, aReceberAvulsas, despesasPendentes, vendas] = await Promise.all([
        prisma.finance.aggregate({
          where: { kind: "RECEITA", status: "PAGO", ...(from || to ? { paidAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) },
          _sum: { value: true },
        }),
        prisma.finance.aggregate({
          where: { kind: "DESPESA", status: "PAGO", ...(from || to ? { paidAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) },
          _sum: { value: true },
        }),
        prisma.finance.aggregate({ where: { kind: "RECEITA", status: "PENDENTE", saleId: null, ...duePeriod }, _sum: { value: true } }),
        prisma.finance.aggregate({ where: { kind: "DESPESA", status: { in: ["PENDENTE", "ATRASADO"] }, ...duePeriod }, _sum: { value: true } }),
        prisma.closedSale.aggregate({ where: salePeriod, _sum: { contractAmount: true }, _count: { id: true } }),
      ]);

      const totalReceitas = Number(receitas._sum.value ?? 0);
      const totalDespesas = Number(despesas._sum.value ?? 0);

      const receivablesFromContracts = await prisma.closedSale.findMany({
        where: { reversedAt: null },
        select: { soldAt: true, contractAmount: true, payments: { where: { kind: "RECEITA" }, select: { value: true, status: true, category: true, dueDate: true } } },
      });
      const now = new Date();
      const inRange = (date: Date) => (!from || date >= from) && (!to || date <= to);
      const contractReceivables = receivablesFromContracts.map((sale) => {
        const contractEntry = sale.payments.find((payment) => payment.category === "Contrato");
        const referenceDate = contractEntry?.dueDate ?? sale.soldAt;
        const paid = sale.payments.filter((payment) => payment.status === "PAGO").reduce((sum, payment) => sum + Number(payment.value), 0);
        return { balance: Math.max(0, Number(sale.contractAmount) - paid), overdue: contractEntry?.status === "ATRASADO" || Boolean(contractEntry?.dueDate && contractEntry.dueDate < now), inPeriod: (!from && !to) || inRange(referenceDate) };
      }).filter((sale) => sale.inPeriod && sale.balance > 0);
      const contractBalance = contractReceivables.reduce((sum, sale) => sum + sale.balance, 0);
      const contractOverdue = contractReceivables.filter((sale) => sale.overdue).reduce((sum, sale) => sum + sale.balance, 0);
      const receivablesOverdue = await prisma.finance.aggregate({ where: { kind: "RECEITA", status: "ATRASADO", saleId: null, ...duePeriod }, _sum: { value: true } });
      const contractPending = contractBalance - contractOverdue;
      const standalonePending = Number(aReceberAvulsas._sum.value ?? 0);
      const standaloneOverdue = Number(receivablesOverdue._sum.value ?? 0);
      const valoresAReceber = contractBalance + standalonePending + standaloneOverdue;

      return {
        totalReceitas,
        totalDespesas,
        lucroRealizado: totalReceitas - totalDespesas,
        vendasFechadas: Number(vendas._sum.contractAmount ?? 0),
        quantidadeVendas: vendas._count.id,
        valoresAReceber,
        recebiveisPendentes: contractPending + standalonePending,
        recebiveisAtrasados: contractOverdue + standaloneOverdue,
        despesasPendentes: Number(despesasPendentes._sum.value ?? 0),
        lucroProjetado: totalReceitas + valoresAReceber - totalDespesas - Number(despesasPendentes._sum.value ?? 0),
        pendentes: {
          value: valoresAReceber,
        },
      };
    },
  );

  // Cada recebimento vira um lançamento pago separado; o saldo é calculado sobre
  // o contrato menos os pagamentos, sem reescrever o lançamento original.
  app.post("/sales/:id/payments", { onRequest: [app.authorize("ADMIN", "FINANCEIRO")] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z.object({ amount: z.number().positive().refine((amount) => Math.abs(amount * 100 - Math.round(amount * 100)) < 0.000001, "Use no máximo duas casas decimais"), paidAt: z.string().datetime().optional(), idempotencyKey: z.string().uuid() }).parse(request.body);
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "closed_sales" WHERE "id" = ${id} FOR UPDATE`;
      const prior = await tx.finance.findUnique({ where: { idempotencyKey: body.idempotencyKey } });
      if (prior) {
        const paidAtMismatch = body.paidAt && prior.paidAt?.getTime() !== new Date(body.paidAt).getTime();
        if (prior.saleId !== id || prior.kind !== "RECEITA" || prior.category !== "Parcela recebida" || Number(prior.value) !== body.amount || paidAtMismatch) throw new AppError("Chave de recebimento já utilizada com outros dados", 409);
        return { payment: prior, duplicate: true };
      }
      const sale = await tx.closedSale.findUnique({ where: { id }, include: { payments: { where: { kind: "RECEITA", status: "PAGO" }, select: { value: true } } } });
      if (!sale) throw new AppError("Venda não encontrada", 404);
      if (sale.reversedAt) throw new AppError("Não é possível receber um contrato revertido", 409);
      const received = sale.payments.reduce((sum, item) => sum + Number(item.value), 0);
      const outstanding = Math.max(0, Math.round((Number(sale.contractAmount) - received) * 100) / 100);
      if (body.amount > outstanding) throw new AppError("O pagamento excede o saldo do contrato", 400);
      if (outstanding <= 0) throw new AppError("Este contrato já foi totalmente recebido", 409);
      const payment = await tx.finance.create({ data: { name: `Recebimento — venda ${sale.id}`, value: body.amount, kind: "RECEITA", status: "PAGO", category: "Parcela recebida", paidAt: body.paidAt ? new Date(body.paidAt) : new Date(), saleId: sale.id, idempotencyKey: body.idempotencyKey, responsibleId: request.user.sub } });
      return { payment, duplicate: false };
    });
    return reply.status(result.duplicate ? 200 : 201).send({ ...result.payment, value: Number(result.payment.value) });
  });

  app.get("/sales/open", { onRequest: [app.authorize("ADMIN", "FINANCEIRO")] }, async (request) => {
    const query = request.query as { from?: string; to?: string };
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime())) || (from && to && from > to)) throw new AppError("Período inválido", 400);
    const sales = await prisma.closedSale.findMany({
      where: { reversedAt: null },
      include: { lead: { select: { company: true } }, payments: { where: { kind: "RECEITA" }, select: { value: true, status: true, category: true, dueDate: true } } },
      orderBy: { soldAt: "desc" },
    });
    return sales.map((sale) => {
      const received = sale.payments.filter((payment) => payment.status === "PAGO").reduce((sum, payment) => sum + Number(payment.value), 0);
      const contractEntry = sale.payments.find((payment) => payment.category === "Contrato");
      const dueDate = contractEntry?.dueDate ?? null;
      const outstanding = Math.max(0, Number(sale.contractAmount) - received);
      const referenceDate = dueDate ?? sale.soldAt;
      const inRange = (!from || referenceDate >= from) && (!to || referenceDate <= to);
      return { id: sale.id, company: sale.lead.company, soldAt: sale.soldAt, contractAmount: Number(sale.contractAmount), received, outstanding, dueDate, overdue: outstanding > 0 && (contractEntry?.status === "ATRASADO" || Boolean(dueDate && dueDate < new Date())), inRange };
    }).filter((sale) => sale.outstanding > 0 && sale.inRange).map(({ inRange: _inRange, ...sale }) => sale);
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
      const matchesRequest = (prior: NonNullable<Awaited<ReturnType<typeof prisma.finance.findUnique>>>) =>
        prior.name === body.name && Number(prior.value) === body.value && prior.kind === body.kind && prior.category === (body.category ?? null) && prior.saleId === null && prior.relation === (body.relation ?? null) && prior.notes === (body.notes ?? null) && prior.status === (body.status ?? "PENDENTE") && prior.responsibleId === (body.responsibleId ?? request.user.sub) && prior.dueDate?.getTime() === (body.dueDate ? new Date(body.dueDate).getTime() : undefined) && (body.paidAt ? prior.paidAt?.getTime() === new Date(body.paidAt).getTime() : body.status === "PAGO" ? prior.paidAt !== null : prior.paidAt === null);
      const existing = await prisma.finance.findUnique({ where: { idempotencyKey: body.idempotencyKey } });
      if (existing) {
        if (!matchesRequest(existing)) throw new AppError("Chave de lançamento já utilizada com outros dados", 409);
        return reply.status(200).send({ ...existing, value: Number(existing.value) });
      }
      try {
        const item = await prisma.finance.create({ data: { ...body, responsibleId: body.responsibleId ?? request.user.sub, dueDate: body.dueDate ? new Date(body.dueDate) : null, paidAt: body.paidAt ? new Date(body.paidAt) : body.status === "PAGO" ? new Date() : null } });
        return reply.status(201).send({ ...item, value: Number(item.value) });
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
          const prior = await prisma.finance.findUnique({ where: { idempotencyKey: body.idempotencyKey } });
          if (prior && matchesRequest(prior)) return reply.status(200).send({ ...prior, value: Number(prior.value) });
        }
        throw error;
      }
    },
  );

  app.put(
    "/:id",
    { onRequest: [app.authorize("ADMIN","FINANCEIRO")] },
    async (request) => {
      const { id } = request.params as { id: string };
      const body = updateFinanceSchema.parse(request.body);

      const current = await prisma.finance.findUnique({ where: { id }, select: { saleId: true, category: true } });
      if (!current) throw new AppError("Lançamento não encontrado", 404);
      if (current.saleId && current.category === "Parcela recebida") throw new AppError("Recebimentos confirmados são imutáveis para preservar o histórico do contrato.", 409);
      if (current.saleId && (body.value !== undefined || body.kind !== undefined || body.category !== undefined || body.status === "CANCELADO")) throw new AppError("Este lançamento pertence a um contrato e não pode ser alterado dessa forma.", 409);

      if (body.status === "PAGO") {
        if (current.saleId && current.category === "Contrato") throw new AppError("Registre o recebimento pelo contrato para manter o saldo e o histórico corretos.", 409);
      }

      try {
        const item = await prisma.finance.update({
          where: { id },
          data: {
            ...body,
            dueDate: body.dueDate === null ? null : body.dueDate ? new Date(body.dueDate) : undefined,
            paidAt: body.paidAt ? new Date(body.paidAt) : body.status === "PAGO" ? new Date() : body.status ? null : undefined,
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

      const item = await prisma.finance.findUnique({ where: { id }, select: { saleId: true } });
      if (!item) throw new AppError("Lançamento não encontrado", 404);
      if (item.saleId) throw new AppError("Lançamentos vinculados a vendas não podem ser apagados; o histórico do contrato deve ser preservado.", 409);
      try {
        await prisma.finance.delete({ where: { id } });
        return reply.status(204).send();
      } catch {
        throw new AppError("Lançamento não encontrado", 404);
      }
    },
  );
}
