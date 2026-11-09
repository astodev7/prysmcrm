import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../utils/errors.js";

const itemSchema = z.object({ name: z.string().min(1), quantity: z.number().positive(), unitPrice: z.number().min(0) });
const proposalSchema = z.object({ title: z.string().min(1), packageName: z.string().optional().nullable(), description: z.string().min(1), items: z.array(itemSchema).min(1), discount: z.number().min(0).default(0), terms: z.string().optional().nullable(), deadline: z.string().datetime().optional().nullable(), status: z.enum(["RASCUNHO", "ENVIADA", "NEGOCIACAO", "APROVADA", "RECUSADA", "EXPIRADA"]).optional() });

async function ownsLead(id: string, userId: string, admin: boolean) {
  const lead = await prisma.lead.findFirst({ where: { id, ...(admin ? {} : { ownerId: userId }) }, select: { id: true } });
  if (!lead) throw new AppError("Lead não encontrado", 404);
}

export async function commercialRoutes(app: FastifyInstance) {
  app.get("/leads/:leadId/activities", { onRequest: [app.authorize("ADMIN", "COMERCIAL")] }, async (request) => {
    const { leadId } = request.params as { leadId: string }; await ownsLead(leadId, request.user.sub, request.user.role === "ADMIN");
    return prisma.leadActivity.findMany({ where: { leadId }, orderBy: { createdAt: "desc" }, take: 200 });
  });
  app.post("/leads/:leadId/activities", { onRequest: [app.authorize("ADMIN", "COMERCIAL")] }, async (request, reply) => {
    const { leadId } = request.params as { leadId: string }; await ownsLead(leadId, request.user.sub, request.user.role === "ADMIN");
    const body = z.object({ type: z.enum(["LIGACAO", "MENSAGEM_ENVIADA", "MENSAGEM_RECEBIDA", "REUNIAO", "PROPOSTA", "OBSERVACAO"]), content: z.string().min(1).max(5000) }).parse(request.body);
    return reply.status(201).send(await prisma.leadActivity.create({ data: { ...body, leadId, actorId: request.user.sub } }));
  });
  app.get("/follow-ups", { onRequest: [app.authorize("ADMIN", "COMERCIAL")] }, async (request) => {
    const query = request.query as { status?: string; from?: string; to?: string };
    return prisma.followUp.findMany({ where: { ...(request.user.role === "ADMIN" ? {} : { ownerId: request.user.sub }), ...(query.status ? { status: query.status as never } : {}), ...(query.from || query.to ? { dueAt: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } } : {}) }, include: { lead: { select: { id: true, company: true, contact: true } } }, orderBy: { dueAt: "asc" } });
  });
  app.post("/follow-ups", { onRequest: [app.authorize("ADMIN", "COMERCIAL")] }, async (request, reply) => {
    const body = z.object({ leadId: z.string(), description: z.string().min(1).max(1000), dueAt: z.string().datetime() }).parse(request.body);
    await ownsLead(body.leadId, request.user.sub, request.user.role === "ADMIN");
    const followUp = await prisma.followUp.create({ data: { ...body, ownerId: request.user.sub, dueAt: new Date(body.dueAt) } });
    await prisma.leadActivity.create({ data: { leadId: body.leadId, actorId: request.user.sub, type: "FOLLOW_UP", content: `Acompanhamento agendado: ${body.description}` } });
    return reply.status(201).send(followUp);
  });
  app.patch("/follow-ups/:id", { onRequest: [app.authorize("ADMIN", "COMERCIAL")] }, async (request) => {
    const { id } = request.params as { id: string };
    const body = z.object({ status: z.enum(["PENDENTE", "CONCLUIDO", "CANCELADO"]).optional(), dueAt: z.string().datetime().optional(), description: z.string().min(1).optional() }).parse(request.body);
    const existing = await prisma.followUp.findFirst({ where: { id, ...(request.user.role === "ADMIN" ? {} : { ownerId: request.user.sub }) } });
    if (!existing) throw new AppError("Acompanhamento não encontrado", 404);
    const updated = await prisma.followUp.update({ where: { id }, data: { ...body, dueAt: body.dueAt ? new Date(body.dueAt) : undefined, completedAt: body.status === "CONCLUIDO" ? new Date() : body.status === "PENDENTE" ? null : undefined } });
    await prisma.leadActivity.create({ data: { leadId: existing.leadId, actorId: request.user.sub, type: "FOLLOW_UP", content: `Acompanhamento ${updated.status.toLowerCase()}: ${updated.description}` } });
    return updated;
  });
  app.get("/proposals", { onRequest: [app.authorize("ADMIN", "COMERCIAL")] }, async (request) => prisma.proposal.findMany({ where: request.user.role === "ADMIN" ? {} : { lead: { ownerId: request.user.sub } }, include: { lead: { select: { id: true, company: true, contact: true } }, versions: { orderBy: { version: "desc" }, take: 1 } }, orderBy: { updatedAt: "desc" } }));
  app.post("/leads/:leadId/proposals", { onRequest: [app.authorize("ADMIN", "COMERCIAL")] }, async (request, reply) => {
    const { leadId } = request.params as { leadId: string }; await ownsLead(leadId, request.user.sub, request.user.role === "ADMIN");
    const body = proposalSchema.parse(request.body); const subtotal = body.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    if (body.discount > subtotal) throw new AppError("O desconto não pode superar o subtotal", 400);
    const proposal = await prisma.proposal.create({ data: { ...body, leadId, total: subtotal - body.discount, deadline: body.deadline ? new Date(body.deadline) : null } });
    const snapshot = { ...body, total: subtotal - body.discount };
    await prisma.proposalVersion.create({ data: { proposalId: proposal.id, version: 1, snapshot, actorId: request.user.sub } });
    return reply.status(201).send(proposal);
  });
  app.put("/proposals/:id", { onRequest: [app.authorize("ADMIN", "COMERCIAL")] }, async (request) => {
    const { id } = request.params as { id: string }; const body = proposalSchema.parse(request.body);
    const existing = await prisma.proposal.findFirst({ where: { id, ...(request.user.role === "ADMIN" ? {} : { lead: { ownerId: request.user.sub } }) } });
    if (!existing) throw new AppError("Proposta não encontrada", 404);
    const subtotal = body.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0); if (body.discount > subtotal) throw new AppError("O desconto não pode superar o subtotal", 400);
    return prisma.$transaction(async (tx) => {
      const version = existing.version + 1; const total = subtotal - body.discount;
      const proposal = await tx.proposal.update({ where: { id }, data: { ...body, version, total, deadline: body.deadline ? new Date(body.deadline) : null } });
      await tx.proposalVersion.create({ data: { proposalId: id, version, snapshot: { ...body, total }, actorId: request.user.sub } });
      return proposal;
    });
  });
}
