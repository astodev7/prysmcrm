import Fastify from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import { env } from "./config/env.js";
import authPlugin from "./plugins/auth.js";
import { AppError } from "./utils/errors.js";
import { ZodError } from "zod";

import { authRoutes } from "./modules/auth/auth.routes.js";
import { usersRoutes } from "./modules/users/users.routes.js";
import { leadsRoutes } from "./modules/leads/leads.routes.js";
import { clientsRoutes } from "./modules/clients/clients.routes.js";
import { projectsRoutes } from "./modules/projects/projects.routes.js";
import { tasksRoutes } from "./modules/tasks/tasks.routes.js";
import { financeRoutes } from "./modules/finance/finance.routes.js";
import { companyRoutes } from "./modules/company/company.routes.js";

export async function buildApp() {
  const app = Fastify({
    logger: env.NODE_ENV === "development",
  });

  await app.register(cors, {
    origin: env.FRONTEND_URL,
    credentials: true,
  });

  await app.register(sensible);
  await app.register(authPlugin);

  // Health check
  app.get("/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }));

  // Rotas
  await app.register(authRoutes, { prefix: "/auth" });
  await app.register(usersRoutes, { prefix: "/users" });
  await app.register(leadsRoutes, { prefix: "/leads" });
  await app.register(clientsRoutes, { prefix: "/clients" });
  await app.register(projectsRoutes, { prefix: "/projects" });
  await app.register(tasksRoutes, { prefix: "/tasks" });
  await app.register(financeRoutes, { prefix: "/finance" });
  await app.register(companyRoutes, { prefix: "/company" });

  // Error handler global
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        message: "Dados inválidos",
        errors: error.flatten().fieldErrors,
      });
    }

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({ message: error.message });
    }

    // Fastify validation / JWT errors
    if (error.validation) {
      return reply.status(400).send({ message: "Dados inválidos", errors: error.validation });
    }

    app.log.error(error);
    return reply.status(500).send({ message: "Erro interno do servidor" });
  });

  return app;
}
