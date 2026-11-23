"use client";
import { useState } from "react";
import {
  ArrowDownToLine,
  BookOpenCheck,
  Boxes,
  Check,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  FileCheck2,
  FileText,
  Layers3,
  ListFilter,
  PackageCheck,
  Plus,
  ScanLine,
  Search,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import {
  decimal,
  initials,
  money,
  remaining,
  units,
  type Order,
  type Receipt,
  type Status,
} from "../lib/obligation";
import { download } from "../lib/documents";
export function Brand() {
  return (
    <span className="brand">
      <img src="/favicon.svg" alt="" width="35" height="35" />
      <span>
        AevumPay <small>AI</small>
      </span>
    </span>
  );
}
export function Badge({ s }: { s: Status }) {
  const names: Record<Status, string> = {
    Draft: "neutral",
    "Awaiting proof": "queued",
    "In review": "review",
    "Part paid": "partial",
    "On hold": "hold",
    Settled: "paid",
    Refunded: "neutral",
  };
  return (
    <span className={"badge " + names[s]}>
      <i />
      {s}
    </span>
  );
}
export function Currency({ n }: { n: string }) {
  return (
    <>
      {money(n)} <small className="currency">tUSD8</small>
    </>
  );
}
export function PageHead({
  k,
  title,
  subtitle,
  action,
}: {
  k: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <div className="kicker">
          <span />
          {k}
        </div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
export function Ledger({
  orders,
  open,
  onNew,
  full = false,
}: {
  orders: Order[];
  open: (o: Order) => void;
  onNew: () => void;
  full?: boolean;
}) {
  const [filter, setFilter] = useState("All statuses"),
    [query, setQuery] = useState("");
  const list = orders.filter(
    (o) =>
      (filter === "All statuses" || o.status === filter) &&
      [o.terms.item, o.terms.ref, o.terms.supplier]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <section className="panel ledger">
      <div className="section-head">
        <div>
          <h2>{full ? "All obligations" : "Obligation register"}</h2>
        </div>
        <div className="table-tools">
          <label className="searchbox">
            <Search size={16} />
            <input
              aria-label="Search obligations"
              placeholder="Search orders"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label className="selectbox">
            <ListFilter size={15} />
            <select
              aria-label="Filter by status"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              {[
                "All statuses",
                "Awaiting proof",
                "In review",
                "Part paid",
                "On hold",
                "Settled",
                "Refunded",
              ].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Obligation</th>
              <th>Supplier</th>
              <th className="amount">Agreed amount</th>
              <th>Status</th>
              <th aria-label="Open" />
            </tr>
          </thead>
          <tbody>
            {list.map((o, i) => (
              <tr key={o.key} onClick={() => open(o)}>
                <td>
                  <div className="item-cell">
                    <span className={"item-icon tone" + (i % 4)}>
                      {
                        [
                          <Layers3 key="s" />,
                          <Boxes key="c" />,
                          <ClipboardList key="t" />,
                          <PackageCheck key="h" />,
                        ][i % 4]
                      }
                    </span>
                    <span>
                      <button
                        className="row-link"
                        onClick={(e) => {
                          e.stopPropagation();
                          open(o);
                        }}
                      >
                        {o.terms.item}
                      </button>
                      <small className="mono">{o.terms.ref}</small>
                    </span>
                  </div>
                </td>
                <td>{o.terms.supplier}</td>
                <td className="amount">
                  <Currency n={o.terms.amount} />
                </td>
                <td>
                  <Badge s={o.status} />
                </td>
                <td>
                  <ChevronRight size={16} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!list.length && (
        <div className="empty">
          <ClipboardList />
          <h3>
            {orders.length
              ? "No matching obligations"
              : "Your first obligation starts here"}
          </h3>
          <p>
            {orders.length
              ? "Try a different name or status."
              : "Create the agreement, then invite the supplier to submit proof."}
          </p>
          {!orders.length && (
            <button className="outline" onClick={onNew}>
              <Plus size={16} />
              New obligation
            </button>
          )}
        </div>
      )}
    </section>
  );
}
export function Overview({
  orders,
  open,
  onNew,
  live,
}: {
  orders: Order[];
  open: (o: Order) => void;
  onNew: () => void;
  live: boolean;
}) {
  const held = decimal(
      orders.reduce((s, o) => s + units(remaining(o), 6), 0n),
      6,
    ),
    paid = decimal(
      orders.reduce((s, o) => s + units(o.paid, 6), 0n),
      6,
    );
  const active = orders.filter(
      (o) => !["Settled", "Refunded"].includes(o.status),
    ),
    reviews = orders.filter((o) => o.status === "In review"),
    next = reviews[0];
  return (
    <>
      <PageHead
        k="Payment operations"
        title="Settlement overview"
        subtitle="Track supplier obligations, review deliveries and approve releases."
        action={
          <button className="primary" onClick={onNew}>
            <Plus size={17} />
            New obligation
          </button>
        }
      />
      <div className="overview-grid">
        <section className="balance-card">
          <div className="balance-art" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
          <div className="balance-label">
            <span>
              <Wallet size={18} />
            </span>
            Balance in escrow
          </div>
          <div className="balance-value">
            {money(held)} <span>tUSD8</span>
          </div>
          <div className="balance-foot">
            <div>
              <small>Active obligations</small>
              <b>{active.length}</b>
            </div>
            <div>
              <small>Released to suppliers</small>
              <b>
                {money(paid)} <em>tUSD8</em>
              </b>
            </div>
          </div>
        </section>
        <section className="panel priority">
          <div className="priority-top">
            <span className="queue-icon">
              <ScanLine size={19} />
            </span>
            <span className="kicker muted">Review queue</span>
            <span className="count">{reviews.length}</span>
          </div>
          {next ? (
            <>
              <h2>{next.terms.item}</h2>
              <p>
                {next.terms.supplier} reported{" "}
                <strong>
                  {next.reported} of {next.terms.quantity} {next.terms.unit}
                </strong>
                .
              </p>
              <button className="review-btn" onClick={() => open(next)}>
                <FileCheck2 size={16} />
                Review delivery
              </button>
            </>
          ) : (
            <>
              <h2>All caught up</h2>
              <p>Submitted proof will appear here for buyer approval.</p>
            </>
          )}
        </section>
      </div>
      <Ledger orders={orders} open={open} onNew={onNew} />
      <div className="desk-foot">
        <ShieldCheck size={15} />
        {live
          ? "Only your connected wallet can authorise its role’s actions."
          : "Demo workspace · Balances and receipts are simulated."}
      </div>
    </>
  );
}
export function Receipts({
  orders,
  open,
}: {
  orders: Order[];
  open: (o: Order) => void;
}) {
  const all = orders
    .flatMap((o) => o.receipts.map((r, i) => ({ o, r, i })))
    .sort((a, b) => b.r.date - a.r.date);
  return (
    <>
      <PageHead
        k="Reconciliation"
        title="Payment receipts"
        subtitle="Each release links the approved delivery to the amount paid."
      />
      <section className="panel">
        <div className="section-head">
          <h2>Release history</h2>
          <span className="soft-count">
            {all.length} {all.length === 1 ? "receipt" : "receipts"}
          </span>
        </div>
        {all.length ? (
          all.map(({ o, r, i }) => (
            <div className="receipt-line" key={o.key + i}>
              <span className="queue-icon">
                <BookOpenCheck size={19} />
              </span>
              <div>
                <button className="row-link" onClick={() => open(o)}>
                  {o.terms.item}
                </button>
                <small>
                  {r.ref} · {r.mode} · {r.supplier}
                </small>
              </div>
              <strong>
                <Currency n={r.amount} />
              </strong>
              <button
                className="outline compact"
                onClick={() => receiptFile(r)}
                aria-label={"Download receipt for " + r.ref}
              >
                <ArrowDownToLine size={15} />
                <span>Receipt</span>
              </button>
            </div>
          ))
        ) : (
          <div className="empty">
            <FileText />
            <h3>No releases yet</h3>
            <p>Approve a delivery to generate the first receipt.</p>
          </div>
        )}
      </section>
    </>
  );
}
export function receiptFile(r: Receipt) {
  download(
    new Blob([JSON.stringify(r, null, 2)], { type: "application/json" }),
    r.ref + "-" + (r.txHash?.slice(2, 10) ?? r.date) + "-receipt.json",
  );
}
