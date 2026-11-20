WITH available_stock AS (
    SELECT
        COALESCE(d."hospitalId", hs."hospitalId") AS "hospitalId",
        d."bloodType",
        SUM(d."quantity")::INTEGER AS "unitsAvailable",
        MAX(d."createdAt") AS "updatedAt"
    FROM "DonationRecord" d
    LEFT JOIN "HospitalStaff" hs ON hs."staffId" = d."staffId"
    WHERE d."status" = 'AVAILABLE'
    GROUP BY COALESCE(d."hospitalId", hs."hospitalId"), d."bloodType"
), inserted_inventory AS (
    INSERT INTO "BloodInventory" (
        "bloodType",
        "unitsAvailable",
        "minimumUnits",
        "updatedAt",
        "createdAt",
        "hospitalId"
    )
    SELECT
        stock."bloodType",
        stock."unitsAvailable",
        5,
        stock."updatedAt",
        CURRENT_TIMESTAMP,
        stock."hospitalId"
    FROM available_stock stock
    WHERE stock."hospitalId" IS NOT NULL
      AND NOT EXISTS (
          SELECT 1
          FROM "BloodInventory" existing
          WHERE existing."hospitalId" = stock."hospitalId"
      )
    ON CONFLICT ("hospitalId", "bloodType") DO NOTHING
    RETURNING "inventoryId", "unitsAvailable"
)
INSERT INTO "InventoryTransaction" (
    "transactionType",
    "unitsChanged",
    "reason",
    "inventoryId"
)
SELECT
    'INITIAL_STOCK_SYNC',
    inventory."unitsAvailable",
    'Backfilled from AVAILABLE donation records',
    inventory."inventoryId"
FROM inserted_inventory inventory;