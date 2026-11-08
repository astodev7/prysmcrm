import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

/**
 * Desativa as contas de demonstração do seed antigo (rafael@/bianca@nodulo.studio),
 * mas SOMENTE se elas ainda usam a senha padrão "123456".
 * Se alguém já trocou a senha, a conta é considerada real e não é tocada.
 *
 * Aborta se isso deixaria o sistema sem nenhum administrador ativo
 * (crie seus admins reais antes: `npm run user:create`).
 */
const prisma = new PrismaClient();
const DEMO_EMAILS = ["rafael@nodulo.studio", "bianca@nodulo.studio"];
const DEMO_PASSWORD = "123456";

async function main() {
  const demos = await prisma.user.findMany({ where: { email: { in: DEMO_EMAILS }, active: true } });

  const toDeactivate = [];
  for (const u of demos) {
    if (await bcrypt.compare(DEMO_PASSWORD, u.password)) toDeactivate.push(u);
  }

  if (toDeactivate.length === 0) {
    console.log("ℹ️  Nenhuma conta de demonstração ativa com a senha padrão. Nada a fazer.");
    return;
  }

  const ids = toDeactivate.map((u) => u.id);
  const remainingAdmins = await prisma.user.count({
    where: { role: "ADMIN", active: true, id: { notIn: ids } },
  });
  if (remainingAdmins === 0) {
    console.error("❌ Abortado: restaria nenhum administrador ativo. Crie um admin real primeiro (npm run user:create).");
    process.exit(1);
  }

  await prisma.user.updateMany({ where: { id: { in: ids } }, data: { active: false } });
  for (const u of toDeactivate) console.log(`✅ Desativada: ${u.email}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
