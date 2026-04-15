/*
  Warnings:

  - You are about to drop the column `language` on the `ProfessionSubcategory` table. All the data in the column will be lost.
  - You are about to drop the column `profession` on the `ProfessionSubcategory` table. All the data in the column will be lost.
  - You are about to drop the column `wordAllocation` on the `ProfessionSubcategory` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[professionId,position]` on the table `ProfessionSubcategory` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `professionId` to the `ProfessionSubcategory` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "idx_learning_path_learner_status";

-- DropIndex
DROP INDEX "ProfessionSubcategory_profession_language_idx";

-- DropIndex
DROP INDEX "ProfessionSubcategory_profession_language_position_key";

-- AlterTable
ALTER TABLE "ProfessionSubcategory" DROP COLUMN "language",
DROP COLUMN "profession",
DROP COLUMN "wordAllocation",
ADD COLUMN     "professionId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ProfessionSubcategory_professionId_position_key" ON "ProfessionSubcategory"("professionId", "position");

-- AddForeignKey
ALTER TABLE "ProfessionSubcategory" ADD CONSTRAINT "ProfessionSubcategory_professionId_fkey" FOREIGN KEY ("professionId") REFERENCES "ProfessionOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
