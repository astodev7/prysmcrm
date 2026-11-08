import "dotenv/config";
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import readline from "node:readline";

/**
 * Cria (ou, com --reset, atualiza a senha de) um usuário real.
 *
 *   npm run user:create -- --name "Maria Souza" --email maria@empresa.com --role COMERCIAL
 *
 * A senha é pedida no terminal (digitação oculta). Perfis: ADMIN | COMERCIAL | FINANCEIRO | OPERACIONAL
 * Dica: evite --password na linha de comando (fica no histórico do terminal).
 */
const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const w = (rl as unknown as { _writeToOutput: (s: string) => void });
    w._writeToOutput = (s: string) => {
      if (s.includes(question)) process.stdout.write(s);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function main() {
  const reset = process.argv.includes("--reset");
  const email = arg("email")?.trim().toLowerCase();
  const name = arg("name")?.trim();
  const role = (arg("role")?.toUpperCase() ?? "COMERCIAL") as Role;

  if (!email || (!reset && !name)) {
    console.error('Uso: npm run user:create -- --name "Nome" --email e@mail.com [--role ADMIN|COMERCIAL|FINANCEIRO|OPERACIONAL] [--reset]');
    process.exit(1);
  }
  if (!Object.values(Role).includes(role)) {
    console.error(`❌ Perfil inválido: ${role}`);
    process.exit(1);
  }

  const password = arg("password") ?? (await askHidden("Senha (mín. 8 caracteres): "));
  if (password.length < 8) {
    console.error("❌ A senha precisa ter pelo menos 8 caracteres.");
    process.exit(1);
  }

  const rounds = Number(process.env.BCRYPT_SALT_ROUNDS ?? 12);
  const hash = await bcrypt.hash(password, rounds);
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing && !reset) {
    console.error(`❌ ${email} já existe. Use --reset para trocar a senha.`);
    process.exit(1);
  }

  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data: { password: hash, active: true } });
    console.log(`✅ Senha de ${email} redefinida (usuário reativado).`);
  } else {
    await prisma.user.create({ data: { name: name!, email, password: hash, role } });
    console.log(`✅ Usuário criado: ${name} <${email}> [${role}]`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
