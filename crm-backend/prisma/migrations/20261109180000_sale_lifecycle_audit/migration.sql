ALTER TABLE "closed_sales"
  ADD COLUMN "previousStatus" "LeadStatus",
  ADD COLUMN "reversedAt" TIMESTAMP(3),
  ADD COLUMN "reversalReason" TEXT,
  ADD COLUMN "reversedBy" TEXT;

CREATE INDEX "closed_sales_reversedAt_idx" ON "closed_sales"("reversedAt");
ALTER TABLE "closed_sales" ADD CONSTRAINT "closed_sales_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD COLUMN "details" JSONB;

ALTER TABLE "finances" ADD COLUMN "responsibleId" TEXT;
ALTER TABLE "finances" ADD CONSTRAINT "finances_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "finances_responsibleId_idx" ON "finances"("responsibleId");
