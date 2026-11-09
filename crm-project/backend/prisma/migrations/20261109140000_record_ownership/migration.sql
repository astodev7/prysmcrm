ALTER TABLE "clients" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "projects" ADD COLUMN "ownerId" TEXT;

UPDATE "clients" c
SET "ownerId" = COALESCE(l."ownerId", (SELECT u."id" FROM "users" u WHERE u."role" = 'ADMIN' ORDER BY u."createdAt" ASC LIMIT 1))
FROM "leads" l WHERE c."leadId" = l."id" AND c."ownerId" IS NULL;
UPDATE "clients" c
SET "ownerId" = (SELECT u."id" FROM "users" u WHERE u."role" = 'ADMIN' ORDER BY u."createdAt" ASC LIMIT 1)
WHERE c."ownerId" IS NULL;
UPDATE "projects" p SET "ownerId" = c."ownerId" FROM "clients" c WHERE p."clientId" = c."id" AND p."ownerId" IS NULL;

ALTER TABLE "clients" ADD CONSTRAINT "clients_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "projects" ADD CONSTRAINT "projects_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "clients_ownerId_idx" ON "clients"("ownerId");
CREATE INDEX "projects_ownerId_idx" ON "projects"("ownerId");
