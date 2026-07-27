import { Zip, ZipPassThrough } from "fflate";

export interface Env {
  BUCKET: R2Bucket;
  ARCHIVE_SECRET: string;
  UPLOAD_PREFIX: string;
  ARCHIVE_ZIP_KEY: string;
  ARCHIVE_JOB_KEY: string;
  MAX_ARCHIVE_BYTES: string;
}

export type JobStatus = "queued" | "running" | "ready" | "failed";

export interface ArchiveJob {
  status: JobStatus;
  progressDone: number;
  progressTotal: number;
  size: number;
  error?: string;
  updatedAt: string;
  zipKey?: string;
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function unauthorized() {
  return jsonResponse({ error: "Unauthorized" }, 401);
}

function isAuthorized(req: Request, env: Env): boolean {
  const header = req.headers.get("Authorization") || "";
  const expected = `Bearer ${env.ARCHIVE_SECRET}`;
  return Boolean(env.ARCHIVE_SECRET) && header === expected;
}

async function writeJob(env: Env, job: ArchiveJob) {
  await env.BUCKET.put(env.ARCHIVE_JOB_KEY, JSON.stringify(job), {
    httpMetadata: { contentType: "application/json" },
  });
}

async function readJob(env: Env): Promise<ArchiveJob | null> {
  const obj = await env.BUCKET.get(env.ARCHIVE_JOB_KEY);
  if (!obj) return null;
  try {
    return (await obj.json()) as ArchiveJob;
  } catch {
    return null;
  }
}

async function listUploads(env: Env) {
  const objects: R2Object[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.BUCKET.list({
      prefix: env.UPLOAD_PREFIX,
      cursor,
      limit: 1000,
    });
    for (const o of page.objects) {
      if (o.key === env.UPLOAD_PREFIX) continue;
      objects.push(o);
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return objects;
}

async function buildArchive(env: Env) {
  const started: ArchiveJob = {
    status: "running",
    progressDone: 0,
    progressTotal: 0,
    size: 0,
    updatedAt: new Date().toISOString(),
  };
  await writeJob(env, started);

  try {
    const objects = await listUploads(env);
    const totalBytes = objects.reduce((sum, o) => sum + (o.size || 0), 0);
    const maxBytes = Number(env.MAX_ARCHIVE_BYTES) || 8 * 1024 * 1024 * 1024;

    if (objects.length === 0) {
      await writeJob(env, {
        status: "failed",
        progressDone: 0,
        progressTotal: 0,
        size: 0,
        error: "Yuklenecek anı yok.",
        updatedAt: new Date().toISOString(),
      });
      return;
    }

    if (totalBytes > maxBytes) {
      await writeJob(env, {
        status: "failed",
        progressDone: 0,
        progressTotal: objects.length,
        size: totalBytes,
        error: "Arsiv 8 GB ustunde; R2/telefon icin cok buyuk.",
        updatedAt: new Date().toISOString(),
      });
      return;
    }

    await writeJob(env, {
      status: "running",
      progressDone: 0,
      progressTotal: objects.length,
      size: totalBytes,
      updatedAt: new Date().toISOString(),
    });

    const { readable, writable } = new TransformStream<Uint8Array>();
    const writer = writable.getWriter();

    let zipError: Error | null = null;
    let writeChain: Promise<void> = Promise.resolve();

    const zip = new Zip((err, data, final) => {
      if (err) {
        zipError = err;
        writeChain = writeChain.then(() => writer.abort(err)).catch(() => undefined);
        return;
      }
      writeChain = writeChain.then(() => writer.write(data));
      if (final) {
        writeChain = writeChain.then(() => writer.close());
      }
    });

    const putPromise = env.BUCKET.put(env.ARCHIVE_ZIP_KEY, readable, {
      httpMetadata: { contentType: "application/zip" },
    });

    let done = 0;
    for (const obj of objects) {
      const file = await env.BUCKET.get(obj.key);
      if (!file || !file.body) {
        done += 1;
        continue;
      }

      const name = obj.key.slice(env.UPLOAD_PREFIX.length) || obj.key;
      const entry = new ZipPassThrough(name);
      zip.add(entry);

      const reader = file.body.getReader();
      while (true) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;
        if (value) entry.push(value);
      }
      entry.push(new Uint8Array(0), true);

      done += 1;
      if (done % 3 === 0 || done === objects.length) {
        await writeJob(env, {
          status: "running",
          progressDone: done,
          progressTotal: objects.length,
          size: totalBytes,
          updatedAt: new Date().toISOString(),
        });
      }
    }

    zip.end();
    await writeChain;
    await putPromise;

    if (zipError) throw zipError;

    const zipObj = await env.BUCKET.head(env.ARCHIVE_ZIP_KEY);
    await writeJob(env, {
      status: "ready",
      progressDone: objects.length,
      progressTotal: objects.length,
      size: zipObj?.size || totalBytes,
      zipKey: env.ARCHIVE_ZIP_KEY,
      updatedAt: new Date().toISOString(),
    });
  } catch (e) {
    await writeJob(env, {
      status: "failed",
      progressDone: 0,
      progressTotal: 0,
      size: 0,
      error: e instanceof Error ? e.message : "Arsiv olusturulamadi.",
      updatedAt: new Date().toISOString(),
    });
  }
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (!isAuthorized(req, env)) return unauthorized();

    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/health") {
      return jsonResponse({ ok: true });
    }

    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/status")) {
      const job = await readJob(env);
      return jsonResponse({ job });
    }

    if (req.method === "POST" && (url.pathname === "/" || url.pathname === "/start")) {
      const existing = await readJob(env);
      if (existing?.status === "running" || existing?.status === "queued") {
        return jsonResponse({ ok: true, job: existing, started: false });
      }

      const queued: ArchiveJob = {
        status: "queued",
        progressDone: 0,
        progressTotal: 0,
        size: 0,
        updatedAt: new Date().toISOString(),
      };
      await writeJob(env, queued);
      ctx.waitUntil(buildArchive(env));
      return jsonResponse({ ok: true, job: queued, started: true }, 202);
    }

    return jsonResponse({ error: "Not found" }, 404);
  },
};
