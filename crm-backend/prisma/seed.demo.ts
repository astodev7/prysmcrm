import { PrismaClient, Role, LeadStatus, ProjectStatus, TaskStatus, TaskPriority, MoneyKind, MoneyStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // TRAVA DE SEGURANÇA: este seed APAGA TUDO (inclusive usuários) e recria dados de
  // exemplo com a senha "123456". Só roda em banco de desenvolvimento e com --force.
  if (process.env.NODE_ENV === "production") {
    console.error("❌ seed.demo recusado: NODE_ENV=production.");
    process.exit(1);
  }
  if (!process.argv.includes("--force")) {
    console.error("❌ Este seed apaga TODOS os dados do banco. Rode com --force se for isso mesmo:");
    console.error("   npm run prisma:seed:demo -- --force");
    process.exit(1);
  }

  console.log("🌱 Seeding database (DEMO)...");

  // Limpa dados existentes (ordem importa por causa das FKs)
  await prisma.finance.deleteMany();
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.client.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.company.deleteMany();
  await prisma.user.deleteMany();

  const password = await bcrypt.hash("123456", 12);

  const admin = await prisma.user.create({
    data: {
      name: "Rafael Lima",
      email: "rafael@nodulo.studio",
      password,
      role: Role.ADMIN,
    },
  });

  const comercial = await prisma.user.create({
    data: {
      name: "Bianca Alves",
      email: "bianca@nodulo.studio",
      password,
      role: Role.COMERCIAL,
    },
  });

  await prisma.company.create({
    data: {
      name: "Nódulo Studio Digital",
      cnpj: "00.000.000/0001-00",
      email: "contato@nodulo.studio",
      address: "São Paulo, SP",
      city: "São Paulo",
      state: "SP",
    },
  });

  const leadsData = [
    {
      company: "Acme Tecnologia",
      contact: "Carlos Mendes",
      email: "carlos@acme.com",
      segment: "SaaS",
      source: "Google Maps",
      status: LeadStatus.EM_NEGOCIACAO,
      value: 18500,
      probability: 70,
      nextAction: "Enviar proposta revisada",
      nextContact: new Date("2026-11-10"),
      ownerId: admin.id,
      creatorId: admin.id,
    },
    {
      company: "Studio Horizonte",
      contact: "Marina Costa",
      email: "marina@horizonte.com",
      segment: "Design",
      source: "Instagram",
      status: LeadStatus.PROPOSTA_ENVIADA,
      value: 9200,
      probability: 50,
      nextAction: "Follow-up WhatsApp",
      nextContact: new Date("2026-11-08"),
      ownerId: comercial.id,
      creatorId: comercial.id,
    },
    {
      company: "Verde Agro",
      contact: "João Pedro",
      email: "joao@verdeagro.com",
      segment: "Agronegócio",
      source: "Indicação",
      status: LeadStatus.INTERESSADO,
      value: 24000,
      probability: 40,
      nextAction: "Agendar call técnica",
      nextContact: new Date("2026-11-12"),
      ownerId: admin.id,
      creatorId: admin.id,
    },
    {
      company: "Byte Lab",
      contact: "Fernanda Souza",
      email: "fernanda@bytelab.io",
      segment: "Tech",
      source: "Prospecção",
      status: LeadStatus.GANHO,
      value: 32000,
      probability: 100,
      nextAction: "Kickoff",
      nextContact: new Date("2026-11-05"),
      ownerId: admin.id,
      creatorId: admin.id,
    },
    {
      company: "Casa & Co",
      contact: "Paulo Ribeiro",
      email: "paulo@casaco.com",
      segment: "Varejo",
      source: "WhatsApp",
      status: LeadStatus.NOVO,
      value: 6500,
      probability: 20,
      nextAction: "Primeiro contato",
      nextContact: new Date("2026-11-09"),
      ownerId: comercial.id,
      creatorId: comercial.id,
    },
  ];

  const createdLeads = [];
  for (const data of leadsData) {
    const lead = await prisma.lead.create({ data });
    createdLeads.push(lead);
  }

  // Cliente a partir do lead GANHO
  const ganhoLead = createdLeads.find((l) => l.status === LeadStatus.GANHO)!;
  const client = await prisma.client.create({
    data: {
      company: ganhoLead.company,
      contact: ganhoLead.contact,
      email: ganhoLead.email,
      value: ganhoLead.value,
      leadId: ganhoLead.id,
    },
  });

  const project = await prisma.project.create({
    data: {
      name: "Site institucional + blog",
      clientId: client.id,
      status: ProjectStatus.EM_DESENVOLVIMENTO,
      value: 32000,
      progress: 45,
      deadline: new Date("2026-12-15"),
    },
  });

  await prisma.task.createMany({
    data: [
      {
        title: "Enviar proposta revisada Acme",
        relation: "Lead Acme Tecnologia",
        status: TaskStatus.PENDENTE,
        priority: TaskPriority.ALTA,
        dueDate: new Date("2026-11-10"),
        assigneeId: admin.id,
      },
      {
        title: "Kickoff Byte Lab",
        relation: "Projeto Site institucional",
        status: TaskStatus.EM_ANDAMENTO,
        priority: TaskPriority.URGENTE,
        dueDate: new Date("2026-11-07"),
        assigneeId: admin.id,
        projectId: project.id,
      },
      {
        title: "Follow-up Studio Horizonte",
        relation: "Lead Studio Horizonte",
        status: TaskStatus.PENDENTE,
        priority: TaskPriority.MEDIA,
        dueDate: new Date("2026-11-08"),
        assigneeId: comercial.id,
      },
    ],
  });

  await prisma.finance.createMany({
    data: [
      {
        name: "Entrada projeto Byte Lab",
        value: 16000,
        kind: MoneyKind.RECEITA,
        status: MoneyStatus.PAGO,
        relation: "Projeto Site institucional",
        category: "Projetos",
        paidAt: new Date("2026-10-20"),
      },
      {
        name: "Parcela 2 Byte Lab",
        value: 16000,
        kind: MoneyKind.RECEITA,
        status: MoneyStatus.PENDENTE,
        relation: "Projeto Site institucional",
        category: "Projetos",
        dueDate: new Date("2026-12-01"),
      },
      {
        name: "Assinatura Figma",
        value: 280,
        kind: MoneyKind.DESPESA,
        status: MoneyStatus.PAGO,
        relation: "Operacional",
        category: "Ferramentas",
        paidAt: new Date("2026-11-01"),
      },
      {
        name: "Hosting + domínio",
        value: 150,
        kind: MoneyKind.DESPESA,
        status: MoneyStatus.PENDENTE,
        relation: "Operacional",
        category: "Infraestrutura",
        dueDate: new Date("2026-11-15"),
      },
    ],
  });

  console.log("✅ Seed concluído!");
  console.log("");
  console.log("Usuários criados:");
  console.log("  Admin:     rafael@nodulo.studio / 123456");
  console.log("  Comercial: bianca@nodulo.studio / 123456");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
