import { BadRequestException } from "@nestjs/common";
import { LoginBodyPipe } from "./login-body.pipe.js";

it('normalize email e preserva a senha exata', () => {
  const pipe = new LoginBodyPipe();

  expect(
    pipe.transform({
      email: ' User@EXAMPLE.TEST ',
      password: ' Synthetic Password ',
    }),
  ).toEqual({
    email: 'user@example.test',
    password: ' Synthetic Password ',
  });
});

it('rejeita corpo inválido, campos extras e senha acima do limite', () => {
  const pipe = new LoginBodyPipe();

  for (const value of [
    undefined,
    null,
    [],
    {},
    { email: 'user@example.test' },
    { email: 123, password: 'test' },
    { email: 'invalid', password: 'test' },
    { email: 'user@example.test', password: 123 },
    { email: 'user@example.test', password: '' },
    { email: 'user@example.test', password: 'á'.repeat(513) },
    { email: 'user@example.test', password: 'test', role: 'ADMIN' },
  ]) {
    expect(() => pipe.transform(value)).toThrow(BadRequestException);
  }
});
