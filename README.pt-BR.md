# Game Catalog Sync

Projeto pessoal de aprendizado e portfólio de um backend para catálogo de jogos.

[English](README.md)

## Estado atual

Implementado e verificado localmente:

- NestJS e TypeScript usando ES modules.
- PostgreSQL 17.11 e Prisma 7.10.0, com migração inicial.
- Usuários separados para aplicação e migrações.
- Fixture e seed repetível com três jogos sintéticos.
- GET /games/:id: 200 para jogo existente, 404 para ausente
  e 400 para UUID inválido.
- Indisponibilidade do banco no catálogo: Prisma P1001 retorna 503.
- GET /health/live e GET /health/ready, com falha e recuperação
  verificadas manualmente.
- Um teste unitário e três testes HTTP com Vitest; readiness usa
  PostgreSQL real em banco isolado.
- Build e lint verificados.

Paginação, autenticação, avaliações, Redis, sincronização em background,
CI e deploy cloud ainda não foram implementados.
Testes HTTP automatizados do catálogo ainda estão pendentes.

## Ambiente local

Verificado no Ubuntu 24.04.4 via WSL, com Node.js 24.16.0 e npm 11.13.0.

As dependências estão registradas em `package-lock.json`.

## Configuração e execução

Na raiz do projeto:

```bash
npm ci
```

A aplicação requer PostgreSQL e DATABASE_URL.
O Compose disponibiliza o banco de desenvolvimento em 127.0.0.1:5436
e, pelo perfil test, o banco de testes em 127.0.0.1:5437.

A preparação dos usuários, schema e permissões ainda é manual.
Iniciar somente o Compose não conclui o setup.
As instruções completas dessa preparação ainda estão pendentes.

Variáveis locais usadas:

- POSTGRES_ADMIN_PASSWORD: senha administrativa do banco de desenvolvimento.
- DATABASE_URL: conexão da aplicação com o usuário limitado.
- MIGRATION_DATABASE_URL: conexão do usuário de migrações.
- SHADOW_DATABASE_URL: conexão com o banco shadow separado.
- POSTGRES_TEST_ADMIN_PASSWORD: senha administrativa do banco de testes.
- TEST_DATABASE_URL: conexão do usuário limitado de testes.
- TEST_MIGRATION_DATABASE_URL: conexão administrativa para migrações de teste.

Credenciais ficam no .env, ignorado pelo Git.
Nunca use a mesma URL para o banco principal e o shadow database.

O client gerado também é ignorado pelo Git. Após npm ci, gere-o:

```bash
npx --no-install prisma generate
```

A porta da API é 3000 por padrão; PORT permite alterá-la.
Confira se a porta está disponível:

```bash
ss -ltn 'sport = :3000'
```

Após preparar e iniciar o banco, inicie a API:

```bash
npm run start:dev
```

Com a API ativa, execute em outro terminal:

```bash
curl -i http://localhost:3000/health/live
curl -i http://localhost:3000/health/ready
```

Com o banco disponível, ambos retornam HTTP 200 e {"status":"ok"}.
Se a consulta ao banco falhar, readiness retorna 503;
liveness permanece independente dessa consulta.

Encerre a API com Ctrl+C.

## Verificação

```bash
npm test
npm run test:e2e
npm run build
npm run lint
```

Os testes e2e exigem db-test preparado e ativo.
Esse serviço usa tmpfs: dados, usuários e permissões precisam ser
recriados após parar o container. A preparação ainda é manual.

## Estrutura atual

- `src/health/`: endpoints de liveness e readiness do banco.
- `src/games/`: consulta de jogo por ID.
- `src/prisma/`: serviço e módulo de acesso ao banco.
- `src/app.module.ts`: módulo raiz.
- `src/main.ts`: ponto de entrada da aplicação.
- `prisma/`: schema, migrações, fixture e seed.
- `test/`: testes HTTP e validação do ambiente de testes.

O endpoint inicial `GET /` ainda retorna `Hello World!`.

## Limitações e próximas etapas

O projeto é destinado ao desenvolvimento local.
Autenticação e autorização ainda não foram implementadas.

Liveness não consulta dependências; readiness consulta PostgreSQL.
Na consulta de jogos, somente Prisma P1001 é convertido em HTTP 503.

A preparação dos bancos é manual. O setup a partir de um clone novo
ainda não foi completamente documentado ou verificado.
Testes HTTP automatizados do catálogo e testes automatizados
de falha e recuperação ainda estão pendentes.

Próximas etapas: testes do catálogo, paginação, autenticação e avaliações,
seguidos de sincronização em background e cache.
Busca, observabilidade e AWS ficam para depois.

## Assistência de IA

Implementei o projeto manualmente com orientação e sugestões de revisão
do Codex. Revisei o código e executei as verificações descritas neste
README. A revisão por IA não equivale a uma revisão independente.