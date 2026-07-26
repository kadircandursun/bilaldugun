import { NextResponse } from "next/server";
import { ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  getR2,
  isR2Configured,
  R2_BUCKET,
  R2_PUBLIC_BASE_URL,
  UPLOAD_PREFIX,
  GALLERY_PASSWORD,
} from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(req: Request): boolean {
  if (!GALLERY_PASSWORD) return false;
  const header = req.headers.get("x-gallery-password") || "";
  return header === GALLERY_PASSWORD;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Şifre gerekli." }, { status: 401 });
  }

  if (!isR2Configured()) {
    return NextResponse.json({ photos: [], configured: false });
  }

  const client = getR2();
  const res = await client.send(
    new ListObjectsV2Command({
      Bucket: R2_BUCKET,
      Prefix: UPLOAD_PREFIX,
      MaxKeys: 1000,
    })
  );

  const objects = (res.Contents || [])
    .filter((o) => o.Key && o.Key !== UPLOAD_PREFIX)
    .sort((a, b) => {
      const ta = a.LastModified?.getTime() || 0;
      const tb = b.LastModified?.getTime() || 0;
      return tb - ta;
    });

  const photos = await Promise.all(
    objects.map(async (o) => {
      const key = o.Key as string;
      const url = R2_PUBLIC_BASE_URL
        ? `${R2_PUBLIC_BASE_URL}/${key}`
        : await getSignedUrl(
            client,
            new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }),
            { expiresIn: 3600 }
          );
      return { key, url };
    })
  );

  return NextResponse.json({ photos, configured: true });
}
