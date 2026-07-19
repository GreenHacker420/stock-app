DELETE FROM "DeliveryMemoSerialAssignment" assignment
WHERE NOT EXISTS (SELECT 1 FROM "Shop" shop WHERE shop.id = assignment."shopId")
   OR NOT EXISTS (SELECT 1 FROM "DeliveryMemo" memo WHERE memo.id = assignment."dmId")
   OR NOT EXISTS (SELECT 1 FROM "Item" item WHERE item.id = assignment."itemId")
   OR NOT EXISTS (SELECT 1 FROM "User" app_user WHERE app_user.id = assignment."assignedById");

DELETE FROM "CustomerLedgerEntry" entry
WHERE NOT EXISTS (SELECT 1 FROM "Shop" shop WHERE shop.id = entry."shopId")
   OR NOT EXISTS (SELECT 1 FROM "Customer" customer WHERE customer.id = entry."customerId")
   OR NOT EXISTS (SELECT 1 FROM "User" app_user WHERE app_user.id = entry."createdById");

ALTER TABLE "DeliveryMemoSerialAssignment" DROP CONSTRAINT IF EXISTS "DeliveryMemoSerialAssignment_shopId_fkey";
ALTER TABLE "DeliveryMemoSerialAssignment" DROP CONSTRAINT IF EXISTS "DeliveryMemoSerialAssignment_dmId_fkey";
ALTER TABLE "DeliveryMemoSerialAssignment" DROP CONSTRAINT IF EXISTS "DeliveryMemoSerialAssignment_itemId_fkey";
ALTER TABLE "DeliveryMemoSerialAssignment" DROP CONSTRAINT IF EXISTS "DeliveryMemoSerialAssignment_assignedById_fkey";
ALTER TABLE "CustomerLedgerEntry" DROP CONSTRAINT IF EXISTS "CustomerLedgerEntry_shopId_fkey";
ALTER TABLE "CustomerLedgerEntry" DROP CONSTRAINT IF EXISTS "CustomerLedgerEntry_customerId_fkey";
ALTER TABLE "CustomerLedgerEntry" DROP CONSTRAINT IF EXISTS "CustomerLedgerEntry_createdById_fkey";
ALTER TABLE "CustomerLedgerEntry" DROP CONSTRAINT IF EXISTS "CustomerLedgerEntry_reversalOfId_fkey";

ALTER TABLE "DeliveryMemoSerialAssignment" ADD CONSTRAINT "DeliveryMemoSerialAssignment_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryMemoSerialAssignment" ADD CONSTRAINT "DeliveryMemoSerialAssignment_dmId_fkey"
  FOREIGN KEY ("dmId") REFERENCES "DeliveryMemo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliveryMemoSerialAssignment" ADD CONSTRAINT "DeliveryMemoSerialAssignment_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryMemoSerialAssignment" ADD CONSTRAINT "DeliveryMemoSerialAssignment_assignedById_fkey"
  FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CustomerLedgerEntry" ADD CONSTRAINT "CustomerLedgerEntry_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerLedgerEntry" ADD CONSTRAINT "CustomerLedgerEntry_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerLedgerEntry" ADD CONSTRAINT "CustomerLedgerEntry_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerLedgerEntry" ADD CONSTRAINT "CustomerLedgerEntry_reversalOfId_fkey"
  FOREIGN KEY ("reversalOfId") REFERENCES "CustomerLedgerEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
