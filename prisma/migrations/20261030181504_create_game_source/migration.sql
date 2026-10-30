-- CreateTable
CREATE TABLE "GameSource" (
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "gameId" UUID NOT NULL,
    "contentHash" TEXT NOT NULL,

    CONSTRAINT "GameSource_pkey" PRIMARY KEY ("provider","externalId")
);

-- CreateIndex
CREATE INDEX "GameSource_gameId_idx" ON "GameSource"("gameId");

-- AddForeignKey
ALTER TABLE "GameSource" ADD CONSTRAINT "GameSource_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
