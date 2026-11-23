# AevumPay-AI

An intelligent, adaptive payment settlement platform that uses Adaptive Obligation Settlement Engine (AOSE).

A construction buyer may receive only part of an order. AevumPay records the original agreement, the quantity the supplier reports and the quantity the buyer accepts. Each release follows the rule the buyer confirmed when funding the order. The buyer approves each decision with their wallet.

## Try the demo

Open the payment desk and select **Review delivery**. Supplier A has reported 40 kg against an order for 50 kg of steel rods at 500 tUSD8. Review the sample file, confirm the accepted quantity and approve. The receipt records a 400 tUSD8 release and the ledger retains 100 tUSD8. Switch to the supplier role and submit a new delivery note reporting a cumulative 50 kg. The buyer can then approve the final 100. The demo uses simulated balances and stores its records in this browser.

| Rule agreed at funding | Accepted quantity | Release on first approval | Still in escrow |
| --- | ---: | ---: | ---: |
| Proportional | 40 of 50 kg | 400 tUSD8 | 100 tUSD8 |
| Full delivery only | 40 of 50 kg | 0 tUSD8 | 500 tUSD8 |
| Either rule | 0 of 50 kg | 0 tUSD8 | 500 tUSD8 |
| Either rule | 50 of 50 kg | 500 tUSD8 | 0 tUSD8 |

## Run locally

Use Node.js 22.13 or later and npm. Node 24 is used for the current build. The checked-in escrow artifact is sufficient to run the desk.

```sh
npm ci
npm run dev
```

Open the local URL printed by the dev server. Vinext runs the Next.js App Router and emulates the Cloudflare R2 binding locally. For the production Worker, run `npm run build`. A deployment must provide the `BUCKET` R2 binding. Use `npm start` after the build to run the Worker locally. Test files and generated local state stay outside source control.

```sh
npm test
npm run typecheck
npm ci --prefix contracts
npm test --prefix contracts
npm run build --prefix contracts
```

The Solidity compiler is pinned to 0.8.30, targets the Paris EVM and rebuilds `lib/generated/escrow.json`. Contract tests deploy a six-decimal test token and an escrow on an isolated Ganache chain. They check balances, role restrictions, evidence changes, duplicate approvals, cumulative rounding and refund of only the unpaid remainder. The application independently checks the escrow runtime bytecode and token address before signing.

## Run on QDay Aevum

1. Open the **Aevum testnet** environment in a wallet-enabled browser. Use separate buyer and supplier accounts. The buyer needs a small amount of tUSD8, and both accounts need tQDAY for gas. The live form's example uses 1 tUSD8 for 50 kg.
2. Select **New obligation**. Review the supplier wallet, quantity, asset, rule and approval window. On first use, the buyer signs the escrow deployment. The app then requests the exact token allowance and the funding transaction. A pending order can be resumed after a reload.
3. Copy the funded order's link. The supplier opens it, connects their wallet and submits a file and the cumulative quantity delivered. Hosted access must allow each participant to open the desk. For a two-role rehearsal a single operator can switch accounts.
4. The buyer refreshes the order, reviews the verified document and signs approval. For the 1 tUSD8 demo, accepting 40 of 50 kg releases 0.8 tUSD8 and retains 0.2. Both parties can use the shared order to obtain the same receipt and explorer transaction.
5. An approval of zero new quantity holds the balance. The supplier can provide further evidence before the deadline. After expiry, anyone can trigger a refund of the remaining escrow to the original buyer. The MVP relies on the buyer’s acceptance of the physical goods. It has no external arbitrator.

| Aevum parameter | Value |
| --- | --- |
| Chain | `44005` |
| RPC | `https://rpc-test.qday.info` |
| Token | `0x456569838f1d43009A91ebA4263147Afd7233483` |
| Asset precision | 6 decimal places |
| Native gas | tQDAY |

[Challenge rules](https://qday.io/builder-challenge) · [Network reference](https://wiki.qday.info/Knowledge/reference/chains) · [Token reference](https://wiki.qday.info/Knowledge/reference/tokens) · [Faucet](https://faucet.qday.info) · [Explorer](https://explorer-test.qday.info)

## Architecture

| Component | Responsibility |
| --- | --- |
| React and TypeScript payment desk | Drafts and reviews terms, checks proof files, connects a wallet, computes a preview and displays reconciled receipts. |
| Agreement drafting API | Extracts editable fields using a built-in parser. With an optional server-side `OPENAI_API_KEY`, it requests structured fields from OpenAI. The review screen sets the release policy, deadline and payee wallet. |
| Evidence storage | Keeps immutable terms, document bytes and manifests in R2. Each order link includes a random document access key. Possession of the link and site access permits reading the files. Use sample documents for the hackathon. |
| DeliveryEscrow.sol | Locks the fixed ERC-20, records supplier evidence and applies the funded rule to each cumulative buyer approval. The contract transfers only the newly earned amount. |
| Receipt verification | Retrieves the approval event and reconciles it with the token Transfer event. The JSON receipt includes chain ID, contract, order ID, transaction, block, log index, payer, payee, amount, accepted quantity and document fingerprints. |

Token values use integer base units. Quantities allow three decimal places. Under the proportional rule, cumulative entitlement is the agreed token amount multiplied by the accepted quantity, divided by the target quantity and rounded down. Subtract previous payments to get the incremental release. The final acceptance releases any remaining fractional base units. Plain-English drafting cannot instruct the contract to change the approved rule.

The testnet is the source of truth for funded orders. Order links shared between devices provide access to the terms and evidence. Each browser keeps its own list of visited links. Store a copy of an order link before clearing browser data. The UI shows payouts from the latest 15 payout blocks per order. All approval events remain on-chain.

## Licence and dependencies

The project uses the MIT licence in `LICENSE`. Application dependencies include React, Next.js, Vinext, Vite, ethers and Wrangler (MIT). Lucide uses ISC, Solidity uses GPL-3.0 for its compiler, solc-js uses MIT, and the local Ganache test runtime uses MIT. DM Sans and IBM Plex Mono use the SIL Open Font License. Bundled font and package distributions retain their upstream notices. The Sites Vite integration includes a licence in `scripts/vite/sites-vite-plugin.LICENSE`.
