import { Prisma } from "../generated/prisma/client.js";
import { isDatabaseUnavailable } from "./is-database-unavailable.js";

it('identifica conexão indisponível e encerramento administrativo', () => {
  const unreachable = new Prisma.PrismaClientKnownRequestError(
    'Synthetic connection failure',
    { code: 'P1001', clientVersion: '7.10.0' },
  );

  const shutdown = new Prisma.PrismaClientKnownRequestError(
    'Synthetic shutdown',
    {
      code: 'P2039',
      clientVersion: '7.10.0',
      meta: {
        driverAdapterError: {
          cause: { originalCode: '57P01' },
        },
      },
    },
  );

  expect(isDatabaseUnavailable(unreachable)).toBe(true);
  expect(isDatabaseUnavailable(shutdown)).toBe(true);
});

it('não classifica outros error como indisponibilidade', () => {
  const otherDatabaseError = new Prisma.PrismaClientKnownRequestError(
    'Synthetic check violation',
    {
      code: 'P2039',
      clientVersion: '7.10.0',
      meta: {
        driverAdapterError: {
          cause: { originalCode: '23514' },
        },
      },
    },
  );

  expect(isDatabaseUnavailable(otherDatabaseError)).toBe(false);
  expect(isDatabaseUnavailable(new Error('Unexpected failure'))).toBe(false);
  expect(isDatabaseUnavailable(null)).toBe(false);
});
