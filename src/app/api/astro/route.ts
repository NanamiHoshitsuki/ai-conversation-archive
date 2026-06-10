import { NextRequest, NextResponse } from "next/server";
import type { ApiType, Mode } from "@/lib/types";

const BASE_URL = process.env.NANAMI_API_BASE_URL ?? "https://chart.nanami-astro.com";

const ENDPOINT_MAP: Record<ApiType, { demo: string; calc: string }> = {
  western:       { demo: "/api/demo/western",  calc: "/api/calc/western"  },
  shichusuimei:  { demo: "/api/demo/shichu",   calc: "/api/calc/shichu"   },
  transit:       { demo: "/api/demo/transit",  calc: "/api/calc/transit"  },
  combined:      { demo: "/api/demo/combined", calc: "/api/calc/combined" },
};

export async function POST(req: NextRequest) {
  let body: { mode: Mode; apiType: ApiType; payload: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: { code: "INVALID_INPUT", message: "リクエスト形式が正しくありません。" } }, { status: 400 });
  }

  const { mode, apiType, payload } = body;

  if (!apiType || !ENDPOINT_MAP[apiType]) {
    return NextResponse.json({ ok: false, error: { code: "INVALID_INPUT", message: "API種別が正しくありません。" } }, { status: 400 });
  }

  const endpoints = ENDPOINT_MAP[apiType];
  const isSandbox = mode === "sandbox";
  const path = isSandbox ? endpoints.demo : endpoints.calc;
  const url = `${BASE_URL}${path}`;

  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (!isSandbox) {
    const apiKey = process.env.NANAMI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: { code: "UNAUTHORIZED", message: "APIキーが設定されていません。" } },
        { status: 401 }
      );
    }
    headers["X-API-Key"] = apiKey;
  }

  let upstreamRes: Response;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 35000);
    upstreamRes = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    return NextResponse.json(
      { ok: false, error: { code: isTimeout ? "TIMEOUT" : "NETWORK_ERROR", message: isTimeout ? "応答タイムアウト" : "通信エラー" } },
      { status: 502 }
    );
  }

  const data = await upstreamRes.json().catch(() => ({ ok: false, error: { code: "INTERNAL_ERROR", message: "レスポンス解析失敗" } }));
  return NextResponse.json(data, { status: upstreamRes.status });
}
