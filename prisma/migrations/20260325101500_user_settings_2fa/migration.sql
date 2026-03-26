-- AlterTable
ALTER TABLE "Learner"
ADD COLUMN "notificationInAppEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "notificationEmailEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "twoFactorMethod" TEXT,
ADD COLUMN "twoFactorCodeHash" TEXT,
ADD COLUMN "twoFactorCodeExpiry" TIMESTAMP(3);
