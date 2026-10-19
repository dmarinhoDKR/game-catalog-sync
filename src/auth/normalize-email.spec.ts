import { normalizeEmail } from './normalize-email.js';

it('normaliza email sem remover pontos ou sufixos', () => {
    expect(normalizeEmail(' Test.Example+demo@EXAMPLE.TEST '))
      .toBe('test.example+demo@example.test');
});
