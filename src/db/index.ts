import pg from "pg";

const { Pool } = pg;

let pool: pg.Pool | null = null;

function buildPoolConfig(): pg.PoolConfig {
  // Prefer DATABASE_URL when set — mirrors cgov-api so both services can
  // share one secret (and one connection string format, including the
  // Cloud SQL Unix-socket form host=/cloudsql/PROJECT:REGION:INSTANCE).
  const url = process.env.DATABASE_URL;
  if (url && url.length > 0) {
    return { connectionString: url };
  }

  return {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432", 10),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  };
}

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool(buildPoolConfig());
  }
  return pool;
}

// Postgres SQLSTATE 42P01: "undefined_table". Surfaces when the connected
// database has no `proposal` (or other governance) table — almost always a
// misconfigured DB_NAME / DATABASE_URL or unmigrated database.
const UNDEFINED_TABLE = "42P01";

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  const client = await getPool().connect();
  try {
    // Set session to read-only for safety
    await client.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
    const result = await client.query<T>(text, params);
    return result;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === UNDEFINED_TABLE
    ) {
      const original = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Governance database is unmigrated or misconfigured ` +
          `(missing table: ${original}). ` +
          `Check DATABASE_URL / DB_NAME points at the cgov-api database, ` +
          `and that migrations have been applied. See GET /health for status.`
      );
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export interface DbHealth {
  ok: boolean;
  connected: boolean;
  schemaReady: boolean;
  message: string;
}

// Probe the connection and confirm the governance schema is present.
// Used at boot to surface misconfiguration loudly instead of letting
// every tool call fail with a raw "relation does not exist".
export async function checkDbHealth(): Promise<DbHealth> {
  try {
    const result = await query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'proposal'
       ) AS exists`
    );
    const schemaReady = result.rows[0]?.exists === true;
    return {
      ok: schemaReady,
      connected: true,
      schemaReady,
      message: schemaReady
        ? "database connected and schema present"
        : "database connected but `proposal` table is missing — wrong DB or migrations not applied",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      connected: false,
      schemaReady: false,
      message: `database probe failed: ${message}`,
    };
  }
}
