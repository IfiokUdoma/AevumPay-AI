"use client";
import { useState } from "react";
import {
  Check,
  ClipboardPenLine,
  FilePlus2,
  Info,
  Plus,
  Sparkles,
} from "lucide-react";
import {
  emptyDraft,
  example,
  parseInstruction,
  validate,
  errText,
  type Draft,
  type Terms,
} from "../lib/obligation";
import { makeTerms } from "../lib/demo";
import { PageHead } from "./DeskParts";

export default function NewOrder({
  live,
  submit,
  busy,
  pending,
  resume,
  discard,
}: {
  live: boolean;
  submit: (t: Terms) => Promise<void>;
  busy: string;
  pending: boolean;
  resume: () => Promise<void>;
  discard: () => Promise<void>;
}) {
  const [input, setInput] = useState(""),
    [draft, setDraft] = useState<Draft>(emptyDraft),
    [source, setSource] = useState(""),
    [proportional, setPolicy] = useState(true);
  const [days, setDays] = useState(14),
    [address, setAddress] = useState(""),
    [ack, setAck] = useState(false),
    [error, setError] = useState(""),
    [working, setWorking] = useState(false);
  function field(k: keyof Draft, v: string) {
    setDraft((old) => ({ ...old, [k]: v }));
    setAck(false);
  }
  async function extract(value = input) {
    if (!value.trim()) {
      setError("Enter a payment instruction first.");
      return;
    }
    setWorking(true);
    setError("");
    setAck(false);
    try {
      const r = await fetch("/api/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: value }),
      });
      if (!r.ok) throw Error();
      const result = (await r.json()) as { draft: Draft; source: string };
      setDraft(result.draft);
      setSource(result.source);
    } catch {
      setDraft(parseInstruction(value));
      setSource("Built-in parser");
    } finally {
      setWorking(false);
    }
  }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      validate(draft);
      if (!ack)
        throw Error("Confirm the terms and settlement rule before proceeding.");
      await submit(
        makeTerms(
          draft,
          input.trim() ||
            "Pay " +
              draft.supplier +
              " for " +
              draft.quantity +
              " " +
              draft.unit +
              " of " +
              draft.item,
          proportional,
          days,
          address,
        ),
      );
    } catch (e) {
      setError(errText(e));
    }
  }
  if (live && pending)
    return (
      <>
        <PageHead k="Payment operations" title="Resume funding" />
        <section className="panel pad">
          <h2>An order is awaiting confirmation</h2>
          <p>
            Resume with the original buyer wallet. The desk checks your previous
            transactions before requesting another signature.
          </p>
          <button
            className="primary"
            disabled={!!busy}
            onClick={() => void resume()}
          >
            {busy || "Resume order"}
          </button>
          <button
            className="text-btn discard"
            disabled={!!busy}
            onClick={() => void discard()}
          >
            Discard unfunded draft
          </button>
        </section>
      </>
    );
  return (
    <>
      <PageHead
        k="Agreement builder"
        title="New obligation"
        subtitle="Turn a supplier instruction into terms both parties can review."
      />
      <form onSubmit={create}>
        <section className="panel pad form-panel">
          <div className="heading-icon">
            <span className="queue-icon">
              <Sparkles size={19} />
            </span>
            <h2>Payment instruction</h2>
          </div>
          <label className="field">
            What should the supplier be paid for?
            <textarea
              maxLength={1200}
              rows={3}
              placeholder={live ? example.replace("500", "1") : example}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setAck(false);
              }}
            />
          </label>
          <div className="form-actions">
            <button
              disabled={working || !!busy}
              type="button"
              className="outline"
              onClick={() => void extract()}
            >
              <ClipboardPenLine size={16} />
              {working ? "Reading instruction…" : "Draft terms"}
            </button>
            <button
              type="button"
              className="text-btn"
              disabled={working || !!busy}
              onClick={() => {
                const s = live ? example.replace("500", "1") : example;
                setInput(s);
                void extract(s);
              }}
            >
              Use steel delivery example
            </button>
            {source && <span className="source-note">{source}</span>}
          </div>
        </section>
        <section className="panel pad form-panel">
          <h2>Agreement terms</h2>
          <div className="field-grid">
            <label className="field">
              Supplier name
              <input
                required
                maxLength={100}
                value={draft.supplier}
                onChange={(e) => field("supplier", e.target.value)}
              />
            </label>
            <label className="field">
              Goods or service
              <input
                required
                maxLength={130}
                value={draft.item}
                onChange={(e) => field("item", e.target.value)}
              />
            </label>
            <label className="field">
              Agreed amount (tUSD8)
              <input
                required
                inputMode="decimal"
                value={draft.amount}
                onChange={(e) => field("amount", e.target.value)}
              />
            </label>
            <label className="field">
              Required quantity
              <input
                required
                inputMode="decimal"
                value={draft.quantity}
                onChange={(e) => field("quantity", e.target.value)}
              />
            </label>
            <label className="field">
              Unit of measure
              <input
                required
                maxLength={32}
                placeholder="kg"
                value={draft.unit}
                onChange={(e) => field("unit", e.target.value)}
              />
            </label>
            <label className="field">
              Approval window
              <select
                value={days}
                onChange={(e) => {
                  setDays(Number(e.target.value));
                  setAck(false);
                }}
              >
                {[1, 7, 14, 30, 60].map((n) => (
                  <option value={n} key={n}>
                    {n} {n === 1 ? "day" : "days"}
                  </option>
                ))}
              </select>
            </label>
            {live && (
              <label className="field wide">
                Supplier’s public Aevum wallet
                <input
                  required
                  placeholder="0x…"
                  autoComplete="off"
                  value={address}
                  onChange={(e) => {
                    setAddress(e.target.value.trim());
                    setAck(false);
                  }}
                />
              </label>
            )}
          </div>
          <fieldset className="policy">
            <legend>Settlement rule</legend>
            <label className={proportional ? "selected" : ""}>
              <input
                type="radio"
                name="rule"
                checked={proportional}
                onChange={() => {
                  setPolicy(true);
                  setAck(false);
                }}
              />
              <span>
                <b>Proportional release</b>
                <small>Pay for the quantity the buyer accepts.</small>
              </span>
            </label>
            <label className={!proportional ? "selected" : ""}>
              <input
                type="radio"
                name="rule"
                checked={!proportional}
                onChange={() => {
                  setPolicy(false);
                  setAck(false);
                }}
              />
              <span>
                <b>Full delivery only</b>
                <small>
                  Hold all funds until the buyer accepts the full order.
                </small>
              </span>
            </label>
          </fieldset>
          <div className="notice">
            <Info size={17} />
            <span>
              After the approval window, the unpaid balance can be returned to
              the buyer.
            </span>
          </div>
          <label className="ack">
            <input
              type="checkbox"
              required
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
            />
            I confirm the payee, quantity, amount and settlement rule.
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button
            className="primary"
            type="submit"
            disabled={!ack || working || !!busy}
          >
            <Plus size={16} />
            {busy || (live ? "Fund on Aevum" : "Create demo obligation")}
          </button>
        </section>
      </form>
    </>
  );
}
