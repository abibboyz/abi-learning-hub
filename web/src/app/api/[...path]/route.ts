import { NextRequest, NextResponse } from "next/server";
import { backendForTrack, pickBackend, pwBackend, trackIdFromPath } from "@/lib/backend";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function proxy(req: NextRequest, pathParts: string[]) {
  const parts = pathParts.filter(Boolean);

  // Aggregated hub health — single public surface
  if (parts.length === 1 && parts[0] === "health") {
    const [python, node, playwright] = await Promise.all([
      fetch(`${process.env.PYTHON_API_INTERNAL || "http://localhost:8000"}/health`)
        .then((r) => r.json())
        .catch(() => ({ ok: false, database: false })),
      fetch(`${process.env.NODE_API_INTERNAL || "http://localhost:8001"}/health`)
        .then((r) => r.json())
        .catch(() => ({ ok: false, database: false })),
      fetch(`${pwBackend()}/health`, { signal: AbortSignal.timeout(4000) })
        .then((r) => r.json())
        .catch(() => ({ ok: false, database: false })),
    ]);
    // The Playwright runner is optional for the SQL/Node tracks: report it, but don't mark the hub down.
    const ok = Boolean(python?.ok) && Boolean(node?.ok);
    return NextResponse.json({
      ok,
      hub: "abi-learning-hub",
      python,
      node,
      playwright,
      message: ok
        ? "Hub online — pick a track in the UI"
        : "Hub degraded — ensure docker compose is running",
    });
  }

  const url = new URL(req.url);
  let trackId =
    url.searchParams.get("trackId") ||
    url.searchParams.get("track") ||
    trackIdFromPath(parts);

  let bodyText: string | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    bodyText = await req.text();
    if (!trackId && bodyText) {
      try {
        const parsed = JSON.parse(bodyText) as { trackId?: string };
        if (parsed.trackId) trackId = parsed.trackId;
      } catch {
        /* ignore */
      }
    }
  }

  // /execute and /schema prefer track-aware backends
  let targetBase: string;
  if (parts[0] === "execute" || parts[0] === "schema" || parts[0] === "history") {
    targetBase = backendForTrack(trackId);
  } else {
    targetBase = pickBackend(parts, trackId);
  }

  const target = `${targetBase}/${parts.join("/")}${url.search}`;

  const headers = new Headers();
  const ct = req.headers.get("content-type");
  if (ct) headers.set("content-type", ct);
  const accept = req.headers.get("accept");
  if (accept) headers.set("accept", accept);

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: bodyText,
      cache: "no-store",
    });

    const outHeaders = new Headers();
    const upstreamCt = upstream.headers.get("content-type");
    if (upstreamCt) outHeaders.set("content-type", upstreamCt);

    // Pass binary bodies through untouched: snapshot files, Playwright screenshots, trace.zip,
    // and the trace viewer's own assets (js, wasm, fonts, service worker).
    const isText = !upstreamCt || /^(text\/|application\/(json|problem\+json))/.test(upstreamCt);
    if (!isText || (upstreamCt ?? "").includes("application/sql")) {
      const buf = await upstream.arrayBuffer();
      for (const h of ["content-disposition", "cache-control", "service-worker-allowed"]) {
        const v = upstream.headers.get(h);
        if (v) outHeaders.set(h, v);
      }
      return new NextResponse(buf, { status: upstream.status, headers: outHeaders });
    }
    if (parts[0] === "pw") {
      const cc = upstream.headers.get("cache-control");
      if (cc) outHeaders.set("cache-control", cc);
    }

    const text = await upstream.text();
    return new NextResponse(text, { status: upstream.status, headers: outHeaders });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "upstream_unreachable",
        message: `Hub could not reach internal service (${targetBase}). Run: docker compose up --build`,
        detail: String(err),
      },
      { status: 502 }
    );
  }
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
export async function POST(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
export async function PUT(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
