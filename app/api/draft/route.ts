import {
  parseInstruction,
  emptyDraft,
  type Draft,
} from "../../../lib/obligation";

export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 2500) return new Response(null, { status: 413 });
  let input: string;
  try {
    input = JSON.parse(raw).instruction;
  } catch {
    return new Response(null, { status: 400 });
  }
  if (typeof input !== "string" || !input.trim() || input.length > 1200)
    return new Response(null, { status: 400 });
  const fallback = parseInstruction(input);
  const key = process.env.OPENAI_API_KEY;
  if (!key)
    return Response.json({ draft: fallback, source: "Built-in parser" });
  try {
    const props = Object.fromEntries(
      Object.keys(emptyDraft).map((k) => [k, { type: "string" }]),
    );
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: AbortSignal.timeout(12000),
      headers: {
        Authorization: "Bearer " + key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        store: false,
        max_output_tokens: 350,
        instructions:
          "Extract supplier name, tUSD8 amount, quantity, unit and item from one supplier payment instruction. A bare dollar amount is entered as test tUSD8. Use decimal strings without commas. Leave absent, unsupported currency, or genuinely ambiguous fields empty. Preserve units and description. Never select wallets, payment policy or execute any action.",
        input,
        text: {
          format: {
            type: "json_schema",
            name: "obligation_draft",
            strict: true,
            schema: {
              type: "object",
              properties: props,
              required: Object.keys(props),
              additionalProperties: false,
            },
          },
        },
      }),
    });
    if (!response.ok) throw Error();
    const value = (await response.json()) as {
      status?: string;
      output?: { content?: { type: string; text?: string }[] }[];
    };
    const block = value.output
      ?.flatMap((x) => x.content ?? [])
      .find((x) => x.type === "output_text")?.text;
    if (value.status !== "completed" || !block) throw Error();
    const result = JSON.parse(block) as Draft;
    if (
      Object.keys(emptyDraft).some(
        (k) => typeof result[k as keyof Draft] !== "string",
      )
    )
      throw Error();
    return Response.json({ draft: result, source: "AI draft" });
  } catch {
    return Response.json({
      draft: fallback,
      source: "Built-in parser · AI unavailable",
    });
  }
}
