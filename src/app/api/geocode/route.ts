import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (!q) {
    return NextResponse.json({ error: "地名を入力してください" }, { status: 400 });
  }

  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&accept-language=ja`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "nanami-demo/1.0 (demo app)" },
    });
  } catch {
    return NextResponse.json({ error: "ジオコーディングサービスに接続できませんでした" }, { status: 502 });
  }

  const results = await res.json().catch(() => []);
  if (!Array.isArray(results) || results.length === 0) {
    return NextResponse.json({ error: "出生地が見つかりませんでした。より具体的な地名を入力してください（例: 東京都、大阪府、London UK）" }, { status: 404 });
  }

  const { lat, lon, display_name } = results[0];
  return NextResponse.json({ lat: parseFloat(lat), lon: parseFloat(lon), display_name });
}
