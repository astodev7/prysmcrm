CREATE TABLE "closed_sales" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "clientId" TEXT,
  "contractAmount" DECIMAL(12,2) NOT NULL,
  "soldAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "closed_sales_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "closed_sales_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "closed_sales_leadId_key" ON "closed_sales"("leadId");
CREATE INDEX "closed_sales_soldAt_idx" ON "closed_sales"("soldAt");
ALTER TABLE "finances" ADD COLUMN "saleId" TEXT;
ALTER TABLE "finances" ADD CONSTRAINT "finances_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "closed_sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "finances_saleId_idx" ON "finances"("saleId");

INSERT INTO "closed_sales" ("id", "leadId", "clientId", "contractAmount", "soldAt", "createdAt", "updatedAt")
SELECT 'legacy-sale-' || l."id", l."id", c."id", l."value", l."updatedAt", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "leads" l LEFT JOIN "clients" c ON c."leadId" = l."id" WHERE l."status" = 'GANHO'
ON CONFLICT ("leadId") DO NOTHING;
