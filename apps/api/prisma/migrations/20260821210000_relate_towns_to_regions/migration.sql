-- Establish Region -> Town ownership without guessing historical data.
ALTER TABLE "towns" ADD COLUMN "regionId" UUID;

DO $$
DECLARE
  unresolved_count INTEGER;
  conflict_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO conflict_count
  FROM (
    SELECT t.id
    FROM "towns" t
    JOIN "institutions" i ON i."townId" = t.id
    GROUP BY t.id
    HAVING COUNT(DISTINCT i."regionId") > 1
  ) conflicts;

  IF conflict_count > 0 THEN
    RAISE EXCEPTION 'Cannot infer a unique region for % town(s) used by institutions', conflict_count;
  END IF;

  UPDATE "towns" t
  SET "regionId" = mapping."regionId"
  FROM (
    SELECT i."townId" AS "townId", (ARRAY_AGG(i."regionId" ORDER BY i."regionId"))[1] AS "regionId"
    FROM "institutions" i
    WHERE i."townId" IS NOT NULL
    GROUP BY i."townId"
  ) mapping
  WHERE t.id = mapping."townId";

  SELECT COUNT(*) INTO unresolved_count FROM "towns" WHERE "regionId" IS NULL;
  IF unresolved_count > 0 THEN
    RAISE EXCEPTION 'Cannot make Town.regionId required: % town(s) have no institution-based region mapping', unresolved_count;
  END IF;
END $$;

ALTER TABLE "towns" ALTER COLUMN "regionId" SET NOT NULL;
DROP INDEX "towns_nameAr_key";
ALTER TABLE "towns" ADD CONSTRAINT "towns_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "towns_regionId_nameAr_key" ON "towns"("regionId", "nameAr");
CREATE INDEX "towns_regionId_idx" ON "towns"("regionId");
