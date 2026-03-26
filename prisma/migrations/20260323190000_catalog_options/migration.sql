-- CreateTable
CREATE TABLE "LanguageOption" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LanguageOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfessionOption" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfessionOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LanguageOption_code_key" ON "LanguageOption"("code");

-- CreateIndex
CREATE INDEX "LanguageOption_isActive_idx" ON "LanguageOption"("isActive");

-- CreateIndex
CREATE INDEX "LanguageOption_name_idx" ON "LanguageOption"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ProfessionOption_slug_key" ON "ProfessionOption"("slug");

-- CreateIndex
CREATE INDEX "ProfessionOption_isActive_idx" ON "ProfessionOption"("isActive");

-- CreateIndex
CREATE INDEX "ProfessionOption_name_idx" ON "ProfessionOption"("name");
