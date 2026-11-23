import {
  example,
  exampleDraft,
  calculate,
  digest,
  jsonBlob,
  units,
  type Terms,
  type Order,
  type Draft,
  type Receipt,
} from "./obligation";
import { saveProof } from "./documents";
const storeKey = "aevumpay.demo.v1";
export function demoSnapshot(): Order[] | null {
  const s = localStorage.getItem(storeKey);
  return s ? JSON.parse(s) : null;
}
export async function withDemo(
  change: (orders: Order[]) => Order[] | Promise<Order[]>,
) {
  const run = async () => {
    const orders = await change(demoSnapshot() ?? []);
    localStorage.setItem(storeKey, JSON.stringify(orders));
    return orders;
  };
  return navigator.locks ? navigator.locks.request(storeKey, run) : run();
}
export function makeTerms(
  d: Draft,
  instruction: string,
  proportional: boolean,
  days: number,
  supplierWallet = "",
  ref?: string,
): Terms {
  const now = Date.now();
  return {
    ...d,
    version: 1,
    ref: ref ?? "AP-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
    instruction,
    proportional,
    created: now,
    deadline: Math.floor(now / 1000) + days * 86400,
    buyerWallet: "",
    supplierWallet,
  };
}
export async function newDemo(t: Terms): Promise<Order> {
  return {
    key: t.ref,
    mode: "demo",
    terms: t,
    status: "Awaiting proof",
    paid: "0",
    reported: "0",
    accepted: "0",
    receipts: [],
    termsHash: await digest(jsonBlob(t)),
    evidenceHash: "",
  };
}
export function sampleNote(o: Order, reported: string) {
  return new File(
    [
      "SAMPLE DELIVERY NOTE\n\nOrder " +
        o.terms.ref +
        "\nSupplier: " +
        o.terms.supplier +
        "\nGoods: " +
        o.terms.item +
        "\nCumulative delivered: " +
        reported +
        " " +
        o.terms.unit +
        "\n\nIllustrative evidence for the demo workspace.\n",
    ],
    "delivery-note-" + o.terms.ref + ".txt",
    { type: "text/plain" },
  );
}
export function applyReview(o: Order, accepted: string): Order {
  if (o.status !== "In review")
    throw Error("This evidence has already been reviewed.");
  const result = calculate(o, accepted);
  const receipt: Receipt = {
    mode: "Demo",
    ref: o.terms.ref,
    supplier: o.terms.supplier,
    buyer: "Demo buyer",
    recipient: o.terms.supplier,
    amount: result.release,
    totalPaid: result.total,
    retained: result.held,
    accepted,
    unit: o.terms.unit,
    termsHash: o.termsHash,
    evidenceHash: o.evidenceHash,
    date: Date.now(),
  };
  return {
    ...o,
    accepted,
    status: result.status,
    paid: result.total,
    receipts:
      units(result.release, 6) > 0n ? [...o.receipts, receipt] : o.receipts,
  };
}
export async function seed() {
  return withDemo(async (all) => {
    if (all.length) return all;
    const rows: [Draft, string, string, boolean][] = [
      [exampleDraft, "40", "", true],
      [
        {
          supplier: "Atlas Cement",
          amount: "300",
          quantity: "30",
          unit: "bags",
          item: "Portland cement",
        },
        "",
        "",
        true,
      ],
      [
        {
          supplier: "Oku Timber",
          amount: "250",
          quantity: "10",
          unit: "bundles",
          item: "Timber planks",
        },
        "6",
        "6",
        true,
      ],
      [
        {
          supplier: "Sitewear Co.",
          amount: "120",
          quantity: "12",
          unit: "pieces",
          item: "Safety helmets",
        },
        "12",
        "12",
        false,
      ],
    ];
    const result: Order[] = [];
    for (const [i, [d, reported, accepted, policy]] of rows.entries()) {
      const t = makeTerms(
        d,
        i === 0
          ? example
          : "Pay " +
              d.supplier +
              " " +
              d.amount +
              " tUSD8 for " +
              d.quantity +
              " " +
              d.unit +
              " of " +
              d.item +
              ".",
        policy,
        14,
        "",
        "AP-" + (1004 - i),
      );
      t.created -= i * 86400000;
      let o = await newDemo(t);
      if (reported) {
        const file = sampleNote(o, reported);
        const proof = await saveProof(
          file,
          "Delivery note supplied for buyer review.",
          reported,
        );
        o = { ...o, ...proof, reported, status: "In review" };
      }
      if (accepted) o = applyReview(o, accepted);
      result.push(o);
    }
    return result;
  });
}
