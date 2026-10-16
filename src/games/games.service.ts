import {
    Injectable,
    NotFoundException,
    ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { Game } from '../generated/prisma/client.js';

@Injectable()
export class GamesService {
    constructor(private readonly prisma: PrismaService) {}

    async findById(id: string): Promise<Game> {
        let game: Game | null;

        try {
            game = await this.prisma.game.findUnique({
            where: { id },
        });
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P1001'
            ) {
                throw new ServiceUnavailableException('Database unavailable');
            }

            throw error;
        }

        if (!game) {
            throw new NotFoundException(`Game not found`);
        }

        return game;
    }

    async findPage(
        limit: number,
        cursor?: string,
    ): Promise<{ items: Game[]; nextCursor: string | null }> {
        let games: Game[];

        try {
            games = await this.prisma.game.findMany({
                where: cursor ? { id: { gt: cursor } } : undefined,
                orderBy: { id: 'asc' },
                take: limit + 1,
            });
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P1001'
            ) {
                throw new ServiceUnavailableException('Database unavailable');
            }

            throw error;
        }

        const hasMore = games.length > limit;
        const items = games.slice(0, limit);

        return {
            items,
            nextCursor: hasMore ? items[items.length - 1].id : null,
        };
    }
}
