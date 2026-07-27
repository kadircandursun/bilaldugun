/**
 * Tick-based ZIP (STORE) builder for Cloudflare Workers.
 * Each /tick processes a few files, persists multipart state in R2, then returns.
 * Gallery polling drives ticks until status=ready.
 */

export interface Env {
  BUCKET: R2Bucket;
  ARCHIVE_SECRET: string;
  UPLOAD_PREFIX: string;
  ARCHIVE_ZIP_KEY: string;
  ARCHIVE_JOB_KEY: string;
  MAX_ARCHIVE_BYTES: string;
}

type JobStatus = "queued" | "running" | "ready" | "failed";

interface CentralEntry {
  name: string;
  crc: number;
  size: number;
  offset: number;
}

interface PartialFile {
  key: string;
  name: string;
  offset: number;
  size: number;
  localHeaderOffset: number;
  bytesWritten: number;
}

interface ArchiveJob {
  status: JobStatus;
  progressDone: number;
  progressTotal: number;
  size: number;
  error?: string;
  updatedAt: string;
  zipKey?: string;
  keys?: string[];
  nextIndex?: number;
  uploadId?: string;
  parts?: { partNumber: number; etag: string }[];
  partNumber?: number;
  zipOffset?: number;
  central?: CentralEntry[];
  partial?: PartialFile | null;
}

const PART_BUF_KEY = "archives/_partbuf.bin";
const MIN_PART = 5 * 1024 * 1024;
const RANGE_PER_TICK = 12 * 1024 * 1024;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32Update(crc: number, data: Uint8Array): number {
  let c = crc ^ 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function u16(n: number) {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, n, true);
  return b;
}

function u32(n: number) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0, true);
  return b;
}

function concat(chunks: Uint8Array[]) {
  const len = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

function localHeader(nameBytes: Uint8Array) {
  // GP flag bit3 = data descriptor; method 0 = STORE
  return concat([
    u32(0x04034b50),
    u16(20),
    u16(0x0008),
    u16(0),
    u16(0),
    u16(0),
    u32(0),
    u32(0),
    u32(0),
    u16(nameBytes.length),
    u16(0),
    nameBytes,
  ]);
}

function dataDescriptor(crc: number, size: number) {
  return concat([u32(0x08074b50), u32(crc), u32(size), u32(size)]);
}

function centralHeader(e: CentralEntry, nameBytes: Uint8Array) {
  return concat([
    u32(0x02014b50),
    u16(20),
    u16(20),
    u16(0x0008),
    u16(0),
    u16(0),
    u16(0),
    u32(e.crc),
    u32(e.size),
    u32(e.size),
    u16(nameBytes.length),
    u16(0),
    u16(0),
    u16(0),
    u16(0),
    u32(0),
    u32(e.offset),
    nameBytes,
  ]);
}

function endOfCentral(centralSize: number, centralOffset: number, count: number) {
  return concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(count),
    u16(count),
    u32(centralSize),
    u32(centralOffset),
    u16(0),
  ]);
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isAuthorized(req: Request, env: Env) {
  const header = req.headers.get("Authorization") || "";
  return Boolean(env.ARCHIVE_SECRET) && header === `Bearer ${env.ARCHIVE_SECRET}`;
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

async function listUploadKeys(env: Env) {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.BUCKET.list({
      prefix: env.UPLOAD_PREFIX,
      cursor,
      limit: 1000,
    });
    for (const o of page.objects) {
      if (o.key !== env.UPLOAD_PREFIX) keys.push(o.key);
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return keys;
}

class PartWriter {
  private buf = new Uint8Array(0);
  parts: { partNumber: number; etag: string }[] = [];
  partNumber: number;
  offset: number;
  uploadId: string;
  key: string;
  bucket: R2Bucket;

  constructor(
    bucket: R2Bucket,
    key: string,
    uploadId: string,
    parts: { partNumber: number; etag: string }[],
    partNumber: number,
    offset: number,
    initialBuf: Uint8Array
  ) {
    this.bucket = bucket;
    this.key = key;
    this.uploadId = uploadId;
    this.parts = parts;
    this.partNumber = partNumber;
    this.offset = offset;
    this.buf = initialBuf;
  }

  async write(chunk: Uint8Array) {
    if (!chunk.length) return;
    const merged = new Uint8Array(this.buf.length + chunk.length);
    merged.set(this.buf);
    merged.set(chunk, this.buf.length);
    this.buf = merged;
    this.offset += chunk.length;

    while (this.buf.length >= MIN_PART) {
      const part = this.buf.slice(0, MIN_PART);
      this.buf = this.buf.slice(MIN_PART);
      this.partNumber += 1;
      const res = await this.bucket.resumeMultipartUpload(this.key, this.uploadId).uploadPart(
        this.partNumber,
        part
      );
      this.parts.push({ partNumber: this.partNumber, etag: res.etag });
    }
  }

  async flushFinal() {
    if (this.buf.length > 0 || this.parts.length === 0) {
      this.partNumber += 1;
      const res = await this.bucket.resumeMultipartUpload(this.key, this.uploadId).uploadPart(
        this.partNumber,
        this.buf.length ? this.buf : new Uint8Array([0])
      );
      this.parts.push({ partNumber: this.partNumber, etag: res.etag });
      this.buf = new Uint8Array(0);
    }
    await this.bucket.resumeMultipartUpload(this.key, this.uploadId).complete(
      this.parts.map((p) => ({ partNumber: p.partNumber, etag: p.etag }))
    );
  }

  async persistBuf(env: Env) {
    if (this.buf.length) {
      await env.BUCKET.put(PART_BUF_KEY, this.buf);
    } else {
      await env.BUCKET.delete(PART_BUF_KEY);
    }
  }
}

async function loadPartBuf(env: Env): Promise<Uint8Array> {
  const obj = await env.BUCKET.get(PART_BUF_KEY);
  if (!obj) return new Uint8Array(0);
  return new Uint8Array(await obj.arrayBuffer());
}

async function startJob(env: Env): Promise<ArchiveJob> {
  const keys = await listUploadKeys(env);
  let totalBytes = 0;
  for (const key of keys) {
    const h = await env.BUCKET.head(key);
    totalBytes += h?.size || 0;
  }
  const maxBytes = Number(env.MAX_ARCHIVE_BYTES) || 8 * 1024 * 1024 * 1024;

  if (keys.length === 0) {
    const failed: ArchiveJob = {
      status: "failed",
      progressDone: 0,
      progressTotal: 0,
      size: 0,
      error: "Yuklenecek ani yok.",
      updatedAt: new Date().toISOString(),
    };
    await writeJob(env, failed);
    return failed;
  }

  if (totalBytes > maxBytes) {
    const failed: ArchiveJob = {
      status: "failed",
      progressDone: 0,
      progressTotal: keys.length,
      size: totalBytes,
      error: "Arsiv 8 GB ustunde; R2/telefon icin cok buyuk.",
      updatedAt: new Date().toISOString(),
    };
    await writeJob(env, failed);
    return failed;
  }

  try {
    await env.BUCKET.delete(env.ARCHIVE_ZIP_KEY);
  } catch {
    /* ignore */
  }
  await env.BUCKET.delete(PART_BUF_KEY);

  const multi = await env.BUCKET.createMultipartUpload(env.ARCHIVE_ZIP_KEY, {
    httpMetadata: { contentType: "application/zip" },
  });

  const job: ArchiveJob = {
    status: "running",
    progressDone: 0,
    progressTotal: keys.length,
    size: totalBytes,
    updatedAt: new Date().toISOString(),
    keys,
    nextIndex: 0,
    uploadId: multi.uploadId,
    parts: [],
    partNumber: 0,
    zipOffset: 0,
    central: [],
    zipKey: env.ARCHIVE_ZIP_KEY,
  };
  await writeJob(env, job);
  return job;
}

async function tickJob(env: Env): Promise<ArchiveJob> {
  let job = await readJob(env);
  if (!job) {
    return {
      status: "failed",
      progressDone: 0,
      progressTotal: 0,
      size: 0,
      error: "Job yok.",
      updatedAt: new Date().toISOString(),
    };
  }
  if (job.status === "ready" || job.status === "failed") return job;
  if (job.status === "queued" || !job.uploadId || !job.keys) {
    job = await startJob(env);
    if (job.status !== "running") return job;
  }

  const keys = job.keys || [];
  let index = job.nextIndex || 0;
  const central = job.central || [];
  let partial = job.partial || null;
  const initialBuf = await loadPartBuf(env);

  const writer = new PartWriter(
    env.BUCKET,
    env.ARCHIVE_ZIP_KEY,
    job.uploadId!,
    job.parts || [],
    job.partNumber || 0,
    job.zipOffset || 0,
    initialBuf
  );

  try {
    if (!partial) {
      if (index >= keys.length) {
        // fall through to finalize below
      } else {
        const key = keys[index];
        const head = await env.BUCKET.head(key);
        const size = head?.size || 0;
        const name = key.slice(env.UPLOAD_PREFIX.length) || key;
        const nameBytes = new TextEncoder().encode(name);
        const localHeaderOffset = writer.offset;
        await writer.write(localHeader(nameBytes));
        partial = {
          key,
          name,
          offset: 0,
          size,
          localHeaderOffset,
          bytesWritten: 0,
        };
      }
    }

    if (partial) {
      const remaining = partial.size - partial.offset;
      const length = Math.min(RANGE_PER_TICK, remaining);
      if (length > 0) {
        const chunk = await env.BUCKET.get(partial.key, {
          range: { offset: partial.offset, length },
        });
        if (!chunk || !chunk.body) {
          throw new Error(`Dosya okunamadi: ${partial.key}`);
        }
        const buf = new Uint8Array(await chunk.arrayBuffer());
        await writer.write(buf);
        partial.offset += buf.length;
        partial.bytesWritten += buf.length;
      }

      if (partial.offset >= partial.size) {
        await writer.write(dataDescriptor(0, partial.size));
        central.push({
          name: partial.name,
          crc: 0,
          size: partial.size,
          offset: partial.localHeaderOffset,
        });
        index += 1;
        partial = null;
      }
    }

    if (index >= keys.length && !partial) {
      const centralStart = writer.offset;
      let centralSize = 0;
      for (const e of central) {
        const nameBytes = new TextEncoder().encode(e.name);
        const hdr = centralHeader(e, nameBytes);
        centralSize += hdr.length;
        await writer.write(hdr);
      }
      await writer.write(endOfCentral(centralSize, centralStart, central.length));
      await writer.flushFinal();
      await env.BUCKET.delete(PART_BUF_KEY);

      const head = await env.BUCKET.head(env.ARCHIVE_ZIP_KEY);
      const ready: ArchiveJob = {
        status: "ready",
        progressDone: keys.length,
        progressTotal: keys.length,
        size: head?.size || writer.offset,
        updatedAt: new Date().toISOString(),
        zipKey: env.ARCHIVE_ZIP_KEY,
      };
      await writeJob(env, ready);
      return ready;
    }

    await writer.persistBuf(env);
    const running: ArchiveJob = {
      status: "running",
      progressDone: index,
      progressTotal: keys.length,
      size: job.size,
      updatedAt: new Date().toISOString(),
      keys,
      nextIndex: index,
      uploadId: job.uploadId,
      parts: writer.parts,
      partNumber: writer.partNumber,
      zipOffset: writer.offset,
      central,
      partial,
      zipKey: env.ARCHIVE_ZIP_KEY,
    };
    await writeJob(env, running);
    return running;
  } catch (e) {
    try {
      if (job.uploadId) {
        await env.BUCKET.resumeMultipartUpload(env.ARCHIVE_ZIP_KEY, job.uploadId).abort();
      }
    } catch {
      /* ignore */
    }
    const failed: ArchiveJob = {
      status: "failed",
      progressDone: index,
      progressTotal: keys.length,
      size: job.size,
      error: e instanceof Error ? e.message : "Arsiv hatasi",
      updatedAt: new Date().toISOString(),
    };
    await writeJob(env, failed);
    return failed;
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (!isAuthorized(req, env)) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/health") {
      return jsonResponse({ ok: true });
    }

    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/status")) {
      return jsonResponse({ job: await readJob(env) });
    }

    if (req.method === "POST" && (url.pathname === "/" || url.pathname === "/start")) {
      const existing = await readJob(env);
      if (existing?.status === "running") {
        // Drive progress on each start/tick from Next poll
        const job = await tickJob(env);
        return jsonResponse({ ok: true, job, started: false });
      }
      const job = await startJob(env);
      if (job.status === "running") {
        const progressed = await tickJob(env);
        return jsonResponse({ ok: true, job: progressed, started: true }, 202);
      }
      return jsonResponse({ ok: true, job, started: true }, 202);
    }

    if (req.method === "POST" && url.pathname === "/tick") {
      const job = await tickJob(env);
      return jsonResponse({ ok: true, job });
    }

    return jsonResponse({ error: "Not found" }, 404);
  },
};
