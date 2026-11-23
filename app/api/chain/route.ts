import { RPC } from "../../../lib/obligation";
const methods = new Set([
  "eth_chainId",
  "eth_getCode",
  "eth_call",
  "eth_getLogs",
  "eth_getBlockByNumber",
  "eth_getBlockByHash",
  "eth_getTransactionReceipt",
  "eth_blockNumber",
  "eth_getBalance",
]);
export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 12000) return new Response(null, { status: 413 });
  let v;
  try {
    v = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 400 });
  }
  if (
    !v ||
    v.jsonrpc !== "2.0" ||
    !methods.has(v.method) ||
    !Array.isArray(v.params)
  )
    return new Response(null, { status: 400 });
  try {
    const result = await fetch(RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(v),
      signal: AbortSignal.timeout(15000),
    });
    return new Response(await result.text(), {
      status: result.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json(
      {
        jsonrpc: "2.0",
        id: v.id,
        error: { code: -32000, message: "Aevum RPC unavailable" },
      },
      { status: 503 },
    );
  }
}
