import { Prisma } from "../generated/prisma/client.js";

export function isDatabaseUnavailable(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  if (error.code === 'P1001') {
    return true;
  }

  const adapterError = error.meta?.driverAdapterError;

  const cause =
    typeof adapterError === 'object' &&
    adapterError !== null &&
    'cause' in adapterError
      ? adapterError.cause
      : undefined;

  return (
    error.code === 'P2039' &&
    typeof cause === 'object' &&
    cause !== null &&
    'originalCode' in cause &&
    cause.originalCode === '57P01'
  );
}
