ALTER TABLE "finances" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "finances_idempotencyKey_key" ON "finances"("idempotencyKey");
UPDATE "finances" SET "paidAt" = "updatedAt" WHERE "status" = 'PAGO' AND "paidAt" IS NULL;

INSERT INTO "finances" ("id", "name", "value", "kind", "status", "relation", "category", "saleId", "createdAt", "updatedAt")
SELECT 'legacy-contract-' || s."id", 'Contrato — ' || l."company", s."contractAmount", 'RECEITA', 'PENDENTE', l."company", 'Contrato', s."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "closed_sales" s JOIN "leads" l ON l."id" = s."leadId"
WHERE s."contractAmount" > 0
  AND NOT EXISTS (SELECT 1 FROM "finances" f WHERE f."saleId" = s."id" AND f."category" = 'Contrato');
