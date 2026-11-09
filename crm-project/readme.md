# Prysm CRM

Pasta única do projeto.

- Raiz (`package.json`, `src/`, `index.html`): frontend. Deploy no Netlify. Publish directory: `dist`. Variável: `VITE_API_URL`.
- `backend/`: API (Fastify + Prisma). Deploy no Railway com a raiz do serviço em `backend`. Variáveis: `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL`, `NODE_ENV=production`.

-
