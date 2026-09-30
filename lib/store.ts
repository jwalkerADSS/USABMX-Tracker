import 'server-only';
import postgres from 'postgres';

// Account storage: a Postgres database from Vercel's Storage tab (Neon). Connecting the database to the
// project sets DATABASE_URL. Everything lives in one key/value table, created on first use.
// AUTH_STORE=memory keeps everything in this process instead, for local testing only (ignored on Vercel).
const DB_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
const MEMORY = process.env.AUTH_STORE === 'memory' && !process.env.VERCEL;

export function storeReady(): boolean {
  return MEMORY || !!DB_URL;
}

type Row = { value: string; expires: number | null };

// On globalThis because each route bundles its own copy of this module.
const g = globalThis as { __bmxMemoryStore?: Map<string, Row>; __bmxSql?: Promise<postgres.Sql> };
const mem = (g.__bmxMemoryStore ??= new Map());

function db(): Promise<postgres.Sql> {
  if (!DB_URL) return Promise.reject(new Error('Account storage is not connected'));
  // One connection per server instance is plenty; prepare: false suits Neon's pooled connection string.
  return (g.__bmxSql ??= (async () => {
    const sql = postgres(DB_URL, { max: 1, prepare: false, idle_timeout: 20, onnotice: () => {} });
    await sql`CREATE TABLE IF NOT EXISTS kv (key text PRIMARY KEY, value text NOT NULL, expires_at timestamptz)`;
    await sql`DELETE FROM kv WHERE expires_at <= now()`;
    return sql;
  })().catch(e => {
    g.__bmxSql = undefined;
    throw e;
  }));
}

function memLive(key: string): Row | undefined {
  const row = mem.get(key);
  return row && (row.expires == null || row.expires > Date.now()) ? row : undefined;
}

const expiry = (seconds?: number) => (seconds ? new Date(Date.now() + seconds * 1000) : null);

export async function get(key: string): Promise<string | null> {
  if (MEMORY) return memLive(key)?.value ?? null;
  const sql = await db();
  const [row] = await sql<{ value: string }[]>`
    SELECT value FROM kv WHERE key = ${key} AND (expires_at IS NULL OR expires_at > now())`;
  return row?.value ?? null;
}

// Returns false when onlyIfNew is set and the key already exists.
export async function set(key: string, value: string, opts: { onlyIfNew?: boolean; seconds?: number } = {}): Promise<boolean> {
  if (MEMORY) {
    if (opts.onlyIfNew && memLive(key)) return false;
    mem.set(key, { value, expires: expiry(opts.seconds)?.getTime() ?? null });
    return true;
  }
  const sql = await db();
  const expires = expiry(opts.seconds);
  // With onlyIfNew, an existing row is replaced only once it has expired.
  const rows = opts.onlyIfNew
    ? await sql`
        INSERT INTO kv (key, value, expires_at) VALUES (${key}, ${value}, ${expires})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at
        WHERE kv.expires_at IS NOT NULL AND kv.expires_at <= now()`
    : await sql`
        INSERT INTO kv (key, value, expires_at) VALUES (${key}, ${value}, ${expires})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at`;
  return rows.count === 1;
}

export async function del(key: string): Promise<void> {
  if (MEMORY) {
    mem.delete(key);
    return;
  }
  const sql = await db();
  await sql`DELETE FROM kv WHERE key = ${key}`;
}

// Counts up and starts the expiry on the first hit, for rate limits.
export async function hit(key: string, seconds: number): Promise<number> {
  if (MEMORY) {
    const n = Number(memLive(key)?.value ?? 0) + 1;
    mem.set(key, { value: String(n), expires: n === 1 ? Date.now() + seconds * 1000 : memLive(key)!.expires });
    return n;
  }
  const sql = await db();
  const [row] = await sql<{ value: string }[]>`
    INSERT INTO kv (key, value, expires_at) VALUES (${key}, '1', ${expiry(seconds)})
    ON CONFLICT (key) DO UPDATE SET
      value = CASE WHEN kv.expires_at IS NOT NULL AND kv.expires_at <= now() THEN '1' ELSE (kv.value::int + 1)::text END,
      expires_at = CASE WHEN kv.expires_at IS NOT NULL AND kv.expires_at <= now() THEN EXCLUDED.expires_at ELSE kv.expires_at END
    RETURNING value`;
  return Number(row.value);
}

// Every live key starting with prefix, with its value. Used for the admin's list of accounts.
export async function list(prefix: string): Promise<{ key: string; value: string }[]> {
  if (MEMORY) return [...mem.keys()].filter(k => k.startsWith(prefix) && memLive(k)).map(k => ({ key: k, value: memLive(k)!.value }));
  const sql = await db();
  const pattern = prefix.replace(/[\\%_]/g, c => `\\${c}`) + '%';
  return sql<{ key: string; value: string }[]>`
    SELECT key, value FROM kv WHERE key LIKE ${pattern} AND (expires_at IS NULL OR expires_at > now()) ORDER BY key`;
}
