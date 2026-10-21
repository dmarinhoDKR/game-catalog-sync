import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module.js';
import { GamesModule } from './games/games.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { ReviewsModule } from './reviews/reviews.module.js';

@Module({
  imports: [HealthModule, GamesModule, AuthModule, ReviewsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
