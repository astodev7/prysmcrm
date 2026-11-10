import { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../utils/errors.js";

const leadStatusEnum = z.enum([
  "NOVO",
  "PRIMEIRO_CONTATO",
  "EM_CONVERSA",
  "INTERESSADO",
  "PROPOSTA_ENVIADA",
  "EM_NEGOCIACAO",
  "GANHO",
  "PERDIDO",
]);

const createLeadSchema = z.object({
  company: z.string().min(1),
  contact: z.string().min(1),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  segment: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
  status: leadStatusEnum.optional(),
  value: z.number().min(0).optional(),
  probability: z.number().min(0).max(100).optional(),
  nextAction: z.string().optional().nullable(),
  nextContact: z.string().datetime().optional().nullable(),
  notes: z.string().optional().nullable(),
  ownerId: z.string().optional().nullable(),
});

const updateLeadSchema = createLeadSchema.partial();

async function findOrCreateClient(tx: Prisma.TransactionClient, lead: { company: string; contact: string; email: string | null; phone: string | null; value: Prisma.Decimal }, leadId: string) {
  const identityKeys = [
    ...(lead.email ? [`client:email:${lead.email.trim().toLowerCase()}`] : []),
    ...(lead.phone ? [`client:phone:${lead.phone.replace(/\D/g, "")}`] : []),
  ];
  if (identityKeys.length === 0) identityKeys.push(`client:company:${lead.company.trim().toLowerCase()}`);
  for (const key of identityKeys.sort()) await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;

  const matches = [
    ...(lead.email ? [{ email: { equals: lead.email.trim(), mode: "insensitive" as const } }] : []),
    ...(lead.phone ? [{ phone: lead.phone }] : []),
    ...(identityKeys[0]?.startsWith("client:company:") ? [{ company: { equals: lead.company.trim(), mode: "insensitive" as const } }] : []),
  ];
  const existing = await tx.client.findFirst({ where: { OR: matches }, orderBy: { createdAt: "asc" } });
  if (existing) return existing;
  return tx.client.create({ data: { company: lead.company, contact: lead.contact, email: lead.email, phone: lead.phone, value: lead.value, leadId } });
}

export async function leadsRoutes(app: FastifyInstance) {
  // Listar leads (com filtros)
  app.get(
    "/",
    { onRequest: [app.authorize("ADMIN","COMERCIAL")] },
    async (request) => {
      const query = request.query as {
        status?: string;
        search?: string;
        ownerId?: string;
      };

      const where: Record<string, unknown> = request.user.role === "ADMIN" ? {} : { ownerId: request.user.sub };

      if (query.status) where.status = query.status;
      if (query.ownerId) where.ownerId = query.ownerId;
      if (query.search) {
        where.OR = [
          { company: { contains: query.search, mode: "insensitive" } },
          { contact: { contains: query.search, mode: "insensitive" } },
          { email: { contains: query.search, mode: "insensitive" } },
        ];
      }

      const leads = await prisma.lead.findMany({
        where,
        include: {
          owner: { select: { id: true, name: true } },
          client: { select: { id: true } },
          sale: { select: { id: true, soldAt: true, contractAmount: true, reversedAt: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      return leads.map((l) => ({
        ...l,
        value: Number(l.value),
      }));
    },
  );

  // Pipeline summary (contagem por status) — precisa vir ANTES de /:id
  app.get(
    "/pipeline/summary",
    { onRequest: [app.authorize("ADMIN","COMERCIAL")] },
    async (request) => {
      const groups = await prisma.lead.groupBy({
        where: { status: { notIn: ["GANHO", "PERDIDO"] }, ...(request.user.role === "ADMIN" ? {} : { ownerId: request.user.sub }) },
        by: ["status"],
        _count: { id: true },
        _sum: { value: true },
      });

      return groups.map((g) => ({
        status: g.status,
        count: g._count.id,
        totalValue: Number(g._sum.value ?? 0),
      }));
    },
  );

  // Buscar lead por ID
  app.get(
    "/:id",
    { onRequest: [app.authorize("ADMIN","COMERCIAL")] },
    async (request) => {
      const { id } = request.params as { id: string };

      const lead = await prisma.lead.findFirst({
        where: { id, ...(request.user.role === "ADMIN" ? {} : { ownerId: request.user.sub }) },
        include: {
          owner: { select: { id: true, name: true } },
          client: true,
        },
      });

      if (!lead) throw new AppError("Lead não encontrado", 404);

      return { ...lead, value: Number(lead.value) };
    },
  );

  // Criar lead
  app.post(
    "/",
    { onRequest: [app.authorize("ADMIN","COMERCIAL")] },
    async (request, reply) => {
      const body = createLeadSchema.parse(request.body);

      const lead = await prisma.$transaction(async (tx) => {
        const created = await tx.lead.create({
          data: {
            ...body,
            nextContact: body.nextContact ? new Date(body.nextContact) : null,
            creatorId: request.user.sub,
            ownerId: body.ownerId ?? request.user.sub,
          },
          include: { owner: { select: { id: true, name: true } } },
        });
        await tx.leadActivity.create({ data: { leadId: created.id, actorId: request.user.sub, type: "LEAD_CRIADO", content: "Lead criado" } });
        if (created.status === "GANHO") {
          const client = await findOrCreateClient(tx, created, created.id);
          const sale = await tx.closedSale.create({ data: { leadId: created.id, clientId: client.id, contractAmount: created.value, previousStatus: "NOVO" } });
          if (Number(created.value) > 0) await tx.finance.create({ data: { name: `Contrato — ${created.company}`, value: created.value, kind: "RECEITA", status: "PENDENTE", relation: client.company, category: "Contrato", saleId: sale.id, responsibleId: request.user.sub } });
          await tx.leadActivity.create({ data: { leadId: created.id, actorId: request.user.sub, type: "STATUS_ALTERADO", content: "Lead criado como venda ganha" } });
        }
        return created;
      });

      return reply.status(201).send({ ...lead, value: Number(lead.value) });
    },
  );

  // Atualizar lead
  app.put(
    "/:id",
    { onRequest: [app.authorize("ADMIN","COMERCIAL")] },
    async (request) => {
      const { id } = request.params as { id: string };
      const body = updateLeadSchema.parse(request.body);

      let paidContractAmount = 0;
      const lead = await prisma.$transaction(async (tx) => {
        // Serialize updates to one opportunity so two concurrent GANHO requests
        // cannot create duplicate clients, sales, or contract entries.
        await tx.$queryRaw`SELECT "id" FROM "leads" WHERE "id" = ${id} FOR UPDATE`;
        const current = await tx.lead.findFirst({ where: { id, ...(request.user.role === "ADMIN" ? {} : { ownerId: request.user.sub }) }, include: { sale: { select: { id: true, contractAmount: true, previousStatus: true, reversedAt: true } } } });
        if (!current) throw new AppError("Lead não encontrado", 404);
        if (current.sale?.reversedAt && body.status === "GANHO") throw new AppError("Esta venda foi revertida. Crie uma nova oportunidade para registrar uma nova negociação.", 409);
        if (current.sale?.reversedAt && body.value !== undefined && Number(body.value) !== Number(current.value)) throw new AppError("O valor de uma venda revertida é histórico e não pode ser alterado.", 409);
        if (current.sale && !current.sale.reversedAt && body.status && body.status !== "GANHO") throw new AppError("Use a ação controlada de reversão para reabrir uma venda ganha.", 409);
        if (current.sale && body.value !== undefined) {
          await tx.$queryRaw`SELECT "id" FROM "closed_sales" WHERE "id" = ${current.sale.id} FOR UPDATE`;
          const paid = await tx.finance.aggregate({ where: { saleId: current.sale.id, kind: "RECEITA", status: "PAGO" }, _sum: { value: true } });
          paidContractAmount = Number(paid._sum.value ?? 0);
          if (Number(body.value) < paidContractAmount) throw new AppError("O contrato não pode ficar abaixo dos pagamentos já recebidos. Registre os ajustes financeiros primeiro.", 409);
        }
        const updatedLead = await tx.lead.update({
          where: { id },
          data: {
            ...body,
            nextContact: body.nextContact ? new Date(body.nextContact) : undefined,
          },
          include: {
            owner: { select: { id: true, name: true } },
          },
        });
        if (body.status && body.status !== current.status) await tx.leadActivity.create({ data: { leadId: id, actorId: request.user.sub, type: "STATUS_ALTERADO", content: `Status alterado de ${current.status} para ${body.status}` } });
        if (body.ownerId && body.ownerId !== current.ownerId) await tx.leadActivity.create({ data: { leadId: id, actorId: request.user.sub, type: "RESPONSAVEL_ALTERADO", content: "Responsável do lead alterado" } });
        if (current.sale) {
          await tx.client.updateMany({ where: { leadId: id }, data: { company: updatedLead.company, contact: updatedLead.contact, email: updatedLead.email, phone: updatedLead.phone, ...(body.value !== undefined ? { value: updatedLead.value } : {}) } });
          if (body.value !== undefined) {
            await tx.closedSale.update({ where: { id: current.sale.id }, data: { contractAmount: updatedLead.value } });
            const outstanding = Math.max(0, Math.round((Number(updatedLead.value) - paidContractAmount) * 100) / 100);
            const contractEntry = await tx.finance.findFirst({ where: { saleId: current.sale.id, category: "Contrato" } });
            if (contractEntry && ["PENDENTE", "ATRASADO"].includes(contractEntry.status)) {
              await tx.finance.update({ where: { id: contractEntry.id }, data: { value: outstanding, responsibleId: request.user.sub } });
            } else if (!contractEntry && outstanding > 0) {
              await tx.finance.create({ data: { name: `Contrato — ${updatedLead.company}`, value: outstanding, kind: "RECEITA", status: "PENDENTE", relation: updatedLead.company, category: "Contrato", saleId: current.sale.id, responsibleId: request.user.sub } });
            }
            await tx.leadActivity.create({ data: { leadId: id, actorId: request.user.sub, type: "VALOR_CONTRATO_ALTERADO", content: `Valor contratado ajustado para R$ ${Number(updatedLead.value).toFixed(2)}` } });
          }
        }

        // Closing a lead is atomic: preserve one client, one sale, and one
        // initial receivable even if the status update is retried.
        if (body.status === "GANHO") {
          const client = await findOrCreateClient(tx, updatedLead, updatedLead.id);
          let sale = await tx.closedSale.findUnique({ where: { leadId: id } });
          if (!sale) {
            sale = await tx.closedSale.create({ data: { leadId: id, clientId: client.id, contractAmount: updatedLead.value, previousStatus: current.status } });
            if (Number(updatedLead.value) > 0) {
              await tx.finance.create({
                data: {
                  name: `Contrato — ${updatedLead.company}`,
                  value: updatedLead.value,
                  kind: "RECEITA",
                  status: "PENDENTE",
                  relation: client.company,
                  category: "Contrato",
                  saleId: sale.id,
                  responsibleId: request.user.sub,
                },
              });
            }
          }
        }
        return updatedLead;
      });
      return { ...lead, value: Number(lead.value) };
    },
  );

  app.post("/:id/reverse-sale", { onRequest: [app.authorize("ADMIN")] }, async (request) => {
    const { id } = request.params as { id: string };
    const body = z.object({ reason: z.string().trim().min(5).max(1000), refundConfirmed: z.boolean(), idempotencyKey: z.string().uuid() }).parse(request.body);
    const existing = await prisma.lead.findUnique({ where: { id }, include: { sale: true } });
    if (!existing?.sale) throw new AppError("Venda fechada não encontrada", 404);
    if (existing.sale.reversedAt) throw new AppError("Esta venda já foi revertida", 409);

    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "closed_sales" WHERE "id" = ${existing.sale!.id} FOR UPDATE`;
      const sale = await tx.closedSale.findUnique({ where: { id: existing.sale!.id }, include: { payments: { where: { status: "PAGO" }, select: { kind: true, value: true, category: true } } } });
      if (!sale) throw new AppError("Venda fechada não encontrada", 404);
      if (sale.reversedAt) throw new AppError("Esta venda já foi revertida", 409);
      const received = sale.payments.filter((item) => item.kind === "RECEITA").reduce((sum, item) => sum + Number(item.value), 0);
      const refunded = sale.payments.filter((item) => item.kind === "DESPESA" && item.category === "Estorno de venda").reduce((sum, item) => sum + Number(item.value), 0);
      const refundDue = Math.max(0, Math.round((received - refunded) * 100) / 100);
      if (refundDue > 0 && !body.refundConfirmed) throw new AppError(`Há R$ ${refundDue.toFixed(2)} recebidos. Confirme o reembolso efetivamente pago antes de reverter a venda.`, 409);

      if (refundDue > 0) {
        const priorRefund = await tx.finance.findUnique({ where: { idempotencyKey: body.idempotencyKey } });
        if (priorRefund) throw new AppError("Chave de reembolso já utilizada", 409);
        await tx.finance.create({ data: { name: `Reembolso — venda ${sale.id}`, value: refundDue, kind: "DESPESA", status: "PAGO", category: "Estorno de venda", relation: existing.company, paidAt: new Date(), saleId: sale.id, idempotencyKey: body.idempotencyKey, responsibleId: request.user.sub, notes: body.reason } });
      }
      await tx.finance.updateMany({ where: { saleId: sale.id, category: "Contrato", status: { in: ["PENDENTE", "ATRASADO"] } }, data: { status: "CANCELADO" } });
      await tx.closedSale.update({ where: { id: sale.id }, data: { reversedAt: new Date(), reversalReason: body.reason, reversedBy: request.user.sub } });
      await tx.lead.update({ where: { id }, data: { status: sale.previousStatus ?? "NOVO" } });
      await tx.leadActivity.create({ data: { leadId: id, actorId: request.user.sub, type: "VENDA_REVERTIDA", content: `Venda revertida: ${body.reason}${refundDue > 0 ? ` · reembolso pago de R$ ${refundDue.toFixed(2)}` : ""}` } });
      return { saleId: sale.id, restoredStatus: sale.previousStatus ?? "NOVO", refundRecorded: refundDue };
    });
  });

  // Deletar lead
  app.delete(
    "/:id",
    { onRequest: [app.authorize("ADMIN","COMERCIAL")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const existing = await prisma.lead.findFirst({ where: { id, ...(request.user.role === "ADMIN" ? {} : { ownerId: request.user.sub }) }, include: { sale: { select: { id: true } } } });
      if (!existing) throw new AppError("Lead não encontrado", 404);
      if (existing.sale) throw new AppError("Leads com histórico de venda não podem ser apagados. Reverta a venda de forma controlada e preserve o registro.", 409);
      try {
        await prisma.$transaction(async (tx) => {
          await tx.client.updateMany({ where: { leadId: id }, data: { leadId: null } });
          await tx.lead.delete({ where: { id } });
        });
        return reply.status(204).send();
      } catch {
        throw new AppError("Lead não encontrado", 404);
      }
    },
  );
}
