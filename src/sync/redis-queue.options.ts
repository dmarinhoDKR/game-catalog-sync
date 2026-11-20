import type { RedisOptions } from 'ioredis';

export const CATALOG_QUEUE_PREFIX = 'catalog-sync';

export function redisQueueOptions(
  connectionString: string | undefined,
  role: 'producer' | 'worker',
): RedisOptions {
  let password: string;

  try {
    const url = new URL(connectionString ?? '');

    if (
      url.protocol !== 'redis:' ||
      url.hostname !== '127.0.0.1' ||
      url.port !== '6380' ||
      url.username !== 'catalog_queue' ||
      url.pathname !== '/0' ||
      url.search !== '' ||
      url.hash !== '' ||
      !/^[a-f0-9]{64}$/.test(url.password)
    ) {
      throw new Error();
    }

    password = url.password;
  } catch {
    throw new Error('Invalid local Redis queue configuration');
  }

  const common: RedisOptions = {
    host: '127.0.0.1',
    port: 6380,
    username: 'catalog_queue',
    password,
    db: 0,
    lazyConnect: true,
    connectTimeout: 3000,
    retryStrategy: times => Math.min(times * 200, 2000),
  };

  if (role === 'producer') {
    return {
      ...common,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      commandTimeout: 3000,
      autoResendUnfulfilledCommands: false,
    };
  }

  return {
    ...common,
    enableOfflineQueue: true,
    maxRetriesPerRequest: null,
  };
}
