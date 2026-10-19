import { hashPassword, verifyPassword } from "./password-hash.js";

it('gera hashes distintos para a mesma senha usando salts aleatórios', async () => {
    const password = "Synthetic test password";
    const first = await hashPassword(password);
    const second = await hashPassword(password);

    expect(first).not.toBe(second);
    expect(first).toMatch(
        /^scrypt\$131072\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$/,
    );
    expect(second).toMatch(
        /^scrypt\$131072\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$/,
    );

    await expect(hashPassword('a'.repeat(1025))).rejects.toThrow(RangeError);
});

it('verifica a senha exata e rejeita senha ou hash inválido', async () => {
    const password = ' Synthetic Password ';
    const hash = await hashPassword(password);

    expect(await verifyPassword(password, hash)).toBe(true);
    expect(await verifyPassword(password.trim(), hash)).toBe(false);
    expect(await verifyPassword(password.toLowerCase(), hash)).toBe(false);
    expect(await verifyPassword(password, 'invalid-hash')).toBe(false);
    expect(await verifyPassword('a'.repeat(1025), hash)).toBe(false);
});
