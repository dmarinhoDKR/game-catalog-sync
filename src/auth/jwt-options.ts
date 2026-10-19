import type { JwtModuleOptions } from "@nestjs/jwt";

export function createJwtOptions(
  secret: string | undefined,
): JwtModuleOptions {
  if (!secret || !/^[a-f0-9]{64}$/.test(secret)) {
    throw new Error('JWT_SECRET deve conter 64 caracteres hexadecimais');
  }

  return {
    secret,
    signOptions: {
      algorithm: 'HS256',
      expiresIn: 900,
      issuer: 'game-catalog-sync',
      audience: 'game-catalog-api',
    },
    verifyOptions: {
      algorithms: ['HS256'],
      issuer: 'game-catalog-sync',
      audience: 'game-catalog-api',
    },
  };
}
