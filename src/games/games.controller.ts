import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { GameLimitPipe } from './game-limit.pipe.js';
import { GamesService } from './games.service.js';
import type { Game } from '../generated/prisma/client.js';

@Controller('games')
export class GamesController {
    constructor(private readonly gamesService: GamesService) {}

    @Get()
    findPage(
        @Query('limit', GameLimitPipe) limit: number,
        @Query('cursor', new ParseUUIDPipe({ optional: true }))
        cursor?: string,
    ): Promise<{ items: Game[]; nextCursor: string | null }> {
        return this.gamesService.findPage(limit, cursor);
    }

    @Get(':id')
    findById(
        @Param('id', new ParseUUIDPipe()) id: string,
    ): Promise<Game> {
        return this.gamesService.findById(id);
    }
}
