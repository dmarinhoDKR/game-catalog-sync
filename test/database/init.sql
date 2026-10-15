\set ON_ERROR_STOP on

DO $$
BEGIN
  IF current_database() <> 'game_catalog_test' THEN
    RAISE EXCEPTION 'Inicialização permitida apenas no banco de testes';
  END IF;
END
$$;

\getenv app_password POSTGRES_TEST_APP_PASSWORD

BEGIN;

CREATE ROLE game_catalog_test_app
  LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOREPLICATION NOBYPASSRLS
  PASSWORD :'app_password';

CREATE SCHEMA catalog AUTHORIZATION postgres;

GRANT CONNECT ON DATABASE game_catalog_test
  TO game_catalog_test_app;

GRANT USAGE ON SCHEMA catalog TO game_catalog_test_app;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA catalog
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES
TO game_catalog_test_app;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA catalog
GRANT USAGE ON SEQUENCES TO game_catalog_test_app;

COMMIT;
