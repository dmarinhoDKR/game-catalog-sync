import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { GamesService } from './games.service.js';
import type { Game } from '../generated/prisma/client.js';

@Controller('games')
export class GamesController {
    constructor(private readonly gamesService: GamesService) {}

    @Get(':id')
    findById(
        @Param('id', new ParseUUIDPipe()) id: string,
    ): Promise<Game> {
        return this.gamesService.findById(id);
    }
}
