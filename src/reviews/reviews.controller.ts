import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Put,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Review } from '../generated/prisma/client.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard.js';
import { ReviewBodyPipe } from './review-body.pipe.js';
import type { ReviewInput } from './review-body.pipe.js';
import { ReviewsService } from './reviews.service.js';

@Controller('games')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Put(':id/review')
  @UseGuards(JwtAuthGuard)
  save(
    @Param('id', new ParseUUIDPipe()) gameId: string,
    @Body(ReviewBodyPipe) input: ReviewInput,
    @Req() request: AuthenticatedRequest,
  ): Promise<Review> {
    if (!request.auth) {
      throw new UnauthorizedException('Invalid or missing token');
    }

    return this.reviewsService.save(
      request.auth.userId,
      gameId,
      input,
    );
  }
}
