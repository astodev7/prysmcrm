# CRM Comercial e Financeiro — Backend

API REST completa para o CRM (Leads, Pipeline, Clientes, Projetos, Tarefas, Financeiro + Auth/RBAC).

## Stack

- **Node.js + TypeScript**
- **Fastify**
- **Prisma + PostgreSQL**
- **JWT + bcrypt**
- **Zod** (validação)

## Pré-requisitos

- Node.js 20+
- PostgreSQL rodando
- pnpm ou npm

## Setup rápido

1. Instale as dependências e copie `.env.example` para `.env`.
2. Configure `DATABASE_URL`, `JWT_SECRET` (32+ caracteres), `BOOTSTRAP_ADMIN_SECRET` e `TOTP_ENCRYPTION_KEY` (chave separada de 32+ caracteres).
3. Aplique as migrações com `npx prisma migrate deploy`.
4. Crie a primeira conta em `/auth/register` usando `BOOTSTRAP_ADMIN_SECRET`.
5. Inicie a API com `npm run dev`.

O seed de demonstração só roda em banco sem usuários e exige `SEED_PASSWORD` forte; ele não apaga tabelas existentes.

As migrações `20261109170000_payment_idempotency` e `20261109180000_sale_lifecycle_audit` adicionam proteção contra recebimentos repetidos, estado de reversão das vendas, campos de auditoria e responsável financeiro. A implantação Railway aplica as migrações pelo `startCommand`; em ambiente local, execute `npx prisma migrate deploy` antes de iniciar o backend.
API disponível em: `http://localhost:3333`

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `DATABASE_URL` | Sim | Connection string do PostgreSQL |
| `JWT_SECRET` | Sim | Chave secreta do JWT (≥ 16 chars) |
| `JWT_EXPIRES_IN` | Não | Ex: `7d` (padrão) |
| `PORT` | Não | Porta do servidor (padrão `3333`) |
| `FRONTEND_URL` | Não | URL do frontend para CORS |
| `BCRYPT_SALT_ROUNDS` | Não | Rounds do bcrypt (padrão `12`) |

O seed é opcional, só funciona em banco sem usuários e exige `SEED_PASSWORD` forte; nunca apaga tabelas existentes.

## Endpoints

### Auth
| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| POST | `/auth/login` | — | Login |
| POST | `/auth/register` | ADMIN* | Registrar usuário |
| GET | `/auth/me` | ✅ | Dados do usuário logado |

\* A primeira conta exige `BOOTSTRAP_ADMIN_SECRET`; senhas precisam de 12 caracteres, maiúscula, minúscula, número e símbolo.

### Users (ADMIN)
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/users` | Listar usuários |
| POST | `/users` | Criar usuário |
| PUT | `/users/:id` | Atualizar |
| DELETE | `/users/:id` | Desativar |

### Leads
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/leads` | Listar (filtros: `status`, `search`, `ownerId`) |
| GET | `/leads/pipeline/summary` | Resumo do pipeline |
| GET | `/leads/:id` | Detalhe |
| POST | `/leads` | Criar |
| PUT | `/leads/:id` | Atualizar (status `GANHO` fecha uma venda, converte o cliente e cria o recebível pendente) |
| POST | `/leads/:id/reverse-sale` | Reverter venda (ADMIN; exige motivo e confirmação de reembolso se já houve recebimento) |
| DELETE | `/leads/:id` | Remover |

### Clients
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/clients` | Listar |
| GET | `/clients/:id` | Detalhe |
| POST | `/clients` | Criar |
| PUT | `/clients/:id` | Atualizar |
| DELETE | `/clients/:id` | Remover |

### Projects
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/projects` | Listar |
| GET | `/projects/:id` | Detalhe |
| POST | `/projects` | Criar |
| PUT | `/projects/:id` | Atualizar |
| DELETE | `/projects/:id` | Remover |

### Tasks
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/tasks` | Listar |
| GET | `/tasks/:id` | Detalhe |
| POST | `/tasks` | Criar |
| PUT | `/tasks/:id` | Atualizar |
| DELETE | `/tasks/:id` | Remover |

### Finance
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/finance` | Listar lançamentos |
| GET | `/finance/summary` | Resumo (receitas, despesas, saldo) |
| GET | `/finance/sales/open` | Contratos e saldos em aberto |
| POST | `/finance/sales/:id/payments` | Registrar pagamento parcial ou total (requer `amount` e `idempotencyKey` UUID; `paidAt` opcional) |
| GET | `/finance/:id` | Detalhe |
| POST | `/finance` | Criar |
| PUT | `/finance/:id` | Atualizar |
| DELETE | `/finance/:id` | Remover |

### Company
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/company` | Dados da empresa |
| PUT | `/company` | Criar/atualizar (ADMIN) |

### Auditoria (ADMIN)
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/audit` | Até 500 alterações recentes (ator, ação, entidade e registro) |

### Health
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/health` | Health check |

## Autenticação

Login pode exigir código TOTP de aplicativo autenticador. Segredos TOTP são protegidos com AES-GCM e chave de criptografia separada. Configure ou desative o autenticador em Configurações → Segurança.

Sessões em cookie HttpOnly SameSite, validade de 15 minutos, logout com revogação. Login limita cinco falhas por IP a cada 15 minutos. Senhas novas exigem 12 caracteres com maiúscula, minúscula, número e símbolo.

A sessão usa cookie HttpOnly, SameSite e expira em 15 minutos. Sair e trocar senha invalidam as sessões anteriores.

Roles disponíveis: `ADMIN`, `COMERCIAL`, `FINANCEIRO`, `OPERACIONAL`.

## Exemplo de login

```bash
curl -X POST http://localhost:3333/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"rafael@nodulo.studio","password":"123456"}'
```
-