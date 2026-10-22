import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import type { Review } from '../generated/prisma/client.js';
import { isDatabaseUnavailable } from '../prisma/is-database-unavailable.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ReviewInput } from './review-body.pipe.js';

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async save(
    userId: string,
    gameId: string,
    input: ReviewInput,
  ): Promise<Review> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });

      if (!user) {
        throw new UnauthorizedException('Invalid or missing token');
      }

      const game = await this.prisma.game.findUnique({
        where: { id: gameId },
        select: { id: true },
      });

      if (!game) {
        throw new NotFoundException('Game not found');
      }

      return await this.prisma.review.upsert({
        where: {
          userId_gameId: { userId, gameId },
        },
        create: {
          userId,
          gameId,
          rating: input.rating,
          body: input.body,
        },
        update: {
          rating: input.rating,
          body: input.body,
        },
      });
    } catch (error) {
      if (isDatabaseUnavailable(error)) {
        throw new ServiceUnavailableException('Database unavailable');
      }

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2003') {
          throw new ConflictException('User or game no longer available');
        }

        if (error.code === 'P2002') {
          throw new ConflictException('Review changed concurrently; retry');
        }
      }

      throw error;
    }
  }

  async remove(userId: string, gameId: string): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });

      if (!user) {
        throw new UnauthorizedException('Invalid or missing token');
      }

      await this.prisma.review.deleteMany({
        where: { userId, gameId },
      });
    } catch (error) {
      if (isDatabaseUnavailable(error)) {
        throw new ServiceUnavailableException('Database unavailable');
      }

      throw error;
    }
  }
}
