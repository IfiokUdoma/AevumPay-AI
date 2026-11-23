export const CHAIN = 44005;
export const RPC = "https://rpc-test.qday.info";
export const EXPLORER = "https://explorer-test.qday.info";
export const TOKEN = "0x456569838f1d43009A91ebA4263147Afd7233483";
export const example =
  "Pay Supplier A 500 tUSD8 when 50 kg of steel rods arrive.";
export const states = [
  "Draft",
  "Awaiting proof",
  "In review",
  "Part paid",
  "On hold",
  "Settled",
  "Refunded",
] as const;
export type Status = (typeof states)[number];
export type Draft = {
  supplier: string;
  amount: string;
  quantity: string;
  unit: string;
  item: string;
};
export type Terms = Draft & {
  version: 1;
  ref: string;
  instruction: string;
  proportional: boolean;
  deadline: number;
  created: number;
  buyerWallet: string;
  supplierWallet: string;
};
export type Evidence = {
  name: string;
  type: string;
  size: number;
  fileHash: string;
  note: string;
  reported: string;
};
export type Location = { contract: string; id: string; capability: string };
export type Receipt = {
  mode: "Demo" | "Aevum testnet";
  ref: string;
  supplier: string;
  buyer: string;
  recipient: string;
  amount: string;
  totalPaid: string;
  retained: string;
  accepted: string;
  unit: string;
  termsHash: string;
  evidenceHash: string;
  date: number;
  txHash?: string;
  block?: number;
  logIndex?: number;
  token?: string;
  chainId?: number;
  escrow?: string;
  orderId?: string;
};
export type Order = {
  key: string;
  mode: "demo" | "live";
  terms: Terms;
  status: Status;
  paid: string;
  reported: string;
  accepted: string;
  termsHash: string;
  evidenceHash: string;
  evidence?: Evidence;
  receipts: Receipt[];
  live?: Location;
};
export const emptyDraft: Draft = {
  supplier: "",
  amount: "",
  quantity: "",
  unit: "",
  item: "",
};
export const exampleDraft: Draft = {
  supplier: "Supplier A",
  amount: "500",
  quantity: "50",
  unit: "kg",
  item: "Steel rods",
};

export function units(value: string, places: number): bigint {
  const s = String(value).trim();
  if (!/^\d+(?:\.\d+)?$/.test(s) || s.length > 44)
    throw Error("Enter a positive decimal number.");
  const [whole, part = ""] = s.split(".");
  if (part.length > places)
    throw Error("Use up to " + places + " decimal places.");
  return BigInt(whole + part.padEnd(places, "0"));
}
export function decimal(n: bigint, places: number): string {
  const text = n.toString().padStart(places + 1, "0");
  const fraction = text.slice(-places).replace(/0+$/, "");
  return text.slice(0, -places) + (fraction ? "." + fraction : "");
}
export function money(n: string): string {
  const [whole, frac] = n.split(".");
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (frac ? "." + frac : "");
}
export function remaining(o: Order) {
  return o.status === "Refunded"
    ? "0"
    : decimal(units(o.terms.amount, 6) - units(o.paid, 6), 6);
}
export function validate(d: Draft) {
  if (
    ![d.supplier, d.item, d.unit].every(
      (v) => typeof v === "string" && v.trim().length && v.length <= 160,
    )
  )
    throw Error("Enter the supplier, goods and unit of measure.");
  const amount = units(d.amount, 6),
    qty = units(d.quantity, 3);
  if (amount === 0n || qty === 0n)
    throw Error("Amount and quantity must both be greater than zero.");
  if (amount >= 2n ** 128n || qty >= 2n ** 64n)
    throw Error("The amount or quantity is too large.");
}
export function calculate(
  o: Pick<Order, "terms" | "paid" | "accepted" | "reported">,
  accepted: string,
) {
  const qty = units(accepted, 3),
    target = units(o.terms.quantity, 3);
  if (qty < units(o.accepted, 3) || qty > units(o.reported, 3) || qty > target)
    throw Error(
      "Accepted quantity must be between the previous acceptance and the supplier’s reported total.",
    );
  const amount = units(o.terms.amount, 6);
  const earned =
    qty === target
      ? amount
      : o.terms.proportional
        ? (amount * qty) / target
        : 0n;
  const delta = earned - units(o.paid, 6);
  if (delta < 0n)
    throw Error("The accepted quantity would reverse an earlier payment.");
  return {
    release: decimal(delta, 6),
    total: decimal(earned, 6),
    held: decimal(amount - earned, 6),
    status: (qty === target
      ? "Settled"
      : delta > 0n
        ? "Part paid"
        : "On hold") as Status,
  };
}
export function parseInstruction(input: string): Draft {
  const txt = input.trim().replace(/\s+/g, " ");
  const num = "(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?";
  const m = txt.match(
    new RegExp(
      "(?:\\$\\s*(" + num + ")|\\b(" + num + ")\\s*(?:tUSD8|USD|dollars?)\\b)",
      "i",
    ),
  );
  const q = txt.match(
    new RegExp(
      "\\b(" +
        num +
        ")\\s*(kg|kilograms?|tonnes?|tons?|bags?|units?|pieces?|metres?|meters?|litres?|liters?|boxes|crates?|sheets?|rolls?|pairs?)\\b(?:\\s+of)?\\s+(.+?)(?:\\s+(?:arrive|have arrived|are delivered|is delivered|are received|is received|by\\s+\\w+day)\\b|[.;!?]|$)",
      "i",
    ),
  );
  let supplier = "";
  if (m && m.index !== undefined) {
    const before = txt.slice(0, m.index),
      after = txt.slice(m.index + m[0].length);
    supplier = (
      after.match(
        /^\s*(?:payment\s+)?to\s+(.+?)(?=\s+(?:when|once|upon|after|for|if|on delivery)\b|[.;!?]|$)/i,
      )?.[1] ||
      before.match(
        /\b(?:pay|send|release|transfer)\s+(?:to\s+)?(.+?)\s*$/i,
      )?.[1] ||
      ""
    ).trim();
  }
  const item = (q?.[3] || "").trim().replace(/[.,]+$/, "");
  return {
    supplier,
    amount: (m?.[1] || m?.[2] || "").replaceAll(",", ""),
    quantity: (q?.[1] || "").replaceAll(",", ""),
    unit: /^kilograms?$/i.test(q?.[2] || "") ? "kg" : q?.[2] || "",
    item: item ? item[0].toUpperCase() + item.slice(1) : "",
  };
}
export async function digest(blob: Blob) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()),
  );
  return (
    "0x" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
  );
}
export function randomHex(bytes = 32) {
  return (
    "0x" +
    Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("")
  );
}
export function jsonBlob(value: unknown) {
  return new Blob([JSON.stringify(value)], { type: "application/json" });
}
export function short(value: string) {
  return value.length > 20 ? value.slice(0, 7) + "…" + value.slice(-5) : value;
}
export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}
export function errText(e: unknown) {
  const x = e as {
    code?: number | string;
    shortMessage?: string;
    message?: string;
  };
  if (x?.code === 4001 || x?.code === "ACTION_REJECTED")
    return "Wallet request cancelled. Your order is available to retry.";
  return (
    x?.shortMessage ||
    x?.message ||
    "The request could not be completed."
  ).slice(0, 270);
}
