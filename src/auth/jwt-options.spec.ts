import { createJwtOptions } from './jwt-options.js';

it('rejeita segredo ausente ou em formato inválido', () => {
  for (const secret of [
    undefined,
    '',
    'short',
    'a'.repeat(63),
    'g'.repeat(64),
  ]) {
    expect(() => createJwtOptions(secret)).toThrow(
      'JWT_SECRET deve conter 64 caracteres hexadecimais',
    );
  }
});

it('configura expiração, algoritmo, emissor e destinatário', () => {
  const options = createJwtOptions('ab'.repeat(32));

  expect(options.signOptions).toEqual({
    algorithm: 'HS256',
    expiresIn: 900,
    issuer: 'game-catalog-sync',
    audience: 'game-catalog-api',
  });

  expect(options.verifyOptions).toEqual({
    algorithms: ['HS256'],
    issuer: 'game-catalog-sync',
    audience: 'game-catalog-api',
  });
});
