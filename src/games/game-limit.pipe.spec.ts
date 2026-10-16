import { BadRequestException } from '@nestjs/common';
import { GameLimitPipe } from './game-limit.pipe.js';

it('valida o limite da paginação e aplica o padrão', () => {
    const pipe = new GameLimitPipe();

    expect(pipe.transform(undefined)).toBe(20);
    expect(pipe.transform('1')).toBe(1);
    expect(pipe.transform('100')).toBe(100);

    for (const value of ['', '0', '101', '-1', '1.5', 'abc', ['20']]) {
        expect(() => pipe.transform(value)).toThrow(BadRequestException);
    }
});
