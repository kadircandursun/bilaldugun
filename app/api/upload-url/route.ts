import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  getR2,
  isR2Configured,
  R2_BUCKET,
  UPLOAD_PREFIX,
} from "@/lib/r2";

export const runtime = "nodejs";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

function safeExt(contentType: string): string {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

export async function POST(req: Request) {
  if (!isR2Configured()) {
    return NextResponse.json(
      { error: "Depolama henüz yapılandırılmadı." },
      { status: 503 }
    );
  }

  let body: { contentType?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }

  const contentType = body.contentType || "image/jpeg";
  if (!ALLOWED.has(contentType)) {
    return NextResponse.json(
      { error: "Sadece fotoğraf yükleyebilirsiniz." },
      { status: 415 }
    );
  }

  const id =
    (globalThis.crypto?.randomUUID?.() as string) ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const key = `${UPLOAD_PREFIX}${id}.${safeExt(contentType)}`;

  const url = await getSignedUrl(
    getR2(),
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: 600 }
  );

  return NextResponse.json({ url, key });
}
