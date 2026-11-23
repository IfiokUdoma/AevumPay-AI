"use client";
import { useEffect, useState } from "react";
import {
  Activity,
  ArrowLeft,
  BookOpenCheck,
  Boxes,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  ExternalLink,
  FlaskConical,
  Layers3,
  LayoutGrid,
  Link2,
  Menu,
  Network,
  PanelLeftClose,
  Plus,
  Radio,
  ShieldCheck,
  Wallet,
  X,
} from "lucide-react";
import {
  Brand,
  Ledger,
  Overview,
  PageHead,
  Receipts,
} from "../components/DeskParts";
import NewOrder from "../components/NewOrder";
import OrderDetail from "../components/OrderDetail";
import {
  CHAIN,
  EXPLORER,
  RPC,
  TOKEN,
  errText,
  short,
  type Location,
  type Order,
  type Terms,
} from "../lib/obligation";
import { demoSnapshot, newDemo, seed, withDemo } from "../lib/demo";
import {
  clearPending,
  discardUnfunded,
  connect,
  fund,
  getPending,
  injected,
  readLink,
  readOrder,
} from "../lib/live";
type Page = "desk" | "orders" | "receipts" | "network" | "detail" | "new";
type Mode = "demo" | "live";
const refsKey = "aevumpay.references.v1";
function refs(): Location[] {
  return JSON.parse(localStorage.getItem(refsKey) || "[]");
}
function remember(loc: Location) {
  const entries = refs().filter(
    (x) =>
      x.id !== loc.id ||
      x.contract.toLowerCase() !== loc.contract.toLowerCase(),
  );
  localStorage.setItem(refsKey, JSON.stringify([loc, ...entries]));
}
const nav = [
  { id: "desk" as Page, label: "Overview", icon: LayoutGrid },
  { id: "orders" as Page, label: "Obligations", icon: Layers3 },
  { id: "receipts" as Page, label: "Receipts", icon: BookOpenCheck },
];
export default function Desk() {
  const [mode, setMode] = useState<Mode>("demo"),
    [page, setPage] = useState<Page>("desk"),
    [demo, setDemo] = useState<Order[]>([]),
    [live, setLive] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true),
    [active, setActive] = useState(""),
    [wallet, setWallet] = useState(""),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [mobile, setMobile] = useState(false),
    [pending, setPending] = useState(false);
  const orders = mode === "demo" ? demo : live,
    current = orders.find((o) => o.key === active);
  async function loadLive(extra?: Location) {
    const locations = refs();
    if (
      extra &&
      !locations.some(
        (x) =>
          x.id === extra.id &&
          x.contract.toLowerCase() === extra.contract.toLowerCase(),
      )
    )
      locations.unshift(extra);
    const list = await Promise.allSettled(locations.map(readOrder));
    const valid = list
      .filter(
        (s): s is PromiseFulfilledResult<Order> => s.status === "fulfilled",
      )
      .map((s) => s.value);
    setLive(valid);
    if (extra && valid.some((o) => o.key === extra.id)) remember(extra);
    const bad = list.find((s) => s.status === "rejected");
    if (bad?.status === "rejected") throw bad.reason;
  }
  useEffect(() => {
    let mounted = true;
    async function boot() {
      try {
        const result = await seed();
        if (!mounted) return;
        setDemo(result);
        setPending(!!getPending());
        const link = readLink();
        const saved: Mode =
          link || localStorage.getItem("aevum.mode") === "live"
            ? "live"
            : "demo";
        setMode(saved);
        if (saved === "live") {
          if (link) {
            setActive(link.id);
            setPage("detail");
          }
          await loadLive(link);
        }
      } catch (e) {
        if (mounted) setError(errText(e));
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void boot();
    const store = () => {
      const d = demoSnapshot();
      if (d) setDemo(d);
    };
    const provider = injected();
    const reset = () => setWallet("");
    const hash = () => {
      const l = readLink();
      if (l) {
        setMode("live");
        setPage("detail");
        setActive(l.id);
        setLoading(true);
        void loadLive(l)
          .catch((e) => setError(errText(e)))
          .finally(() => setLoading(false));
      }
    };
    window.addEventListener("storage", store);
    window.addEventListener("hashchange", hash);
    provider?.on?.("accountsChanged", reset);
    provider?.on?.("chainChanged", reset);
    return () => {
      mounted = false;
      window.removeEventListener("storage", store);
      window.removeEventListener("hashchange", hash);
      provider?.removeListener?.("accountsChanged", reset);
      provider?.removeListener?.("chainChanged", reset);
    };
  }, []);
  function go(p: Page) {
    setPage(p);
    setMobile(false);
    setError("");
    if (window.location.hash)
      history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
    window.scrollTo({ top: 0 });
  }
  async function switchMode(m: Mode) {
    go("desk");
    setMode(m);
    localStorage.setItem("aevum.mode", m);
    setPending(!!getPending());
    if (m === "live") {
      setLoading(true);
      try {
        await loadLive();
      } catch (e) {
        setError(errText(e));
      } finally {
        setLoading(false);
      }
    }
  }
  function open(o: Order) {
    go("detail");
    setActive(o.key);
    if (o.live)
      history.replaceState(
        null,
        "",
        "#order/" + [o.live.contract, o.live.id, o.live.capability].join("/"),
      );
  }
  async function connectWallet() {
    try {
      const r = await connect();
      setWallet(r.address);
      setError("");
    } catch (e) {
      setError(errText(e));
    }
  }
  async function create(t: Terms) {
    setBusy(mode === "demo" ? "Creating obligation…" : "Connecting wallet…");
    setError("");
    try {
      if (mode === "demo") {
        const order = await newDemo(t);
        setDemo(await withDemo((a) => [order, ...a]));
        open(order);
      } else {
        const { loc, terms } = await fund(t, setBusy);
        remember(loc);
        const order = await readOrder(loc);
        setWallet(terms.buyerWallet);
        clearPending();
        setPending(false);
        setLive((all) => [order, ...all.filter((x) => x.key !== order.key)]);
        open(order);
      }
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy("");
      setPending(!!getPending());
    }
  }
  async function refresh() {
    if (!current?.live) return;
    const updated = await readOrder(current.live);
    setLive((rows) => rows.map((o) => (o.key === updated.key ? updated : o)));
  }
  async function mutate(fn: (old: Order) => Order) {
    if (!current) return;
    setDemo(
      await withDemo((all) =>
        all.map((o) => (o.key === current.key ? fn(o) : o)),
      ),
    );
  }
  const pageName: Record<Page, string> = {
    desk: "Overview",
    orders: "Obligations",
    receipts: "Receipts",
    network: "Network",
    new: "New obligation",
    detail: "Obligation details",
  };
  return (
    <div className="shell">
      {mobile && (
        <button
          className="scrim"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={"side" + (mobile ? " open" : "")}>
        <a
          className="brand-link"
          href="#desk"
          onClick={(e) => {
            e.preventDefault();
            go("desk");
          }}
        >
          <Brand />
        </a>
        <div className="workspace">
          <span className="workspace-icon">
            <Boxes size={18} />
          </span>
          <div>
            <b>Procurement desk</b>
            <small>Supplier payments</small>
          </div>
        </div>
        <span className="side-label">Workspace</span>
        <nav aria-label="Workspace navigation">
          {nav.map((n) => (
            <button
              key={n.id}
              className={
                page === n.id ||
                (n.id === "orders" && ["detail", "new"].includes(page))
                  ? "active"
                  : ""
              }
              onClick={() => go(n.id)}
            >
              <n.icon size={18} />
              {n.label}
              {n.id === "orders" && orders.length > 0 && (
                <span>{orders.length}</span>
              )}
            </button>
          ))}
        </nav>
        <span className="side-label second">Configuration</span>
        <nav>
          <button
            className={page === "network" ? "active" : ""}
            onClick={() => go("network")}
          >
            <Network size={18} />
            Network
          </button>
        </nav>
        <div className="side-bottom">
          <div className="network-mini">
            <div className="network-shape">
              <Layers3 size={20} />
            </div>
            <div>
              <b>QDay Aevum</b>
              <small>Testnet · 44005</small>
            </div>
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <button
            className="mobile-menu"
            aria-label="Open navigation"
            onClick={() => setMobile(true)}
          >
            <Menu size={21} />
          </button>
          <div className="crumb">
            Workspace <ChevronRight size={14} />
            <strong>{pageName[page]}</strong>
          </div>
          <div className="top-actions">
            <label className={"mode " + (mode === "live" ? "net" : "")}>
              <i />
              <select
                disabled={!!busy}
                aria-label="Settlement environment"
                value={mode}
                onChange={(e) => void switchMode(e.target.value as Mode)}
              >
                <option value="demo">Demo workspace</option>
                <option value="live">Aevum testnet</option>
              </select>
              <ChevronDown size={13} />
            </label>
            {mode === "live" ? (
              <button
                className="outline compact"
                disabled={!!busy}
                onClick={() => void connectWallet()}
              >
                <Wallet size={15} />
                {wallet ? short(wallet) : "Connect wallet"}
              </button>
            ) : (
              <span
                className="top-emblem"
                aria-label="Demo procurement workspace"
              >
                <Boxes size={16} />
              </span>
            )}
          </div>
        </header>
        <div className="content">
          {error && (
            <div className="error global" role="alert">
              <span>{error}</span>
              <button onClick={() => setError("")} aria-label="Dismiss message">
                <X size={15} />
              </button>
            </div>
          )}
          {["new", "detail"].includes(page) && (
            <button className="back" onClick={() => go("desk")}>
              <ArrowLeft size={15} />
              Back to overview
            </button>
          )}
          {loading ? (
            <div className="panel pad">
              <p role="status">Loading your payment desk…</p>
            </div>
          ) : page === "desk" ? (
            <Overview
              orders={orders}
              open={open}
              live={mode === "live"}
              onNew={() => go("new")}
            />
          ) : page === "orders" ? (
            <>
              <PageHead
                k="Payment operations"
                title="Obligations"
                subtitle="Agreed terms, delivery status and available balances."
                action={
                  <button className="primary" onClick={() => go("new")}>
                    <Plus size={16} />
                    New obligation
                  </button>
                }
              />
              <Ledger
                full
                orders={orders}
                open={open}
                onNew={() => go("new")}
              />
            </>
          ) : page === "receipts" ? (
            <Receipts orders={orders} open={open} />
          ) : page === "new" ? (
            <NewOrder
              key={mode}
              live={mode === "live"}
              submit={create}
              pending={pending}
              busy={busy}
              discard={async () => {
                try {
                  await discardUnfunded();
                  setPending(!!getPending());
                  setError("");
                } catch (e) {
                  setError(errText(e));
                }
              }}
              resume={async () => {
                const p = getPending();
                if (p) await create(p.terms);
              }}
            />
          ) : page === "detail" && current ? (
            <OrderDetail
              key={current.key}
              o={current}
              wallet={wallet}
              connect={connectWallet}
              mutate={mutate}
              refresh={refresh}
            />
          ) : page === "detail" ? (
            <section className="panel pad">
              <h2>Order could not be loaded</h2>
              <p>Check the original order link and the network connection.</p>
              <button
                className="outline"
                onClick={() => {
                  const link = readLink();
                  if (link)
                    void loadLive(link).catch((e) => setError(errText(e)));
                }}
              >
                Retry loading order
              </button>
            </section>
          ) : (
            <>
              <PageHead
                k="Configuration"
                title="Settlement network"
                subtitle="Wallet-signed supplier payments run on QDay Aevum testnet."
              />
              <section className="panel pad form-panel">
                <div className="heading-icon">
                  <span className="queue-icon">
                    <Network size={18} />
                  </span>
                  <h2>QDay Aevum</h2>
                </div>
                <dl className="network-facts">
                  <div>
                    <dt>Chain ID</dt>
                    <dd>{CHAIN}</dd>
                  </div>
                  <div>
                    <dt>Payment asset</dt>
                    <dd>tUSD8 · 6 decimals</dd>
                  </div>
                  <div>
                    <dt>Gas token</dt>
                    <dd>tQDAY</dd>
                  </div>
                  <div>
                    <dt>Token contract</dt>
                    <dd className="mono">{TOKEN}</dd>
                  </div>
                  <div>
                    <dt>RPC endpoint</dt>
                    <dd>{RPC}</dd>
                  </div>
                </dl>
                <div className="form-actions">
                  <a
                    className="outline"
                    target="_blank"
                    rel="noreferrer"
                    href="https://faucet.qday.info"
                  >
                    Get test tokens <ExternalLink size={14} />
                  </a>
                  <a
                    className="text-btn"
                    target="_blank"
                    rel="noreferrer"
                    href={EXPLORER}
                  >
                    Block explorer <ExternalLink size={14} />
                  </a>
                </div>
              </section>
              <section className="panel pad form-panel">
                <h2>Run the first payment</h2>
                <ol className="help-list">
                  <li>
                    Use two test wallets. Give the buyer tUSD8 and both wallets
                    tQDAY for signatures.
                  </li>
                  <li>
                    Choose Aevum testnet and create an obligation. The buyer
                    deploys the shared escrow on first use, approves the exact
                    token allowance and funds the order.
                  </li>
                  <li>
                    Copy the order link for the supplier. Open it using the
                    supplier wallet, report the delivered quantity and attach a
                    proof file.
                  </li>
                  <li>
                    Return to the buyer wallet, refresh the order, inspect the
                    file and approve the amount. Both parties can download the
                    receipt.
                  </li>
                </ol>
                <div className="notice">
                  <ShieldCheck size={17} />
                  Use test wallets and sample documents. Anyone with the order
                  link and workspace access can read its files.
                </div>
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
