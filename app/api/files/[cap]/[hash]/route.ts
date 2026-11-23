import { env } from "cloudflare:workers";
const valid = (s: string) => /^0x[0-9a-f]{64}$/.test(s);
const max = 2 * 1024 * 1024;
type Ctx = { params: Promise<{ cap: string; hash: string }> };
async function target(context: Ctx) {
  const { cap, hash } = await context.params;
  return valid(cap) && valid(hash)
    ? { key: "orders/v1/" + cap + "/" + hash, hash }
    : undefined;
}
export async function GET(_: Request, c: Ctx) {
  const t = await target(c);
  if (!t) return new Response(null, { status: 400 });
  const obj = await (env as Cloudflare.Env).BUCKET?.get(t.key);
  if (!obj) return new Response(null, { status: 404 });
  return new Response(obj.body, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": "attachment",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export async function PUT(req: Request, c: Ctx) {
  const t = await target(c);
  if (!t) return new Response(null, { status: 400 });
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin)
    return new Response(null, { status: 403 });
  const bucket = (env as Cloudflare.Env).BUCKET;
  if (!bucket) return new Response(null, { status: 503 });
  const size = Number(req.headers.get("content-length") || 0);
  if (size > max) return new Response(null, { status: 413 });
  const reader = req.body?.getReader();
  if (!reader) return new Response(null, { status: 400 });
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let actual = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    actual += value.byteLength;
    if (actual > max) {
      await reader.cancel();
      return new Response(null, { status: 413 });
    }
    chunks.push(new Uint8Array(value));
  }
  if (!actual) return new Response(null, { status: 400 });
  const bytes = await new Blob(chunks).arrayBuffer();
  const hash =
    "0x" +
    Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("");
  if (hash !== t.hash) return new Response(null, { status: 422 });
  await bucket.put(t.key, bytes, { onlyIf: { etagDoesNotMatch: "*" } });
  return new Response(null, { status: 204 });
}
