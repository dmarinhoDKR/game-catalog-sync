import { BadRequestException } from "@nestjs/common";
import { ReviewBodyPipe } from "./review-body.pipe.js";

it('aceita notas de 1 a 5 e remove espaços das extremidades', () => {
  const pipe = new ReviewBodyPipe();

  expect(
    pipe.transform({ rating: 1, body: ' Synthetic review. ' }),
  ).toEqual({
    rating: 1,
    body: 'Synthetic review.',
  });

  expect(
    pipe.transform({ rating: 5, body: 'a'.repeat(2000) }),
  ).toEqual({
    rating: 5,
    body: 'a'.repeat(2000),
  });
});

it('rejeita campos extras, tipos inválidos e valores fora dos limites', () => {
  const pipe = new ReviewBodyPipe();

  for (const value of [
    undefined,
    null,
    [],
    {},
    { rating: 3 },
    { rating: '3', body: 'Review' },
    { rating: 1.5, body: 'Review' },
    { rating: 0, body: 'Review' },
    { rating: 6, body: 'Review' },
    { rating: NaN, body: 'Review' },
    { rating: 3, body: 123 },
    { rating: 3, body: '   ' },
    { rating: 3, body: 'a'.repeat(2001) },
    { rating: 3, body: 'Review', userId: 'another-user' },
  ]) {
    expect(() => pipe.transform(value)).toThrow(BadRequestException);
  }
});
