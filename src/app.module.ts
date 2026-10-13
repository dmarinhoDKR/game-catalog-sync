import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module.js';
import { GamesModule } from './games/games.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

@Module({
  imports: [HealthModule, GamesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
