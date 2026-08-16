-- CreateEnum
CREATE TYPE "MerchantRole" AS ENUM ('owner', 'admin', 'operator', 'viewer');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "role" "MerchantRole" NOT NULL DEFAULT 'owner';
