import { Pool } from "pg";
import { getEnv } from "./env";

// One pool per role, reused across requests. In development Next.js reloads
// modules on change, so the pools live on globalThis to avoid leaking
// connections on every edit.
const globalPools = globalThis as typeof globalThis & {
  chatWithDbPools?: { app: Pool; readonly: Pool };
};

function pools() {
  if (!globalPools.chatWithDbPools) {
    const env = getEnv();
    globalPools.chatWithDbPools = {
      app: new Pool({ connectionString: env.DATABASE_URL, max: 5 }),
      readonly: new Pool({
        connectionString: env.READONLY_DATABASE_URL,
        max: 10,
      }),
    };
  }
  return globalPools.chatWithDbPools;
}

/** chat_app role: retrieval store (rag schema) only. */
export function getAppPool(): Pool {
  return pools().app;
}

/** chat_readonly role: runs model-generated SQL against the shop schema. */
export function getReadonlyPool(): Pool {
  return pools().readonly;
}
