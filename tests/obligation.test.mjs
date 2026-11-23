import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculate,
  units,
  parseInstruction,
  validate,
  example,
  exampleDraft,
} from "../lib/obligation.ts";
test("extracts the construction order with the amount before or after the supplier", () => {
  for (const text of [
    example,
    "Pay $500 to Supplier A when he brings 50 kg of steel rods.",
  ])
    assert.deepEqual(parseInstruction(text), exampleDraft);
});
test("requires missing material terms to be supplied by the buyer", () => {
  assert.throws(() =>
    validate(parseInstruction("Pay Supplier A when the delivery arrives.")),
  );
  assert.throws(() => units("0.0000001", 6));
  assert.throws(() => units("-500", 6));
});
test("shows the same cumulative entitlement and hold as the contract", () => {
  const o = {
    terms: { ...exampleDraft, proportional: true },
    paid: "0",
    accepted: "0",
    reported: "40",
  };
  assert.deepEqual(calculate(o, "40"), {
    release: "400",
    total: "400",
    held: "100",
    status: "Part paid",
  });
  assert.deepEqual(calculate(o, "0"), {
    release: "0",
    total: "0",
    held: "500",
    status: "On hold",
  });
  assert.equal(
    calculate({ ...o, terms: { ...o.terms, proportional: false } }, "40")
      .release,
    "0",
  );
  assert.throws(() => calculate(o, "41"));
  assert.equal(
    calculate({ ...o, paid: "400", reported: "50", accepted: "40" }, "50")
      .release,
    "100",
  );
});
test("the last acceptance clears residual fractional base units", () => {
  const o = {
    terms: { amount: "0.000010", quantity: "3", proportional: true },
    reported: "2",
    paid: "0.000003",
    accepted: "1",
  };
  assert.equal(calculate(o, "2").release, "0.000003");
  assert.equal(
    calculate({ ...o, reported: "3", paid: "0.000006", accepted: "2" }, "3")
      .release,
    "0.000004",
  );
});
