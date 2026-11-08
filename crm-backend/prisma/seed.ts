import "dotenv/config";
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/**
 * Seed NÃO destrutivo: nunca apaga nada.
 * Cria o primeiro administrador a partir de variáveis de ambiente
 * (só se esse e-mail ainda não existir):
 *
 *   ADMIN_NAME="Seu Nome"  ADMIN_EMAIL="voce@empresa.com"  ADMIN_PASSWORD="uma-senha-forte"
 *
 * Para criar os demais usuários: use a tela Configurações → Usuários e permissões,
 * ou `npm run user:create`.
 * Para dados de exemplo (apenas em dev): `npm run prisma:seed:demo -- --force`.
 */
async function main() {
  const name = process.env.ADMIN_NAME?.trim();
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!name || !email || !password) {
    console.log("ℹ️  Nada a fazer: defina ADMIN_NAME, ADMIN_EMAIL e ADMIN_PASSWORD para criar o 1º administrador.");
    return;
  }
  if (password.length < 8) {
    console.error("❌ ADMIN_PASSWORD precisa ter pelo menos 8 caracteres.");
    process.exit(1);
  }

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) {
    console.log(`ℹ️  ${email} já existe — nada foi alterado.`);
    return;
  }

  const rounds = Number(process.env.BCRYPT_SALT_ROUNDS ?? 12);
  await prisma.user.create({
    data: { name, email, password: await bcrypt.hash(password, rounds), role: Role.ADMIN },
  });
  console.log(`✅ Administrador criado: ${email}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
