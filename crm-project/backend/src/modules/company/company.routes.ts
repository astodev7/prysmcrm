import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../utils/errors.js";

const companySchema = z.object({
  name: z.string().min(1),
  cnpj: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
});

export async function companyRoutes(app: FastifyInstance) {
  // Buscar dados da empresa (sempre pega o primeiro registro)
  app.get(
    "/",
    { onRequest: [app.authorize("ADMIN")] },
    async () => {
      const company = await prisma.company.findFirst();
      return company ?? null;
    },
  );

  // Criar ou atualizar (upsert simples)
  app.put(
    "/",
    { onRequest: [app.authorize("ADMIN")] },
    async (request) => {
      const body = companySchema.parse(request.body);

      const existing = await prisma.company.findFirst();

      if (existing) {
        return prisma.company.update({
          where: { id: existing.id },
          data: body,
        });
      }

      return prisma.company.create({ data: body });
    },
  );
}
