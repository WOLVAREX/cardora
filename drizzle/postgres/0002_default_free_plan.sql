-- Ensure every installation has an active free default with the base account limits.
INSERT INTO "cardora_subscription_plans" (
  "code", "name", "description", "contactLimit", "collectionLimit", "priceMinor", "currency", "billingInterval", "isActive", "isDefault"
)
SELECT 'free', 'Free', 'The default Cardora plan: up to 100 accepted contacts and 1 collection link.', 100, 1, 0, 'KES', 'monthly', true, true
WHERE NOT EXISTS (
  SELECT 1 FROM "cardora_subscription_plans" WHERE "isActive" = true AND "priceMinor" = 0
)
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
DO $$
DECLARE
  base_plan_id integer;
BEGIN
  SELECT "id" INTO base_plan_id
  FROM "cardora_subscription_plans"
  WHERE "isActive" = true AND "priceMinor" = 0
  ORDER BY "isDefault" DESC, ("code" = 'free') DESC, "id"
  LIMIT 1
  FOR UPDATE;

  IF base_plan_id IS NULL THEN
    RAISE EXCEPTION 'Cardora requires an active, free default subscription plan';
  END IF;

  UPDATE "cardora_subscription_plans"
  SET "isDefault" = false
  WHERE "isDefault" = true AND "id" <> base_plan_id;

  UPDATE "cardora_subscription_plans"
  SET "description" = 'The default Cardora plan: up to 100 accepted contacts and 1 collection link.',
      "contactLimit" = 100,
      "collectionLimit" = 1,
      "priceMinor" = 0,
      "currency" = 'KES',
      "billingInterval" = 'monthly',
      "isActive" = true,
      "isDefault" = true
  WHERE "id" = base_plan_id;
END $$;
