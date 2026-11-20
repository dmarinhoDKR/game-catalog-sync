import { redisQueueOptions } from './redis-queue.options.js';

const password = 'a'.repeat(64);
const validUrl =
  `redis://catalog_queue:${password}@127.0.0.1:6380/0`;

it('aceita o destino local esperado sem configurar keyPrefix', () => {
  const options = redisQueueOptions(validUrl, 'producer');

  expect(options).toMatchObject({
    host: '127.0.0.1',
    port: 6380,
    username: 'catalog_queue',
    password,
    db: 0,
    lazyConnect: true,
  });
  expect(options).not.toHaveProperty('keyPrefix');
});

it('rejeita destinos e opções inesperados com erro sanitizado', () => {
  const invalidUrls = [
    undefined,
    '',
    'invalid-url',
    validUrl.replace('redis:', 'http:'),
    validUrl.replace('127.0.0.1', 'example.com'),
    validUrl.replace(':6380/', ':6379/'),
    validUrl.replace('catalog_queue:', 'default:'),
    validUrl.replace('/0', '/1'),
    validUrl.replace(password, 'short-password'),
    `${validUrl}?host=example.com`,
    `${validUrl}#fragment`,
  ];

  for (const url of invalidUrls) {
    expect(() => redisQueueOptions(url, 'producer'))
      .toThrow('Invalid local Redis queue configuration');
  }
});

it('configura o produtor para não acumular comandos desconectado', () => {
  const options = redisQueueOptions(validUrl, 'producer');

  expect(options.enableOfflineQueue).toBe(false);
  expect(options.maxRetriesPerRequest).toBe(1);
  expect(options.commandTimeout).toBe(3000);
  expect(options.autoResendUnfulfilledCommands).toBe(false);
});

it('configura o worker para aguardar reconexão sem timeout geral de comandos', () => {
  const options = redisQueueOptions(validUrl, 'worker');

  expect(options.enableOfflineQueue).toBe(true);
  expect(options.maxRetriesPerRequest).toBeNull();
  expect(options.commandTimeout).toBeUndefined();
  expect(options.retryStrategy).toBeTypeOf('function');
});
