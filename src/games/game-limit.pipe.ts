import {
    BadRequestException,
    Injectable,
    PipeTransform,
} from '@nestjs/common';

@Injectable()
export class GameLimitPipe implements PipeTransform<unknown, number> {
    transform(value: unknown): number {
        if (value === undefined) {
            return 20;
        }

        if (typeof value !== 'string' || !/^[0-9]+$/.test(value)) {
            throw new BadRequestException('limit must be an integer from 1 to 100');
        }

        const limit = Number(value);

        if (limit < 1 || limit > 100) {
            throw new BadRequestException('limit must be an integer from 1 to 100');
        }

        return limit;
    }
}
