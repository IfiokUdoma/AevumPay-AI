"use client";
import { useEffect, useState } from "react";
import {
  ArrowDownToLine,
  Check,
  CheckCheck,
  ClipboardCheck,
  Copy,
  ExternalLink,
  FileCheck2,
  FileText,
  Fingerprint,
  Link2,
  RefreshCw,
  ShieldCheck,
  Upload,
  Wallet,
} from "lucide-react";
import {
  calculate,
  decimal,
  errText,
  EXPLORER,
  money,
  remaining,
  short,
  units,
  type Order,
} from "../lib/obligation";
import { download, loadBlob, saveProof } from "../lib/documents";
import { applyReview, sampleNote } from "../lib/demo";
import { act, sharedURL } from "../lib/live";
import { Badge, Currency, PageHead, receiptFile } from "./DeskParts";

type Props = {
  o: Order;
  wallet: string;
  connect: () => Promise<void>;
  refresh: () => Promise<void>;
  mutate: (fn: (old: Order) => Order) => Promise<void>;
};
export default function OrderDetail({
  o,
  wallet,
  connect,
  refresh,
  mutate,
}: Props) {
  const live = o.mode === "live",
    [role, setRole] = useState<"buyer" | "supplier">(
      o.status === "Awaiting proof" ? "supplier" : "buyer",
    );
  const [file, setFile] = useState<File>(),
    [note, setNote] = useState(""),
    [reported, setReported] = useState(
      o.reported === "0" ? o.terms.quantity : o.reported,
    );
  const [accepted, setAccepted] = useState(o.reported),
    [ack, setAck] = useState(false),
    [inspected, setInspected] = useState(""),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [inspecting, setInspecting] = useState(false);
  const activeRole = live
    ? wallet.toLowerCase() === o.terms.buyerWallet.toLowerCase() && wallet
      ? "buyer"
      : wallet.toLowerCase() === o.terms.supplierWallet.toLowerCase() && wallet
        ? "supplier"
        : "viewer"
    : role;
  const expired = Date.now() / 1000 >= o.terms.deadline,
    closed = ["Settled", "Refunded"].includes(o.status);
  useEffect(() => {
    setAccepted(o.reported);
    setAck(false);
    setInspected("");
    setInspecting(false);
  }, [o.evidenceHash, o.reported]);
  let quote;
  try {
    quote = calculate(o, accepted);
  } catch {}
  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy("");
    }
  }
  async function prove() {
    const qty = units(reported, 3);
    if (
      qty === 0n ||
      qty < units(o.accepted, 3) ||
      qty > units(o.terms.quantity, 3)
    )
      throw Error(
        "Enter a cumulative quantity between the accepted amount and the order total.",
      );
    if (!file) throw Error("Attach a delivery note or choose the sample note.");
    const normalized = decimal(qty, 3);
    const proof = await saveProof(file, note, normalized, o.live?.capability);
    if (live) {
      await act(o, "proof", normalized, proof.evidenceHash);
      await refresh();
    } else
      await mutate((old) => {
        if (
          ["Settled", "Refunded"].includes(old.status) ||
          old.terms.deadline * 1000 <= Date.now() ||
          qty < units(old.accepted, 3)
        )
          throw Error("This order changed. Refresh before adding proof.");
        return { ...old, ...proof, reported: normalized, status: "In review" };
      });
    setFile(undefined);
    setNote("");
    setRole("buyer");
    setNotice("Evidence submitted for buyer review.");
  }
  async function inspect() {
    if (!o.evidence) throw Error("This delivery has no proof file.");
    const blob = await loadBlob(o.evidence.fileHash, o.live?.capability);
    if (blob.size !== o.evidence.size)
      throw Error("The proof file size has changed.");
    download(blob, o.evidence.name);
    setInspected(o.evidenceHash);
    setInspecting(true);
    setNotice(
      "Evidence fingerprint verified. Review the downloaded delivery note.",
    );
  }
  async function review() {
    if (!ack || inspected !== o.evidenceHash)
      throw Error("Review the evidence and confirm the delivery first.");
    calculate(o, accepted);
    if (live) {
      await act(o, "review", accepted, o.evidenceHash);
      await refresh();
    } else
      await mutate((old) => {
        if (
          old.evidenceHash !== o.evidenceHash ||
          old.terms.deadline * 1000 <= Date.now()
        )
          throw Error(
            "The delivery evidence or deadline changed. Review the order again.",
          );
        return applyReview(old, accepted);
      });
    setAck(false);
    setNotice("Buyer decision recorded.");
  }
  async function refund() {
    if (live) {
      await act(o, "refund", "0", "");
      await refresh();
    } else
      await mutate((old) => {
        if (
          old.terms.deadline * 1000 > Date.now() ||
          ["Settled", "Refunded"].includes(old.status)
        )
          throw Error("This order is not eligible for a refund.");
        return { ...old, status: "Refunded" };
      });
    setNotice("The unpaid balance was returned to the buyer.");
  }
  return (
    <>
      <PageHead
        k={
          o.terms.ref +
          "  /  " +
          (live ? "QDay Aevum testnet" : "Demo obligation")
        }
        title={o.terms.item}
        subtitle={o.terms.supplier}
        action={<Badge s={o.status} />}
      />
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="notice" role="status">
          <Check size={16} />
          {notice}
        </div>
      )}
      <div className="detail-layout">
        <div className="detail-main">
          <section className="panel pad">
            <div className="heading-icon">
              <span className="queue-icon">
                <ClipboardCheck size={18} />
              </span>
              <h2>Agreed terms</h2>
            </div>
            <blockquote>{o.terms.instruction}</blockquote>
            <div className="facts">
              <div>
                <small>Agreed amount</small>
                <b>
                  <Currency n={o.terms.amount} />
                </b>
              </div>
              <div>
                <small>Required delivery</small>
                <b>
                  {o.terms.quantity} {o.terms.unit}
                </b>
              </div>
              <div>
                <small>Settlement rule</small>
                <b>
                  {o.terms.proportional
                    ? "Proportional release"
                    : "Full delivery only"}
                </b>
              </div>
              <div>
                <small>Approval deadline</small>
                <b>
                  {new Date(o.terms.deadline * 1000).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </b>
              </div>
            </div>
          </section>
          <section className="panel pad">
            <div className="section-head flat">
              <h2>Delivery workspace</h2>
              {!live && (
                <div className="seg" aria-label="Demo role">
                  {(["buyer", "supplier"] as const).map((v) => (
                    <button
                      key={v}
                      aria-pressed={role === v}
                      onClick={() => {
                        setRole(v);
                        setError("");
                        setNotice("");
                      }}
                    >
                      {v === "buyer" ? "Buyer" : "Supplier"}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {live && (
              <div className="notice">
                <Wallet size={16} />
                {wallet
                  ? "Connected as " + activeRole
                  : "Connect the buyer or supplier wallet."}
                {!wallet && (
                  <button
                    className="text-btn"
                    onClick={() => void run("Connecting", connect)}
                  >
                    Connect wallet
                  </button>
                )}
              </div>
            )}
            {o.evidence && (
              <div className="document">
                <span className="item-icon">
                  <FileText size={20} />
                </span>
                <div>
                  <strong>{o.evidence.name}</strong>
                  <small>
                    {o.reported} {o.terms.unit} reported ·{" "}
                    {(o.evidence.size / 1024).toFixed(1)} KB
                  </small>
                  {o.evidence.note && <small>{o.evidence.note}</small>}
                </div>
                <button
                  className="outline compact"
                  disabled={!!busy}
                  onClick={() => void run("Retrieving file", inspect)}
                >
                  <ArrowDownToLine size={15} />
                  {inspecting ? "Download again" : "Review file"}
                </button>
              </div>
            )}
            {closed ? (
              <p className="subtle">
                {o.status === "Settled"
                  ? "The buyer has approved the full delivery."
                  : "The unpaid balance has been refunded."}
              </p>
            ) : expired ? (
              <>
                <p>
                  The approval window has ended. The unpaid balance can now be
                  returned to the buyer.
                </p>
                <button
                  className="outline"
                  disabled={!!busy || (live && !wallet)}
                  onClick={() => void run("Returning balance", refund)}
                >
                  Return unpaid balance
                </button>
              </>
            ) : activeRole === "supplier" ? (
              <div className="spaced">
                <label className="field">
                  Total delivered to date ({o.terms.unit})
                  <input
                    inputMode="decimal"
                    value={reported}
                    onChange={(e) => {
                      setReported(e.target.value);
                      setFile(undefined);
                    }}
                  />
                </label>
                <label className="field">
                  Delivery document
                  <input
                    type="file"
                    accept="application/pdf,image/png,image/jpeg,text/plain"
                    onChange={(e) => setFile(e.target.files?.[0])}
                  />
                </label>
                {!live && (
                  <button
                    className="text-btn"
                    onClick={() => {
                      setFile(sampleNote(o, reported));
                      setError("");
                    }}
                  >
                    Use a sample delivery note
                  </button>
                )}
                {file && (
                  <small className="source-note">Selected · {file.name}</small>
                )}
                <label className="field">
                  Delivery note (optional)
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={400}
                  />
                </label>
                <button
                  className="primary"
                  disabled={!!busy || !file}
                  onClick={() => void run("Submitting proof", prove)}
                >
                  <Upload size={16} />
                  Submit delivery evidence
                </button>
              </div>
            ) : activeRole === "buyer" && o.status === "In review" ? (
              <div className="spaced">
                <label className="field">
                  Total quantity you accept ({o.terms.unit})
                  <input
                    aria-label="Total quantity you accept"
                    inputMode="decimal"
                    value={accepted}
                    onChange={(e) => {
                      setAccepted(e.target.value);
                      setAck(false);
                    }}
                  />
                </label>
                <div className="calc">
                  <div>
                    <small>Release now</small>
                    <b>
                      <Currency n={quote?.release ?? "0"} />
                    </b>
                  </div>
                  <div>
                    <small>Keep in escrow</small>
                    <b>
                      <Currency n={quote?.held ?? remaining(o)} />
                    </b>
                  </div>
                </div>
                <label className="ack">
                  <input
                    type="checkbox"
                    disabled={inspected !== o.evidenceHash}
                    checked={ack}
                    onChange={(e) => setAck(e.target.checked)}
                  />
                  I reviewed the delivery file and confirm the accepted
                  quantity.
                </label>
                <button
                  className="primary"
                  disabled={!ack || !quote || !!busy}
                  onClick={() => void run("Recording approval", review)}
                >
                  <ShieldCheck size={16} />
                  {quote?.release === "0" ? "Confirm hold" : "Approve release"}
                </button>
              </div>
            ) : (
              <p className="subtle">
                {o.status === "Awaiting proof"
                  ? "The supplier can now submit the first delivery note."
                  : o.status === "In review"
                    ? "The buyer can review the submitted delivery."
                    : "The supplier can submit further evidence for the outstanding balance."}
              </p>
            )}
            {busy && (
              <small role="status" className="source-note">
                {busy}…
              </small>
            )}
          </section>
        </div>
        <aside className="detail-aside">
          <section className="panel pad">
            <h2>Settlement record</h2>
            <dl className="stack-facts">
              <div>
                <dt>Accepted to date</dt>
                <dd>
                  {o.accepted} / {o.terms.quantity} {o.terms.unit}
                </dd>
              </div>
              <div>
                <dt>Released</dt>
                <dd>
                  <Currency n={o.paid} />
                </dd>
              </div>
              <div>
                <dt>In escrow</dt>
                <dd>
                  <Currency n={remaining(o)} />
                </dd>
              </div>
            </dl>
            {o.receipts
              .slice()
              .reverse()
              .map((r, i) => (
                <div className="receipt-small" key={r.date + "-" + i}>
                  <div>
                    <FileCheck2 size={16} /> {money(r.amount)} tUSD8
                  </div>
                  <button className="text-btn" onClick={() => receiptFile(r)}>
                    Download {live ? "" : "demo "}receipt
                  </button>
                  {r.txHash && (
                    <a
                      target="_blank"
                      rel="noreferrer"
                      href={EXPLORER + "/tx/" + r.txHash}
                    >
                      View transaction <ExternalLink size={13} />
                    </a>
                  )}
                </div>
              ))}
            {!o.receipts.length && (
              <small className="subtle">
                A receipt is generated for each release.
              </small>
            )}
          </section>
          <section className="panel pad">
            <div className="heading-icon">
              <Fingerprint size={19} />
              <h3>Verification</h3>
            </div>
            <dl className="stack-facts">
              <div>
                <dt>Terms fingerprint</dt>
                <dd className="mono" title={o.termsHash}>
                  {short(o.termsHash)}
                </dd>
              </div>
              {o.evidence && (
                <div>
                  <dt>Evidence fingerprint</dt>
                  <dd className="mono" title={o.evidenceHash}>
                    {short(o.evidenceHash)}
                  </dd>
                </div>
              )}
              {live && (
                <>
                  <div>
                    <dt>Buyer</dt>
                    <dd className="mono" title={o.terms.buyerWallet}>
                      {short(o.terms.buyerWallet)}
                    </dd>
                  </div>
                  <div>
                    <dt>Supplier</dt>
                    <dd className="mono" title={o.terms.supplierWallet}>
                      {short(o.terms.supplierWallet)}
                    </dd>
                  </div>
                </>
              )}
            </dl>
            {live && o.live ? (
              <>
                <button
                  className="outline compact"
                  onClick={() =>
                    void run("Copying link", async () => {
                      await navigator.clipboard.writeText(sharedURL(o.live!));
                      setNotice(
                        "Order link copied. Anyone with site access and this link can read the documents.",
                      );
                    })
                  }
                >
                  <Link2 size={15} />
                  Copy order link
                </button>
                <button
                  className="text-btn"
                  onClick={() => void run("Refreshing", refresh)}
                >
                  <RefreshCw size={14} />
                  Refresh from chain
                </button>
              </>
            ) : (
              <small className="subtle">
                Demo record · stored on this device.
              </small>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
