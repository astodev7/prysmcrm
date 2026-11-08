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

```bash
# 1. Instalar dependências
npm install

# 2. Configurar ambiente
cp .env.example .env
# Edite o .env com sua DATABASE_URL e JWT_SECRET

# 3. Criar o banco e rodar migrations
npx prisma migrate dev --name init

# 4. Criar o primeiro administrador real
#    (preencha ADMIN_NAME, ADMIN_EMAIL e ADMIN_PASSWORD no .env e rode:)
npm run prisma:seed
#    depois apague ADMIN_PASSWORD do .env

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
| `ADMIN_NAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Só no seed | Criam o 1º administrador (`npm run prisma:seed`) |

## Usuários

Não existem usuários nem senhas padrão. O acesso é criado assim:

1. **Primeiro admin**: `npm run prisma:seed` (lê `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` do `.env`; não apaga nada e não duplica).
2. **Demais pessoas**: no sistema, em *Configurações → Usuários e permissões* (somente ADMIN), ou pelo terminal:
   ```bash
   npm run user:create -- --name "Maria Souza" --email maria@empresa.com --role COMERCIAL
   # a senha é pedida no terminal (digitação oculta); use --reset para redefinir a senha de quem já existe
   ```
3. **Contas de demonstração antigas** (`rafael@` / `bianca@nodulo.studio`, senha `123456`), se existirem no seu banco:
   crie seus admins reais e rode `npm run user:purge-demo` — ele desativa só as que ainda usam a senha padrão.

Dados de exemplo (leads, clientes etc.) existem só para desenvolvimento: `npm run prisma:seed:demo -- --force`
(**apaga todo o banco**; recusa rodar com `NODE_ENV=production`).

Regras: senha com no mínimo 8 caracteres; e-mail é salvo em minúsculas; sempre deve existir ao menos 1 admin ativo;
desativar um usuário bloqueia o acesso dele imediatamente.

## Endpoints

### Auth
| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| POST | `/auth/login` | — | Login |
| GET | `/auth/me` | ✅ | Dados do usuário logado |
| PUT | `/auth/password` | ✅ | O próprio usuário troca a senha |

> A rota pública `/auth/register` foi removida (permitia criar o 1º ADMIN sem login).

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
  -d '{"email":"seu@email.com","password":"sua-senha"}'
```
