CREATE TABLE "user_account_setup_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" VARCHAR(128) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_account_setup_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_account_setup_tokens_tokenHash_key" ON "user_account_setup_tokens"("tokenHash");
CREATE INDEX "user_account_setup_tokens_userId_usedAt_idx" ON "user_account_setup_tokens"("userId", "usedAt");
CREATE INDEX "user_account_setup_tokens_expiresAt_idx" ON "user_account_setup_tokens"("expiresAt");

ALTER TABLE "user_account_setup_tokens" ADD CONSTRAINT "user_account_setup_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
