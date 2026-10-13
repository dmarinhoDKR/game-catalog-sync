import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { GamesController } from './games.controller.js';
import { GamesService } from './games.service.js';

@Module({
    imports: [PrismaModule],
    controllers: [GamesController],
    providers: [GamesService],
})
export class GamesModule {}
