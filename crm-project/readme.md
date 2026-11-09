# Prysm CRM

Pasta única do projeto.

- Raiz (`package.json`, `src/`, `index.html`): frontend. Deploy no Netlify. Publish directory: `dist`. Variável: `VITE_API_URL`.
- `backend/`: API (Fastify + Prisma). Deploy no Railway com a raiz do serviço em `backend`. Variáveis: `DATABASE_URL`, `JWT_SECRET` (mínimo 32 caracteres), `FRONTEND_URL`, `NODE_ENV=production`; `TOTP_ENCRYPTION_KEY` é opcional, mas recomendada (chave aleatória própria com pelo menos 32 caracteres).

## Publicação das alterações

Antes de publicar a API, aplique as novas migrações no Railway com `pnpm prisma:migrate:deploy` (ou `npx prisma migrate deploy`). Elas adicionam o autenticador, detalhes aos logs de auditoria e o proprietário de clientes/projetos existentes. Configure `TOTP_ENCRYPTION_KEY` antes de usuários ativarem o autenticador e mantenha essa chave estável; trocar a chave exige que os usuários configurem o autenticador novamente.

O login usa cookie HttpOnly de curta duração e, quando configurado pelo usuário, uma segunda etapa com aplicativo TOTP compatível. O menu Segurança permite configurar/validar a chave manualmente no autenticador.

-
