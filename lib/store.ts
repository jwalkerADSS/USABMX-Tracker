import 'server-only';

// Account storage: a Redis database from Vercel's Storage tab (Upstash), spoken to over its REST API.
// Connecting the database to the project sets KV_REST_API_URL and KV_REST_API_TOKEN.
// AUTH_STORE=memory keeps everything in this process instead, for local testing only (ignored on Vercel).
const URL_ = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
const MEMORY = process.env.AUTH_STORE === 'memory' && !process.env.VERCEL;

export function storeReady(): boolean {
  return MEMORY || !!(URL_ && TOKEN);
}

// On globalThis because each route bundles its own copy of this module.
const g = globalThis as { __bmxMemoryStore?: Map<string, { value: string; expires: number | null }> };
const mem = (g.__bmxMemoryStore ??= new Map());

async function redis(args: (string | number)[]): Promise<unknown> {
  if (MEMORY) return memory(args);
  if (!URL_ || !TOKEN) throw new Error('Account storage is not connected');
  const res = await fetch(URL_, {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(args.map(String)),
    cache: 'no-store',
  });
  const body = (await res.json()) as { result?: unknown; error?: string };
  if (!res.ok || body.error) throw new Error(`Account storage error: ${body.error ?? res.status}`);
  return body.result;
}

function memory([cmd, key, ...rest]: (string | number)[]): unknown {
  const k = String(key);
  const hit = mem.get(k);
  const live = hit && (hit.expires == null || hit.expires > Date.now()) ? hit : undefined;
  switch (String(cmd).toUpperCase()) {
    case 'GET': return live?.value ?? null;
    case 'DEL': return mem.delete(k) ? 1 : 0;
    case 'SET': {
      const opts = rest.slice(1).map(String);
      if (opts.includes('NX') && live) return null;
      const ex = opts.indexOf('EX');
      mem.set(k, { value: String(rest[0]), expires: ex >= 0 ? Date.now() + Number(opts[ex + 1]) * 1000 : null });
      return 'OK';
    }
    case 'INCR': {
      const n = Number(live?.value ?? 0) + 1;
      mem.set(k, { value: String(n), expires: live?.expires ?? null });
      return n;
    }
    case 'EXPIRE': {
      if (live) live.expires = Date.now() + Number(rest[0]) * 1000;
      return live ? 1 : 0;
    }
  }
  throw new Error(`Unsupported command ${cmd}`);
}

export async function get(key: string): Promise<string | null> {
  return (await redis(['GET', key])) as string | null;
}

// Returns false when onlyIfNew is set and the key already exists.
export async function set(key: string, value: string, opts: { onlyIfNew?: boolean; seconds?: number } = {}): Promise<boolean> {
  const args: (string | number)[] = ['SET', key, value];
  if (opts.onlyIfNew) args.push('NX');
  if (opts.seconds) args.push('EX', opts.seconds);
  return (await redis(args)) === 'OK';
}

export async function del(key: string): Promise<void> {
  await redis(['DEL', key]);
}

// Counts up and starts the expiry on the first hit, for rate limits.
export async function hit(key: string, seconds: number): Promise<number> {
  const n = Number(await redis(['INCR', key]));
  if (n === 1) await redis(['EXPIRE', key, seconds]);
  return n;
}
