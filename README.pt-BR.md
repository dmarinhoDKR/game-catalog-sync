# Game Catalog Sync

Projeto pessoal de aprendizado e portfólio de um backend para catálogo de jogos.

[English](README.md)

## Evidências

### Testes de integração HTTP

Captura histórica: seis testes HTTP passaram, cobrindo os endpoints de saúde e as respostas
200, 400 e 404 do catálogo. Os cenários de banco usam PostgreSQL isolado.
Lint concluído sem avisos ou erros.

![Seis testes HTTP passando e lint sem erros](docs/images/http-tests.png)

### Plano da consulta de paginação por cursor

[SQL, preparação dos dados e plano observado](docs/pagination-explain.md).
Em 30/10/2026, uma consulta sobre 10 mil jogos sintéticos no banco de testes
isolado usou Game_pkey para a condição do cursor e a ordem crescente por ID,
sem Sort separado. LIMIT interrompeu a execução após 21 registros.
A execução observada registrou quatro shared-buffer hits e levou 0,035 ms.
Essa medição local isolada não é benchmark HTTP nem comprovação de latência em produção.
A proteção de tabela vazia acrescentada às instruções ainda não foi exercitada.

## Estado atual

Implementado e verificado localmente:

- NestJS e TypeScript usando ES modules.
- PostgreSQL 17.11 e Prisma 7.10.0, com quatro migrações de Game, User, Review e GameSource.
- Persistência de Review com uma avaliação por par usuário/jogo, constraint
  CHECK de nota entre 1 e 5 e chaves estrangeiras com ON DELETE RESTRICT.
  Testes verificam notas válidas, rejeição de notas inválidas e duplicidade,
  referências inexistentes e bloqueio de exclusão de usuário ou jogo referenciado.
- Persistência de GameSource com chave primária composta por provider/externalId,
  índice em gameId, armazenamento de contentHash e FK com ON DELETE RESTRICT.
  Teste com PostgreSQL verifica rejeição de identidade duplicada, mesmo ID externo
  em provedores diferentes, rejeição de jogo ausente e bloqueio de exclusão do jogo.
- CatalogImportService valida o lote e grava em uma transação Serializable:
  cria jogos e origens juntos, atualiza conteúdo alterado e ignora hashes iguais.
  Retorna contadores created/updated/unchanged/rejected. Teste com PostgreSQL verifica
  repetição sem regravação, atualização preservando IDs, preservação de jogos ausentes
  em lotes parciais, registros válidos/inválidos/duplicados misturados e rollback
  após falha de aplicação simulada.
- Validação da fonte sintética aceita provider synthetic/version 1 e até
  1.000 registros por lote. Registros inválidos e IDs externos duplicados contam
  como rejeitados; o primeiro registro válido de cada identidade é preservado.
- Jogos de origem rejeitam campos extras e valores inválidos, aplicam trim aos
  textos e gêneros e removem gêneros repetidos, ordenando-os. Hashes SHA-256 usam
  título, descrição e gêneros normalizados, sem a identidade externa.
- Nove testes unitários novos cobrem normalização e limites dos registros,
  validação e rejeições dos lotes e hashes estáveis que mudam com o conteúdo.
- Usuários separados para aplicação e migrações.
- Fixtures e seed repetível com três jogos sintéticos e dois usuários de demonstração.
- POST /auth/login com email normalizado, verificação de senha com scrypt,
  erro 401 genérico e JWT HS256 válido por 15 minutos.
- Login aceita somente email e password; resposta contém apenas access_token
  e inclui Cache-Control: no-store.
- Limite do login: cinco requisições por minuto por IP, com 429 e Retry-After;
  uma verificação de credenciais por vez por instância do serviço.
- Guard Bearer JWT registrado e exportado pelo AuthModule. Testes HTTP em
  rota exclusiva de teste aceitam token válido e retornam 401 para token
  ausente, malformado, expirado ou adulterado, identidade ou papel inválidos
  e emissor, destinatário ou algoritmo inesperados. O guard também protege
  a escrita de avaliações.
- AdminGuard consulta o papel atual no banco após autenticação JWT.
  Testes HTTP em rota exclusiva de teste cobrem 401 sem autenticação ou
  para usuário removido, 403 para USER, acesso ADMIN, rebaixamento com o
  mesmo token e 503 durante falha do banco, com recuperação posterior.
- API com escuta explicitamente restrita a 127.0.0.1.
- Swagger UI e JSON OpenAPI com teste HTTP do contrato gerado.
- GET /games com paginação por cursor UUID, ordem crescente por id,
  limite padrão 20 e máximo 100. Resposta com items e nextCursor.
- GET /games/:id: 200 para jogo existente, 404 para ausente
  e 400 para UUID inválido.
- PUT /games/:id/review cria ou atualiza a avaliação do usuário autenticado
  com HTTP 200, preservando o ID na atualização. userId vem somente do token;
  o corpo aceita apenas rating inteiro de 1 a 5 e body com trim e comprimento
  de 1 a 2000 unidades UTF-16. Testes HTTP confirmam rejeição de userId extra,
  avaliações independentes para dois usuários, 401 para usuário removido,
  404 para jogo ausente e 503 durante falha do banco, com gravação após recuperação.
- DELETE /games/:id/review remove somente a avaliação do usuário autenticado.
  Retorna 204 sem corpo, inclusive na repetição ou com jogo/avaliação ausente.
  userId enviado no corpo ou na query não escolhe o proprietário.
  Testes HTTP verificam 401 sem autenticação ou para usuário removido, 400
  para UUID inválido, preservação da avaliação alheia e 503 durante a parada,
  seguido de exclusão após recuperação com a mesma aplicação e token.
- Indisponibilidade do banco no catálogo: Prisma P1001 retorna 503.
- GET /health/live e GET /health/ready, com falha e recuperação
  verificadas manualmente.
- 24 testes unitários e 25 e2e na regressão completa de 14/11/2026, com PostgreSQL real em banco isolado
  nos cenários de banco. Cobrem paginação, constraints de User e Review, respostas HTTP
  do login, limite de requisições, verificação de token, rejeição de tokens
  expirados ou adulterados, falha/recuperação do banco e fechamento
  da conexão após app.close().
- Build e lint verificados.
- Duas chamadas simultâneas a ReviewsService.save com PostgreSQL real mantêm
  uma avaliação e um par completo de nota/texto de uma das entradas. Testes
  unitários separados simulam P2002/P2003 e verificam conflitos 409 sanitizados.

Endpoints administrativos, Redis, sincronização em background,
CI e deploy cloud ainda não foram implementados.

## Ambiente local

Reconstruído e verificado em 14/11/2026 com Ubuntu 24.04.5 via WSL 2,
Node.js 24.16.0 e npm 11.13.0. Docker Desktop 4.98.0, Engine 29.9.2 e
Compose 5.6.1 foram confirmados na preparação do ambiente.

As dependências estão registradas em `package-lock.json`.

## Configuração e execução

Na raiz do projeto:

```bash
npm ci
```

A aplicação requer PostgreSQL, DATABASE_URL e JWT_SECRET.
O Compose disponibiliza o banco de desenvolvimento em 127.0.0.1:5436
e, pelo perfil test, o banco de testes em 127.0.0.1:5437.

O provisionamento do banco de desenvolvimento é manual e está descrito abaixo.
Iniciar somente o Compose não cria as roles da aplicação nem suas permissões.

O banco de testes possui preparação automática, descrita em Verificação.

Variáveis locais usadas:

- POSTGRES_ADMIN_PASSWORD: senha administrativa do banco de desenvolvimento.
- DATABASE_URL: conexão da aplicação com o usuário limitado.
- MIGRATION_DATABASE_URL: conexão do usuário de migrações.
- SHADOW_DATABASE_URL: conexão com o banco shadow separado.
- JWT_SECRET: 64 caracteres hexadecimais minúsculos gerados a partir de
  32 bytes aleatórios; obrigatório na inicialização, sem valor padrão.
- DEMO_USER_PASSWORD: senha sintética de user@example.test (somente seed).
- DEMO_ADMIN_PASSWORD: senha sintética diferente de admin@example.test
  (somente seed). Cada senha exige pelo menos 15 caracteres e no máximo
  1024 bytes em UTF-8. Não use credenciais pessoais.
- POSTGRES_TEST_ADMIN_PASSWORD: senha administrativa do banco de testes.
- TEST_DATABASE_URL: conexão do usuário limitado de testes.
- TEST_MIGRATION_DATABASE_URL: conexão administrativa para migrações de teste.
- POSTGRES_TEST_APP_PASSWORD: senha original do usuário limitado de testes;
  deve corresponder à senha de TEST_DATABASE_URL, antes da codificação na URL.

Credenciais ficam no .env, ignorado pelo Git.
Nunca use a mesma URL para o banco principal e o shadow database.

### Ambiente local novo

Execute os comandos na raiz do projeto pelo Ubuntu/WSL após `npm ci`, com
Docker Desktop ativo e integração WSL habilitada. Em uma instalação existente,
preserve o `.env` e o banco; pule os passos de criação já concluídos.

Para um ambiente novo, crie todas as variáveis acima sem exibir segredos. O
script recusa sobrescrever `.env` e restringe suas permissões ao proprietário.
As senhas geradas são hexadecimais e dispensam codificação adicional nas URLs.
O Compose valida a variável administrativa de desenvolvimento mesmo quando
somente `db-test` é selecionado; configure todas antes de preparar os testes.
```bash
node --input-type=module <<'NODE'
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const secret = () => randomBytes(32).toString('hex');
const app = secret();
const migration = secret();
const testAdmin = secret();
const testApp = secret();
const values = {
  POSTGRES_ADMIN_PASSWORD: secret(),
  DATABASE_URL: `postgresql://game_catalog_app:${app}@127.0.0.1:5436/game_catalog?schema=catalog`,
  MIGRATION_DATABASE_URL: `postgresql://game_catalog_migrator:${migration}@127.0.0.1:5436/game_catalog?schema=catalog`,
  SHADOW_DATABASE_URL: `postgresql://game_catalog_migrator:${migration}@127.0.0.1:5436/game_catalog_shadow?schema=catalog`,
  JWT_SECRET: secret(),
  DEMO_USER_PASSWORD: secret(),
  DEMO_ADMIN_PASSWORD: secret(),
  POSTGRES_TEST_ADMIN_PASSWORD: testAdmin,
  POSTGRES_TEST_APP_PASSWORD: testApp,
  TEST_DATABASE_URL: `postgresql://game_catalog_test_app:${testApp}@127.0.0.1:5437/game_catalog_test?schema=catalog`,
  TEST_MIGRATION_DATABASE_URL: `postgresql://postgres:${testAdmin}@127.0.0.1:5437/game_catalog_test?schema=catalog`,
};
writeFileSync('.env', Object.entries(values)
  .map(([key, value]) => `${key}=${value}`).join('\n') + '\n',
  { flag: 'wx', mode: 0o600 });
console.log('.env created; secrets not displayed.');
NODE

git check-ignore .env
docker compose --profile test config --quiet
npx --no-install prisma generate --config prisma7.config.ts
```
A saída esperada do Git é `.env`; a validação do Compose não deve emitir mensagens.
Não publique `.env` nem compartilhe `docker compose config` sem `--quiet`,
pois a configuração expandida pode exibir senhas.

### Banco de desenvolvimento — somente na primeira inicialização

Use um volume novo de desenvolvimento. Não execute o provisionamento contra um
banco existente nem repita o script após erro sem conferir o estado.
Roles e schema são criados em uma transação; o shadow é criado separadamente.
Se a criação do shadow falhar, a transação anterior permanece confirmada.
Não remova um volume existente para resolver erro de inicialização.

A aplicação recebe uso do schema e permissões DML; `game_catalog_migrator`
é dono de `catalog` e do banco shadow separado. Nenhuma dessas roles é superuser
ou pode criar roles ou outros bancos. Os privilégios padrão se aplicam aos
objetos criados pela role de migrações. O script exige as senhas hexadecimais
de 64 caracteres geradas acima e envia SQL pela entrada padrão sem exibi-las.
```bash
docker compose up -d --wait db

node --input-type=module <<'NODE'
import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
const app = new URL(process.env.DATABASE_URL);
const migration = new URL(process.env.MIGRATION_DATABASE_URL);
const shadow = new URL(process.env.SHADOW_DATABASE_URL);
for (const url of [app, migration, shadow]) {
  assert.equal(url.protocol, 'postgresql:');
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.port, '5436');
  assert.equal(url.searchParams.get('schema'), 'catalog');
}
assert.equal(app.username, 'game_catalog_app');
assert.equal(migration.username, 'game_catalog_migrator');
assert.equal(shadow.username, migration.username);
assert.equal(app.pathname, '/game_catalog');
assert.equal(migration.pathname, '/game_catalog');
assert.equal(shadow.pathname, '/game_catalog_shadow');
assert.equal(shadow.password, migration.password);
const appPassword = decodeURIComponent(app.password);
const migrationPassword = decodeURIComponent(migration.password);
for (const password of [appPassword, migrationPassword]) {
  assert.match(password, /^[a-f0-9]{64}$/);
}
const sql = `
DO $$
BEGIN
  IF current_database() <> 'game_catalog' THEN
    RAISE EXCEPTION 'Unexpected development database';
  END IF;
END $$;
BEGIN;
CREATE ROLE game_catalog_app
  LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOREPLICATION NOBYPASSRLS PASSWORD '${appPassword}';
CREATE ROLE game_catalog_migrator
  LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOREPLICATION NOBYPASSRLS PASSWORD '${migrationPassword}';
CREATE SCHEMA catalog AUTHORIZATION game_catalog_migrator;
GRANT CONNECT ON DATABASE game_catalog
  TO game_catalog_app, game_catalog_migrator;
GRANT USAGE ON SCHEMA catalog TO game_catalog_app;
ALTER DEFAULT PRIVILEGES FOR ROLE game_catalog_migrator IN SCHEMA catalog
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO game_catalog_app;
ALTER DEFAULT PRIVILEGES FOR ROLE game_catalog_migrator IN SCHEMA catalog
  GRANT USAGE ON SEQUENCES TO game_catalog_app;
COMMIT;
CREATE DATABASE game_catalog_shadow OWNER game_catalog_migrator;
`;
const result = spawnSync('docker', [
  'compose', 'exec', '-T', 'db',
  'psql', '-X', '-U', 'postgres', '-d', 'game_catalog',
  '-v', 'ON_ERROR_STOP=1',
], { input: sql, encoding: 'utf8' });
if (result.error) throw result.error;
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
if (result.status !== 0) process.exit(result.status ?? 1);
console.log('Roles, schema, privileges and shadow database prepared.');
NODE
```
Após o provisionamento bem-sucedido, aplique e confira as migrações:

```bash
npx --no-install prisma migrate deploy --config prisma7.config.ts
npx --no-install prisma migrate status --config prisma7.config.ts
```

Esperado: `game_catalog` em `127.0.0.1:5436` e quatro migrações aplicadas.
O shadow foi criado na reconstrução; seu uso por `prisma migrate dev` ainda
não foi exercitado. `migrate deploy` não utiliza esse banco.

Após preparar o banco de desenvolvimento e aplicar as quatro migrações,
configure as senhas de demonstração e execute:

```bash
npm run build
node prisma/seed.mjs
```

O seed confere a identidade do banco da aplicação e cria
user@example.test (USER) e admin@example.test (ADMIN) com hashes scrypt.
Repetições preservam jogos, senhas e papéis existentes. Alterar uma senha
do seed no .env não rotaciona a credencial armazenada; a verificação falha
se a senha configurada ou o papel esperado divergir do registro persistido.

A API escuta em 127.0.0.1, na porta 3000 por padrão; PORT permite alterar a porta.
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

### Documentação da API

Com a API ativa, abra o [Swagger UI](http://127.0.0.1:3000/docs/).
O contrato está disponível como [JSON OpenAPI](http://127.0.0.1:3000/docs-json).
Use a porta configurada em PORT nas duas URLs caso seja diferente de 3000.

O documento descreve a entrada do login e a resposta com token, paginação opcional,
esquemas de resposta de jogos e avaliações, verificações de saúde e status de erro.
PUT e DELETE de avaliações declaram autenticação Bearer JWT. A autorização não
persiste ao recarregar a página; a validação externa de esquemas está desativada.
As respostas de erro têm descrições, sem esquemas completos dos corpos.

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

A regressão completa de 14/11/2026 aprovou **24 testes unitários em 12 arquivos**
e **25 testes e2e em 15 arquivos**, incluindo GameSource, parsers/hashes,
importador transacional, OpenAPI e cenários de falha/recuperação do banco.
Geração do Prisma Client, build e lint passaram; lint sem avisos ou erros.
As quatro migrações foram aplicadas em bancos novos de teste e desenvolvimento.
O seed de desenvolvimento verificou três jogos e dois usuários de demonstração.
Chamadas manuais a /health/live, /health/ready e /games retornaram HTTP 200;
o catálogo retornou os três jogos do seed e o Swagger abriu corretamente.
Os resultados são de um ambiente local reconstruído com dados sintéticos novos,
não de restauração do banco anterior ou de deploy em produção.

A captura acima e as medições de paginação permanecem como evidência histórica.
Para verificar somente parsers e hash:

```bash
npm test -- src/sync/parse-source-game.spec.ts src/sync/parse-source-batch.spec.ts src/sync/source-game-hash.spec.ts
```
Em 14/11/2026, npm audit reportou zero vulnerabilidades após atualização do
lockfile sem --force para Nest CLI/schematics 12.0.13 e minimatch 11.0.5.
É uma verificação pontual de dependências, não uma garantia de segurança geral.

O novo teste de integração da importação passou separadamente após cada cenário;
o build passou para o serviço e o lint passou após a última alteração do teste.
O rollback usa falha simulada na função de hash após a primeira gravação,
com conferência do estado real no PostgreSQL após rollback. Não simula parada do banco.
Para executá-lo separadamente:

```bash
npm run test:e2e -- test/catalog-import.e2e-spec.ts
```

Para executar o teste de GameSource separadamente:

```bash
npm run test:e2e -- test/game-source-persistence.e2e-spec.ts
```

O teste do contrato verifica paginação, esquemas de jogo iguais, exigência de Bearer
na escrita de avaliações, entrada de avaliação, DELETE 204 sem corpo e esquemas de saúde.
Ele verifica o documento gerado, sem comparar todas as respostas em execução
com esse documento. Para executá-lo separadamente:

```bash
npm run test:e2e -- test/openapi.e2e-spec.ts
```

Os testes de falha/recuperação recriam somente
db-test e reaplicam as migrações disponíveis. O setup e2e gera um segredo JWT
temporário em vez de usar o segredo de desenvolvimento.

## Estrutura atual

- `src/health/`: endpoints de liveness e readiness do banco.
- `src/games/`: consulta por ID, listagem paginada e validação do limite.
- `src/auth/`: controller de login, validação, hash de senha, opções JWT
  e serviço de autenticação, além dos guards Bearer JWT e administrativo.
- `src/reviews/`: controller PUT/DELETE autenticado, validação, serviço e módulo.
- `src/sync/`: validação, hash do conteúdo normalizado e serviço de importação transacional.
- `src/prisma/`: serviço, módulo e classificador de erros de indisponibilidade.
- `src/app.module.ts`: módulo raiz.
- `src/main.ts`: ponto de entrada da aplicação.
- `src/openapi.ts`: configuração compartilhada do Swagger e OpenAPI.
- `prisma/`: schema, migrações, fixtures sintéticas e seed.
- `test/`: testes de integração HTTP e de serviço e validação do ambiente.

O endpoint inicial `GET /` ainda retorna `Hello World!`.

## Limitações e próximas etapas

O projeto é destinado ao desenvolvimento local.
A criação, atualização e exclusão de avaliações estão integradas à aplicação
e testadas por HTTP com isolamento entre usuários.
Chamadas simultâneas ao serviço foram testadas com PostgreSQL, mas o teste não
força a ordem no banco nem garante que ocorra um conflito. A conversão de
P2002/P2003 em 409 foi coberta por erros simulados; uma corrida real que produza
esses erros, remoção de referências durante a escrita e contrato HTTP de 409
continuam sem comprovação. Não é teste de concorrência HTTP nem de carga.
Erros inesperados são relançados.
As consultas GET do catálogo e os endpoints de saúde continuam públicos.
O PUT e o DELETE de avaliação exigem token Bearer. JwtAuthGuard valida as claims sem
consultar o banco; ReviewsService verifica a existência do usuário antes
da escrita. AdminGuard consulta existência e papel atual, mas continua
aplicado somente em rota de teste.
O teste de falha/recuperação administrativa confirma 503 durante a parada
e 401 após a restauração para usuário removido; não demonstra uma operação
administrativa bem-sucedida após a recuperação.
Refresh tokens e revogação não foram implementados.
O contador do limite de requisições fica na memória de cada processo e
reinicia com a aplicação; não é compartilhado entre instâncias.
A liberação após o intervalo e o isolamento entre diferentes IPs
ainda não foram testados.

Liveness não consulta dependências; readiness consulta PostgreSQL.
Na consulta de jogos, somente Prisma P1001 é convertido em HTTP 503.
O serviço de autenticação também converte o encerramento administrativo
de conexão observado como P2039/57P01 em 503. Falha e recuperação da
autenticação foram testadas no serviço; a resposta HTTP do login durante
indisponibilidade ainda não foi testada separadamente.

O provisionamento de desenvolvimento permanece manual. Clone novo, credenciais,
roles, migrações, seed, saúde/catálogo e Swagger foram verificados em 14/11/2026.
As instruções consolidadas acima documentam esse processo; ainda não foram
reexecutadas literalmente como um único roteiro completo. O login de desenvolvimento
não foi conferido manualmente na reconstrução; autenticação passou nos e2e isolados.
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

A validação do lote limita a quantidade de registros, sem limitar o tamanho do JSON.
Comprimentos dos textos usam UTF-16: IDs externos têm 1-100 letras ASCII minúsculas,
dígitos ou hífens, começando por letra ou dígito; títulos 1-200, descrições 1-10.000
e 1-20 gêneros de 1-50 unidades cada após trim.
A fixture catalog-v1 é separada do seed; sua validação não realiza importação.

O importador é exercitado por testes de integração do serviço; ainda não está
registrado em módulo da aplicação nem exposto por HTTP ou worker.
O timeout da transação é de 30 segundos, sem garantia de vazão para 1.000 registros.
Importações concorrentes, retries de serialização, falha/recuperação do banco
e rollback por erro real do banco ainda não foram testados. Erros são propagados.
O serviço não associa jogos existentes do seed pela igualdade do título.

Próximas etapas: sincronização com Redis/BullMQ, endpoints administrativos e cache.
Os esquemas completos dos erros permanecem uma pendência de documentação.
Busca, observabilidade e AWS ficam para depois.

## Assistência de IA

Implementei o projeto manualmente com orientação e sugestões de revisão
do Codex. Revisei o código e executei as verificações descritas neste
README. A revisão por IA não equivale a uma revisão independente.
