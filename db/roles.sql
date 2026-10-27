-- Two login roles, both without superuser rights:
--   chat_app      owns the rag schema (writes embeddings, runs retrieval)
--   chat_readonly runs model-generated SQL; it can only SELECT from shop
-- Passwords come in as psql variables so they never live in this file.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

CREATE ROLE chat_app LOGIN PASSWORD :'app_password';
ALTER SCHEMA rag OWNER TO chat_app;
ALTER TABLE rag.documents OWNER TO chat_app;

CREATE ROLE chat_readonly LOGIN PASSWORD :'readonly_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT CONNECTION LIMIT 20;
GRANT USAGE ON SCHEMA shop TO chat_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA shop TO chat_readonly;
ALTER ROLE chat_readonly SET default_transaction_read_only = on;
ALTER ROLE chat_readonly SET statement_timeout = '5s';
ALTER ROLE chat_readonly SET idle_in_transaction_session_timeout = '10s';
ALTER ROLE chat_readonly SET search_path = shop;
