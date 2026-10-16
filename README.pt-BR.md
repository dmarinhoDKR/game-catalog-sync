# Game Catalog Sync

Projeto pessoal de aprendizado e portfólio de um backend para catálogo de jogos.

[English](README.md)

## Evidências

### Testes de integração HTTP

Seis testes HTTP passaram, cobrindo os endpoints de saúde e as respostas
200, 400 e 404 do catálogo. Os cenários de banco usam PostgreSQL isolado.
Lint concluído sem avisos ou erros.

![Seis testes HTTP passando e lint sem erros](docs/images/http-tests.png)

## Estado atual

Implementado e verificado localmente:

- NestJS e TypeScript usando ES modules.
- PostgreSQL 17.11 e Prisma 7.10.0, com migração inicial.
- Usuários separados para aplicação e migrações.
- Fixture e seed repetível com três jogos sintéticos.
- GET /games com paginação por cursor UUID, ordem crescente por id,
  limite padrão 20 e máximo 100. Resposta com items e nextCursor.
- GET /games/:id: 200 para jogo existente, 404 para ausente
  e 400 para UUID inválido.
- Indisponibilidade do banco no catálogo: Prisma P1001 retorna 503.
- GET /health/live e GET /health/ready, com falha e recuperação
  verificadas manualmente.
- Testes unitários do controller inicial e do limite de paginação.
- Onze testes e2e com PostgreSQL real em banco isolado, incluindo
  paginação, parâmetros inválidos, falha/recuperação e fechamento
  da conexão após app.close().
- Build e lint verificados.

Autenticação, avaliações, Redis, sincronização em background,
CI e deploy cloud ainda não foram implementados.

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

A preparação dos usuários, schema e permissões do banco de desenvolvimento
ainda é manual. Iniciar somente o Compose não conclui esse setup.
As instruções completas dessa preparação ainda estão pendentes.

O banco de testes possui preparação automática, descrita em Verificação.

Variáveis locais usadas:

- POSTGRES_ADMIN_PASSWORD: senha administrativa do banco de desenvolvimento.
- DATABASE_URL: conexão da aplicação com o usuário limitado.
- MIGRATION_DATABASE_URL: conexão do usuário de migrações.
- SHADOW_DATABASE_URL: conexão com o banco shadow separado.
- POSTGRES_TEST_ADMIN_PASSWORD: senha administrativa do banco de testes.
- TEST_DATABASE_URL: conexão do usuário limitado de testes.
- TEST_MIGRATION_DATABASE_URL: conexão administrativa para migrações de teste.
- POSTGRES_TEST_APP_PASSWORD: senha original do usuário limitado de testes;
  deve corresponder à senha de TEST_DATABASE_URL, antes da codificação na URL.

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

Com as variáveis de teste configuradas no .env, execute:

```bash
npm run test:db:prepare
npm test
npm run test:e2e
npm run build
npm run lint
```

A preparação inicia somente db-test, cria o usuário limitado, schema
e permissões na inicialização de um banco vazio e aplica as migrações.

db-test usa tmpfs e perde seus dados ao parar. Execute novamente
npm run test:db:prepare antes dos testes após cada parada.

O ciclo de parada, preparação e execução dos seis testes foi validado
sem SQL manual e sem alterar o banco de desenvolvimento.

## Estrutura atual

- `src/health/`: endpoints de liveness e readiness do banco.
- `src/games/`: consulta por ID, listagem paginada e validação do limite.
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

A preparação do banco de desenvolvimento ainda é manual. O setup a partir de um clone novo
ainda não foi completamente documentado ou verificado.
O teste de falha e recuperação interrompe e recria somente db-test.
Ele descarta os dados desse banco e não deve executar simultaneamente
com outras suítes que dependam da mesma instância.

O encerramento explícito por app.close() foi verificado.
O encerramento por sinais do sistema, como Ctrl+C, ainda não foi validado.
Os arquivos e2e são executados sem paralelismo entre si.

O cursor é um UUID usado como limite exclusivo: id > cursor.
Um UUID válido não precisa corresponder a um jogo existente.
A paginação não mantém um snapshot entre requisições; a ausência
de repetição foi verificada em dataset estável.

Próximas etapas: autenticação e avaliações, seguidas de sincronização
em background e cache.
Busca, observabilidade e AWS ficam para depois.

## Assistência de IA

Implementei o projeto manualmente com orientação e sugestões de revisão
do Codex. Revisei o código e executei as verificações descritas neste
README. A revisão por IA não equivale a uma revisão independente.
