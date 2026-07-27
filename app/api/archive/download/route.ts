import { NextResponse } from "next/server";
import {
  getArchiveDownloadUrl,
  isGalleryAuthorized,
  readArchiveJob,
} from "@/lib/archive";
import { isR2Configured } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isGalleryAuthorized(req)) {
    return NextResponse.json({ error: "Sifre gerekli." }, { status: 401 });
  }
  if (!isR2Configured()) {
    return NextResponse.json(
      { error: "Depolama henuz yapilandirilmadi." },
      { status: 503 }
    );
  }

  const job = await readArchiveJob();
  if (!job || job.status !== "ready") {
    return NextResponse.json(
      { error: "Arsiv henuz hazir degil." },
      { status: 409 }
    );
  }

  const url = await getArchiveDownloadUrl();
  return NextResponse.json({ url, size: job.size });
}
