import { Test } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import { vi } from "vitest";
import { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ReviewsService } from "./reviews.service.js";

it.each([
  ['P2002', 'Review changed concurrently; retry'],
  ['P2003', 'User or game no longer available'],
])('converse %s em conflito sanitizado', async (code, message) => {
  const userId = randomUUID();
  const gameId = randomUUID();

  const databaseError = new Prisma.PrismaClientKnownRequestError(
    'Synthetic database error with internal details',
    { code, clientVersion: '7.10.0' },
  );

  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue({ id: userId }),
    },
    game: {
      findUnique: vi.fn().mockResolvedValue({ id: gameId }),
    },
    review: {
      upsert: vi.fn().mockRejectedValue(databaseError),
    },
  };

  const moduleFixture = await Test.createTestingModule({
    providers: [
      ReviewsService,
      { provide: PrismaService, useValue: prisma },
    ],
  }).compile();

  try {
    const reviews = moduleFixture.get(ReviewsService);

    await expect(
      reviews.save(userId, gameId, {
        rating: 3,
        body: 'Synthetic review.',
      }),
    ).rejects.toMatchObject({
      status: 409,
      message,
    });
  } finally {
    await moduleFixture.close();
  }
});
