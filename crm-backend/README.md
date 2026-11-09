# CRM Comercial e Financeiro — Backend.

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

```bash
# 1. Instalar dependências
npm install

# 2. Configurar ambiente
cp .env.example .env
# Edite o .env com sua DATABASE_URL e JWT_SECRET

# 3. Criar o banco e rodar migrations
npx prisma migrate dev --name init

# 4. Popular com dados de exemplo
npm run prisma:seed

# 5. Subir o servidor
npm run dev
```

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

## Usuários de seed

| Email | Senha | Role |
|-------|-------|------|
| `rafael@nodulo.studio` | `123456` | ADMIN |
| `bianca@nodulo.studio` | `123456` | COMERCIAL |

## Endpoints

### Auth
| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| POST | `/auth/login` | — | Login |
| POST | `/auth/register` | ADMIN* | Registrar usuário |
| GET | `/auth/me` | ✅ | Dados do usuário logado |

\* O primeiro usuário pode ser criado sem auth (vira ADMIN automaticamente).

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
| PUT | `/leads/:id` | Atualizar (status `GANHO` cria Cliente automático) |
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
| GET | `/finance/:id` | Detalhe |
| POST | `/finance` | Criar |
| PUT | `/finance/:id` | Atualizar |
| DELETE | `/finance/:id` | Remover |

### Company
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/company` | Dados da empresa |
| PUT | `/company` | Criar/atualizar (ADMIN) |

### Health
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/health` | Health check |

## Autenticação

Todas as rotas protegidas exigem header:

```
Authorization: Bearer <token>
```

Roles disponíveis: `ADMIN`, `COMERCIAL`, `FINANCEIRO`, `OPERACIONAL`.

## Exemplo de login

```bash
curl -X POST http://localhost:3333/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"rafael@nodulo.studio","password":"123456"}'
```

-
