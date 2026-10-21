import {
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';

export interface ReviewInput {
  rating: number;
  body: string;
}

@Injectable()
export class ReviewBodyPipe implements PipeTransform<unknown, ReviewInput> {
  transform(value: unknown): ReviewInput {
    if (
      typeof value !== 'object' ||
      value === null ||
      Array.isArray(value) ||
      Object.keys(value).length !== 2 ||
      !('rating' in value) ||
      !('body' in value) ||
      typeof value.rating !== 'number' ||
      typeof value.body !== 'string'
    ) {
      throw new BadRequestException('Invalid review input');
    }

    const rating = value.rating;
    const body = value.body.trim();

    if (
      !Number.isInteger(rating) ||
      rating < 1 ||
      rating > 5 ||
      body.length === 0 ||
      body.length > 2000
    ) {
      throw new BadRequestException('Invalid review input');
    }

    return { rating, body };
  }
}
