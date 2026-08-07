ALTER TABLE "PaymentAmendment" DROP CONSTRAINT IF EXISTS "PaymentAmendment_paymentId_fkey";
ALTER TABLE "PaymentAmendment"
  ADD CONSTRAINT "PaymentAmendment_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "Payment"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
