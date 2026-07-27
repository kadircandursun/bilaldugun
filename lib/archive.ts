import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  ARCHIVE_JOB_KEY,
  ARCHIVE_ZIP_KEY,
  GALLERY_PASSWORD,
  getR2,
  isR2Configured,
  R2_BUCKET,
} from "@/lib/r2";

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

export function isGalleryAuthorized(req: Request): boolean {
  if (!GALLERY_PASSWORD) return false;
  const header = req.headers.get("x-gallery-password") || "";
  return header === GALLERY_PASSWORD;
}

export async function readArchiveJob(): Promise<ArchiveJob | null> {
  if (!isR2Configured()) return null;
  try {
    const res = await getR2().send(
      new GetObjectCommand({ Bucket: R2_BUCKET, Key: ARCHIVE_JOB_KEY })
    );
    const text = await res.Body?.transformToString();
    if (!text) return null;
    return JSON.parse(text) as ArchiveJob;
  } catch {
    return null;
  }
}

export async function writeArchiveJob(job: ArchiveJob): Promise<void> {
  await getR2().send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: ARCHIVE_JOB_KEY,
      Body: JSON.stringify(job),
      ContentType: "application/json",
    })
  );
}

export async function deleteArchiveArtifacts(): Promise<void> {
  const client = getR2();
  await Promise.allSettled([
    client.send(
      new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: ARCHIVE_ZIP_KEY })
    ),
    client.send(
      new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: ARCHIVE_JOB_KEY })
    ),
  ]);
}

export async function getArchiveDownloadUrl(): Promise<string> {
  return getSignedUrl(
    getR2(),
    new GetObjectCommand({ Bucket: R2_BUCKET, Key: ARCHIVE_ZIP_KEY }),
    { expiresIn: 3600 }
  );
}

export async function triggerArchiveWorker(): Promise<{
  ok: boolean;
  error?: string;
  job?: ArchiveJob;
}> {
  const workerUrl = process.env.ARCHIVE_WORKER_URL;
  const secret = process.env.ARCHIVE_SECRET;
  if (!workerUrl || !secret) {
    return {
      ok: false,
      error:
        "Arsiv worker henuz yapilandirilmadi (ARCHIVE_WORKER_URL / ARCHIVE_SECRET).",
    };
  }

  const base = workerUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/start`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  });

  const data = (await res.json().catch(() => ({}))) as {
    job?: ArchiveJob;
    error?: string;
  };

  if (!res.ok) {
    return {
      ok: false,
      error: data.error || `Worker hatasi (${res.status})`,
    };
  }

  return { ok: true, job: data.job };
}
