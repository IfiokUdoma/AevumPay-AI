import {
  AbiCoder,
  BrowserProvider,
  Contract,
  ContractFactory,
  Interface,
  JsonRpcProvider,
  ZeroAddress,
  getAddress,
  isAddress,
  keccak256,
  type Eip1193Provider,
  type InterfaceAbi,
  type Provider,
} from "ethers";
import compiled from "./generated/escrow.json";
import {
  CHAIN,
  EXPLORER,
  RPC,
  TOKEN,
  states,
  units,
  decimal,
  randomHex,
  type Terms,
  type Location,
  type Receipt,
  type Evidence,
  type Order,
} from "./obligation";
import { putJSON, loadJSON } from "./documents";
const erc = [
  "function decimals() view returns(uint8)",
  "function balanceOf(address) view returns(uint256)",
  "function allowance(address,address) view returns(uint256)",
  "function approve(address,uint256) returns(bool)",
  "event Transfer(address indexed from,address indexed to,uint256 value)",
];
const abi: InterfaceAbi = compiled.abi;
type Injected = Eip1193Provider & {
  on?: (event: string, fn: () => void) => void;
  removeListener?: (event: string, fn: () => void) => void;
};
export const injected = () =>
  (window as Window & { ethereum?: Injected }).ethereum;
export async function connect() {
  const raw = injected();
  if (!raw)
    throw Error(
      "Open this page in a browser with an EVM wallet such as MetaMask.",
    );
  const id = await raw.request({ method: "eth_chainId" });
  if (BigInt(id) !== BigInt(CHAIN)) {
    try {
      await raw.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0xabe5" }],
      });
    } catch (e) {
      if (Number((e as { code?: number }).code) !== 4902) throw e;
      await raw.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: "0xabe5",
            chainName: "QDay Aevum",
            nativeCurrency: {
              name: "Test QDAY",
              symbol: "tQDAY",
              decimals: 18,
            },
            rpcUrls: [RPC],
            blockExplorerUrls: [EXPLORER],
          },
        ],
      });
      await raw.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0xabe5" }],
      });
    }
  }
  await raw.request({ method: "eth_requestAccounts" });
  const provider = new BrowserProvider(raw);
  if ((await provider.getNetwork()).chainId !== BigInt(CHAIN))
    throw Error("Switch the wallet to QDay Aevum testnet.");
  const signer = await provider.getSigner();
  return { provider, signer, address: await signer.getAddress() };
}
let reader: JsonRpcProvider | undefined;
function readProvider() {
  return (reader ??= new JsonRpcProvider(
    new URL("/api/chain", window.location.origin).href,
    undefined,
    { batchMaxCount: 1 },
  ));
}
async function verified(provider: Provider, address: string) {
  if ((await provider.getNetwork()).chainId !== BigInt(CHAIN))
    throw Error("Unexpected network. Choose QDay Aevum testnet.");
  if (
    !isAddress(address) ||
    keccak256(await provider.getCode(address)) !== compiled.runtimeHash
  )
    throw Error("This address does not contain the expected AevumPay escrow.");
  const c = new Contract(address, abi, provider);
  if (getAddress(await c.token()) !== getAddress(TOKEN))
    throw Error("This escrow uses a different token.");
  return c;
}
export type Pending = {
  terms: Terms;
  capability: string;
  salt: string;
  contract?: string;
  deployment?: string;
  approval?: string;
  funding?: string;
};
const pendingKey = "aevum.funding.v1",
  factoryKey = "aevum.escrow.v1";
export const getPending = (): Pending | null =>
  JSON.parse(localStorage.getItem(pendingKey) || "null");
const keep = (p: Pending) =>
  localStorage.setItem(pendingKey, JSON.stringify(p));
export const clearPending = () => localStorage.removeItem(pendingKey);
export async function discardUnfunded() {
  const pending = getPending();
  if (!pending) return;
  if (pending.funding) {
    const p = readProvider();
    const tx = await p.getTransactionReceipt(pending.funding);
    if (!tx || tx.status === 1)
      throw Error(
        "This funding transaction still needs reconciliation. Resume the order.",
      );
  }
  clearPending();
}
export function sharedURL(loc: Location) {
  return (
    window.location.origin +
    "/#order/" +
    [loc.contract, loc.id, loc.capability].join("/")
  );
}
export function readLink(): Location | undefined {
  const match = window.location.hash.match(
    /^#order\/(0x[0-9a-fA-F]{40})\/(0x[0-9a-f]{64})\/(0x[0-9a-f]{64})$/,
  );
  return match
    ? { contract: match[1], id: match[2], capability: match[3] }
    : undefined;
}
async function settled(p: Provider, hash: string) {
  const receipt = await p.waitForTransaction(hash, 1, 100000);
  if (!receipt)
    throw Error("Confirmation is pending. Refresh this order before retrying.");
  if (receipt.status !== 1) throw Error("The transaction reverted.");
  return receipt;
}
async function recover(
  p: Provider,
  record: Pending,
  field: "deployment" | "approval" | "funding",
) {
  const hash = record[field];
  if (!hash) return;
  const old = await p.getTransactionReceipt(hash);
  if (old?.status === 0) {
    delete record[field];
    keep(record);
    return;
  }
  return old ?? (await settled(p, hash));
}
export async function fund(
  terms: Terms,
  step: (s: string) => void,
): Promise<{ loc: Location; terms: Terms }> {
  const { provider, signer, address } = await connect();
  if (
    !isAddress(terms.supplierWallet) ||
    getAddress(terms.supplierWallet) === getAddress(address) ||
    getAddress(terms.supplierWallet) === ZeroAddress
  )
    throw Error("Enter a distinct, valid supplier wallet address.");
  const pending = getPending() ?? {
    terms: {
      ...terms,
      buyerWallet: address,
      supplierWallet: getAddress(terms.supplierWallet),
    },
    capability: randomHex(),
    salt: randomHex(),
  };
  if (pending.terms.buyerWallet.toLowerCase() !== address.toLowerCase())
    throw Error("Reconnect the buyer wallet that started this order.");
  const t = pending.terms,
    token = new Contract(TOKEN, erc, signer);
  if (Number(await token.decimals()) !== 6)
    throw Error("Unexpected token decimals on this network.");
  const amount = units(t.amount, 6);
  const id = keccak256(
    AbiCoder.defaultAbiCoder().encode(
      ["address", "bytes32"],
      [address, pending.salt],
    ),
  );
  let contract = pending.contract || localStorage.getItem(factoryKey) || "";
  if (!pending.funding && t.deadline * 1000 <= Date.now())
    throw Error("This draft has expired. Start a new payment.");
  if (!pending.funding && BigInt(await token.balanceOf(address)) < amount)
    throw Error(
      "The buyer needs " +
        t.amount +
        " tUSD8. Use the faucet or choose a smaller test amount.",
    );
  keep(pending);
  step("Saving the agreed terms…");
  const termsHash = await putJSON(t, pending.capability);
  if (!contract) {
    step("Confirm escrow deployment in your wallet…");
    const previous = await recover(provider, pending, "deployment");
    if (previous) contract = previous.contractAddress || "";
    else {
      const sent = await new ContractFactory(
        abi,
        compiled.bytecode,
        signer,
      ).deploy(TOKEN);
      pending.deployment = sent.deploymentTransaction()!.hash;
      keep(pending);
      contract =
        (await settled(provider, pending.deployment)).contractAddress || "";
    }
  }
  const checked = await verified(provider, contract);
  pending.contract = contract;
  keep(pending);
  localStorage.setItem(factoryKey, contract);
  const loc = { contract, id, capability: pending.capability };
  if (pending.funding) {
    step("Checking the submitted funding transaction…");
    await recover(provider, pending, "funding");
  }
  if ((await checked.orders(id)).status !== 0n) return { loc, terms: t };
  if (t.deadline * 1000 <= Date.now())
    throw Error("This draft has expired. Start a new payment.");
  if (pending.approval) await recover(provider, pending, "approval");
  if (BigInt(await token.allowance(address, contract)) < amount) {
    step("Approve the exact tUSD8 amount in your wallet…");
    const tx = await token.approve(contract, amount);
    pending.approval = tx.hash;
    keep(pending);
    await settled(provider, tx.hash);
  }
  step("Confirm funding of the payment order…");
  const writer = new Contract(contract, abi, signer);
  const tx = await writer.fund(
    pending.salt,
    t.supplierWallet,
    amount,
    units(t.quantity, 3),
    t.proportional,
    termsHash,
    t.deadline,
  );
  pending.funding = tx.hash;
  keep(pending);
  await settled(provider, tx.hash);
  return { loc, terms: t };
}
export async function readOrder(loc: Location): Promise<Order> {
  const p = readProvider(),
    c = await verified(p, loc.contract),
    row = await c.orders(loc.id);
  if (row.status === 0n)
    throw Error("This order has not been funded on Aevum.");
  const t = await loadJSON<Terms>(row.termsHash, loc.capability);
  if (
    t.version !== 1 ||
    getAddress(t.buyerWallet) !== getAddress(row.buyer) ||
    getAddress(t.supplierWallet) !== getAddress(row.supplier) ||
    units(t.amount, 6) !== row.amount ||
    units(t.quantity, 3) !== row.requiredQty ||
    t.proportional !== row.proportional ||
    BigInt(t.deadline) !== row.deadline
  )
    throw Error("The shared terms do not match the funded order.");
  const evidence =
    row.evidenceHash === "0x" + "0".repeat(64)
      ? undefined
      : await loadJSON<Evidence>(row.evidenceHash, loc.capability);
  if (
    evidence &&
    (units(evidence.reported, 3) !== row.reportedQty ||
      !/^0x[0-9a-f]{64}$/.test(evidence.fileHash))
  )
    throw Error("The document and on-chain reported quantity disagree.");
  const receipts: Receipt[] = [];
  if (row.paid > 0n) {
    const count = Number(await c.payoutCount(loc.id));
    const tokenInterface = new Interface(erc);
    for (let i = Math.max(0, count - 15); i < count; i++) {
      const b = Number(await c.payoutBlock(loc.id, i));
      const [logs, block] = await Promise.all([
        c.queryFilter(c.filters.Reviewed(loc.id), b, b),
        p.getBlock(b),
      ]);
      for (const log of logs) {
        if (!("args" in log)) continue;
        const [, , accepted, released, total, retained] = log.args;
        if (released === 0n) continue;
        const tx = await p.getTransactionReceipt(log.transactionHash);
        const ok =
          tx?.status === 1 &&
          tx.logs.some((l) => {
            if (l.address.toLowerCase() !== TOKEN.toLowerCase()) return false;
            try {
              const e = tokenInterface.parseLog(l);
              return (
                e?.name === "Transfer" &&
                getAddress(e.args[0]) === getAddress(loc.contract) &&
                getAddress(e.args[1]) === getAddress(row.supplier) &&
                e.args[2] === released
              );
            } catch {
              return false;
            }
          });
        if (!ok || !block)
          throw Error(
            "The token transfer could not be reconciled with this receipt.",
          );
        receipts.push({
          mode: "Aevum testnet",
          ref: t.ref,
          supplier: t.supplier,
          buyer: row.buyer,
          recipient: row.supplier,
          amount: decimal(released, 6),
          totalPaid: decimal(total, 6),
          retained: decimal(retained, 6),
          accepted: decimal(accepted, 3),
          unit: t.unit,
          termsHash: row.termsHash,
          evidenceHash: log.args[1],
          date: block.timestamp * 1000,
          txHash: log.transactionHash,
          block: b,
          logIndex: log.index,
          token: TOKEN,
          chainId: CHAIN,
          escrow: loc.contract,
          orderId: loc.id,
        });
      }
    }
  }
  return {
    key: loc.id,
    mode: "live",
    terms: t,
    paid: decimal(row.paid, 6),
    status: states[Number(row.status)],
    reported: decimal(row.reportedQty, 3),
    accepted: decimal(row.acceptedQty, 3),
    termsHash: row.termsHash,
    evidenceHash: row.evidenceHash,
    evidence,
    receipts,
    live: loc,
  };
}
export async function act(
  o: Order,
  action: "proof" | "review" | "refund",
  value: string,
  hash: string,
) {
  if (!o.live) throw Error("Open a funded testnet order.");
  const { provider, signer, address } = await connect();
  const c = await verified(provider, o.live.contract);
  const expected =
    action === "proof" ? o.terms.supplierWallet : o.terms.buyerWallet;
  if (action !== "refund" && address.toLowerCase() !== expected.toLowerCase())
    throw Error(
      "Switch to this order’s " +
        (action === "proof" ? "supplier" : "buyer") +
        " wallet.",
    );
  const key = "aevum.tx." + o.live.id,
    prior = localStorage.getItem(key);
  if (prior) {
    const receipt = await provider.getTransactionReceipt(prior);
    if (!receipt) await settled(provider, prior);
    localStorage.removeItem(key);
    if (receipt?.status !== 0) return;
  }
  const writer = new Contract(o.live.contract, abi, signer);
  const tx =
    action === "proof"
      ? await writer.submitEvidence(o.live.id, hash, units(value, 3))
      : action === "review"
        ? await writer.review(o.live.id, hash, units(value, 3))
        : await writer.refundExpired(o.live.id);
  localStorage.setItem(key, tx.hash);
  await settled(provider, tx.hash);
  localStorage.removeItem(key);
}
