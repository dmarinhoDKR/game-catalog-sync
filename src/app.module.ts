import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module.js';
import { GamesModule } from './games/games.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';

@Module({
  imports: [HealthModule, GamesModule, AuthModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
