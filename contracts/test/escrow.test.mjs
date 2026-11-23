import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import ganache from "ganache";
import {
  BrowserProvider,
  ContractFactory,
  id,
  randomBytes,
  hexlify,
} from "ethers";
import { compile } from "../compiler.mjs";

let sim,
  provider,
  buyer,
  supplier,
  other,
  escrow,
  token,
  supplierAddress,
  buyerAddress;
const money = 500_000_000n;
const terms = id("agreed 50 kg of steel");
const proof = id("delivery note");
const replacement = id("revised delivery note");
before(async () => {
  sim = ganache.provider({
    logging: { quiet: true },
    chain: { chainId: 44005 },
    wallet: { totalAccounts: 3 },
  });
  provider = new BrowserProvider(sim);
  provider.pollingInterval = 25;
  [buyer, supplier, other] = await Promise.all(
    [0, 1, 2].map((i) => provider.getSigner(i)),
  );
  [buyerAddress, supplierAddress] = await Promise.all([
    buyer.getAddress(),
    supplier.getAddress(),
  ]);
  const deploy = async (file, name, args) => {
    const a = await compile(file, name);
    const c = await new ContractFactory(a.abi, a.bytecode, buyer).deploy(
      ...args,
    );
    await c.waitForDeployment();
    return c;
  };
  token = await deploy("test/TestToken.sol", "TestToken", []);
  escrow = await deploy("DeliveryEscrow.sol", "DeliveryEscrow", [
    await token.getAddress(),
  ]);
});
after(async () => sim?.disconnect());
async function funded(
  amount = money,
  target = 50_000n,
  proportional = true,
  lifetime = 86400,
) {
  const salt = hexlify(randomBytes(32));
  const invoice = await escrow.orderId(buyerAddress, salt);
  const deadline = (
    await provider.send("eth_getBlockByNumber", ["latest", false])
  ).timestamp;
  await (await token.approve(await escrow.getAddress(), amount)).wait();
  const args = [
    salt,
    supplierAddress,
    amount,
    target,
    proportional,
    terms,
    Number(BigInt(deadline)) + lifetime,
  ];
  await (await escrow.fund(...args)).wait();
  return { invoice, args };
}
test("40 kg releases 400, a duplicate review is blocked, the final 10 kg releases the remaining 100", async () => {
  const { invoice, args } = await funded();
  await assert.rejects(escrow.fund.staticCall(...args));
  await assert.rejects(escrow.review.staticCall(invoice, proof, 40_000n));
  await assert.rejects(
    escrow.submitEvidence.staticCall(invoice, proof, 40_000n),
  );
  await (
    await escrow.connect(supplier).submitEvidence(invoice, proof, 40_000n)
  ).wait();
  await assert.rejects(
    escrow.connect(other).review.staticCall(invoice, proof, 40_000n),
  );
  await assert.rejects(escrow.review.staticCall(invoice, replacement, 40_000n));
  await assert.rejects(escrow.review.staticCall(invoice, proof, 50_000n));
  const beforePaid = await token.balanceOf(supplierAddress);
  await (await escrow.review(invoice, proof, 40_000n)).wait();
  let o = await escrow.orders(invoice);
  assert.equal(o.paid, 400_000_000n);
  assert.equal(o.status, 3n);
  assert.equal(
    (await token.balanceOf(supplierAddress)) - beforePaid,
    400_000_000n,
  );
  await assert.rejects(escrow.review.staticCall(invoice, proof, 40_000n));
  await (
    await escrow.connect(supplier).submitEvidence(invoice, replacement, 50_000n)
  ).wait();
  await (await escrow.review(invoice, replacement, 50_000n)).wait();
  o = await escrow.orders(invoice);
  assert.equal(o.paid, money);
  assert.equal(o.status, 5n);
  assert.equal((await token.balanceOf(supplierAddress)) - beforePaid, money);
  assert.equal(await escrow.payoutCount(invoice), 2n);
  await assert.rejects(
    escrow.connect(supplier).submitEvidence.staticCall(invoice, proof, 50_000n),
  );
});
test("a full-delivery rule withholds funds until all units are accepted", async () => {
  const { invoice } = await funded(11n, 3000n, false);
  await (
    await escrow.connect(supplier).submitEvidence(invoice, proof, 2000)
  ).wait();
  await (await escrow.review(invoice, proof, 2000)).wait();
  assert.equal((await escrow.orders(invoice)).paid, 0n);
  assert.equal((await escrow.orders(invoice)).status, 4n);
  await (
    await escrow.connect(supplier).submitEvidence(invoice, replacement, 3000)
  ).wait();
  await (await escrow.review(invoice, replacement, 3000)).wait();
  assert.equal((await escrow.orders(invoice)).paid, 11n);
});
test("holding disputed proof moves zero; subsequent instalments reconcile to the exact base unit", async () => {
  const { invoice } = await funded(10n, 3000n);
  for (const [qty, accepted, expected] of [
    [1000, 0, 0n],
    [1000, 1000, 3n],
    [2000, 2000, 6n],
    [3000, 3000, 10n],
  ]) {
    const digest = id("note " + qty + "-" + accepted);
    await (
      await escrow.connect(supplier).submitEvidence(invoice, digest, qty)
    ).wait();
    await (await escrow.review(invoice, digest, accepted)).wait();
    assert.equal((await escrow.orders(invoice)).paid, expected);
  }
});
test("expiry returns only the unpaid balance to the buyer", async () => {
  const { invoice } = await funded(100n, 10n, true, 900);
  await (
    await escrow.connect(supplier).submitEvidence(invoice, proof, 4)
  ).wait();
  await (await escrow.review(invoice, proof, 4)).wait();
  await assert.rejects(escrow.refundExpired.staticCall(invoice));
  await provider.send("evm_increaseTime", [950]);
  await provider.send("evm_mine", []);
  const beforeRefund = await token.balanceOf(buyerAddress);
  await (await escrow.connect(other).refundExpired(invoice)).wait();
  assert.equal((await token.balanceOf(buyerAddress)) - beforeRefund, 60n);
  assert.equal((await escrow.orders(invoice)).status, 6n);
  await assert.rejects(escrow.refundExpired.staticCall(invoice));
});
