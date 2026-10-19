import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

export async function hashPassword(password: string): Promise<string> {
    if (Buffer.byteLength(password, 'utf8') > 1024) {
        throw new RangeError('Password is too long');
    }

    const salt = randomBytes(16);
    const options = {
      N: 131072,
      r: 8,
      p: 1,
      maxmem: 256 * 1024 * 1024,
    };

    const key = await new Promise<Buffer>((resolve, reject) => {
        scrypt(password, salt, 64, options, (error, derivedKey) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(derivedKey);
        });
    });

    return [
        'scrypt',
        options.N,
        options.r,
        options.p,
        salt.toString('hex'),
        key.toString('hex'),
    ].join('$');
}

export async function verifyPassword(
    password: string,
    storedHash: string,
): Promise<boolean> {
    if (Buffer.byteLength(password, 'utf8') > 1024) {
      return false;
    }

    const match = storedHash.match(
        /^scrypt\$131072\$8\$1\$([a-f0-9]{32})\$([a-f0-9]{128})$/,
    );

    if (!match) {
        return false;
    }

    const salt = Buffer.from(match[1], 'hex');
    const expected = Buffer.from(match[2], 'hex');

    const actual = await new Promise<Buffer>((resolve, reject) => {
        scrypt(
          password,
          salt,
          64,
          {
            N: 131072,
            r: 8,
            p: 1,
            maxmem: 256 * 1024 * 1024,
          },
          (error, derivedKey) => {
            if (error) {
              reject(error);
              return;
            }

            resolve(derivedKey);
          },
        );
    });

    return timingSafeEqual(actual, expected);
}
