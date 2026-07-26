import { NextResponse } from "next/server";
import { GALLERY_PASSWORD } from "@/lib/r2";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!GALLERY_PASSWORD) {
    return NextResponse.json(
      { error: "Galeri şifresi henüz ayarlanmadı." },
      { status: 503 }
    );
  }

  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }

  if (body.password !== GALLERY_PASSWORD) {
    return NextResponse.json({ error: "Şifre hatalı." }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
