import { NextResponse } from "next/server";
import {
  isGalleryAuthorized,
  readArchiveJob,
  triggerArchiveWorker,
  deleteArchiveArtifacts,
  writeArchiveJob,
  type ArchiveJob,
} from "@/lib/archive";
import { isR2Configured } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isGalleryAuthorized(req)) {
    return NextResponse.json({ error: "Sifre gerekli." }, { status: 401 });
  }
  if (!isR2Configured()) {
    return NextResponse.json({ job: null, configured: false });
  }
  const job = await readArchiveJob();
  return NextResponse.json({ job, configured: true });
}

export async function POST(req: Request) {
  if (!isGalleryAuthorized(req)) {
    return NextResponse.json({ error: "Sifre gerekli." }, { status: 401 });
  }
  if (!isR2Configured()) {
    return NextResponse.json(
      { error: "Depolama henuz yapilandirilmadi." },
      { status: 503 }
    );
  }

  const existing = await readArchiveJob();
  if (existing?.status === "running" || existing?.status === "queued") {
    return NextResponse.json({ ok: true, job: existing, started: false });
  }

  const queued: ArchiveJob = {
    status: "queued",
    progressDone: 0,
    progressTotal: 0,
    size: 0,
    updatedAt: new Date().toISOString(),
  };
  await writeArchiveJob(queued);

  const result = await triggerArchiveWorker();
  if (!result.ok) {
    const failed: ArchiveJob = {
      status: "failed",
      progressDone: 0,
      progressTotal: 0,
      size: 0,
      error: result.error,
      updatedAt: new Date().toISOString(),
    };
    await writeArchiveJob(failed);
    return NextResponse.json({ error: result.error, job: failed }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    job: result.job || queued,
    started: true,
  });
}

export async function DELETE(req: Request) {
  if (!isGalleryAuthorized(req)) {
    return NextResponse.json({ error: "Sifre gerekli." }, { status: 401 });
  }
  if (!isR2Configured()) {
    return NextResponse.json({ ok: true });
  }
  await deleteArchiveArtifacts();
  return NextResponse.json({ ok: true });
}
