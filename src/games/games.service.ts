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
}
