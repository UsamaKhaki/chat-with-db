import { Pool } from "pg";

// Defaults match docker-compose.yml so `npm run db:up` is enough locally.
export function readonlyPool(): Pool {
  return new Pool({
    connectionString:
      process.env.READONLY_DATABASE_URL ??
      "postgres://chat_readonly:chat_readonly_local@localhost:5443/chat_with_db",
  });
}

export function appPool(): Pool {
  return new Pool({
    connectionString:
      process.env.DATABASE_URL ??
      "postgres://chat_app:chat_app_local@localhost:5443/chat_with_db",
  });
}
