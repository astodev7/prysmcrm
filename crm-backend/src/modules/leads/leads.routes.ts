import { FastifyInstance } from "fastify";
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
    async () => {
      const groups = await prisma.lead.groupBy({
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

      const lead = await prisma.lead.create({
        data: {
          ...body,
          nextContact: body.nextContact ? new Date(body.nextContact) : null,
          creatorId: request.user.sub,
          ownerId: body.ownerId ?? request.user.sub,
        },
        include: {
          owner: { select: { id: true, name: true } },
        },
      });
      await prisma.leadActivity.create({ data: { leadId: lead.id, actorId: request.user.sub, type: "LEAD_CRIADO", content: "Lead criado" } });

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

      const existing = await prisma.lead.findFirst({ where: { id, ...(request.user.role === "ADMIN" ? {} : { ownerId: request.user.sub }) } });
      if (!existing) throw new AppError("Lead não encontrado", 404);
      const lead = await prisma.$transaction(async (tx) => {
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
        if (body.status && body.status !== existing.status) await tx.leadActivity.create({ data: { leadId: id, actorId: request.user.sub, type: "STATUS_ALTERADO", content: `Status alterado de ${existing.status} para ${body.status}` } });
        if (body.ownerId && body.ownerId !== existing.ownerId) await tx.leadActivity.create({ data: { leadId: id, actorId: request.user.sub, type: "RESPONSAVEL_ALTERADO", content: "Responsável do lead alterado" } });

        // Closing a lead is atomic: preserve one client, one sale, and one
        // initial receivable even if the status update is retried.
        if (body.status === "GANHO") {
          let client = await tx.client.findUnique({ where: { leadId: id } });
          if (!client) {
            client = await tx.client.create({
              data: {
                company: updatedLead.company,
                contact: updatedLead.contact,
                email: updatedLead.email,
                phone: updatedLead.phone,
                value: updatedLead.value,
                leadId: updatedLead.id,
              },
            });
          }
          let sale = await tx.closedSale.findUnique({ where: { leadId: id } });
          if (!sale) {
            sale = await tx.closedSale.create({ data: { leadId: id, clientId: client.id, contractAmount: updatedLead.value } });
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

  // Deletar lead
  app.delete(
    "/:id",
    { onRequest: [app.authorize("ADMIN","COMERCIAL")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const existing = await prisma.lead.findFirst({ where: { id, ...(request.user.role === "ADMIN" ? {} : { ownerId: request.user.sub }) } });
      if (!existing) throw new AppError("Lead não encontrado", 404);
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
