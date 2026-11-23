import { writeFile, mkdir } from "node:fs/promises";
import { keccak256 } from "ethers";
import { compile } from "./compiler.mjs";

const { abi, bytecode, runtime } = await compile(
  "DeliveryEscrow.sol",
  "DeliveryEscrow",
);
const dir = new URL("../lib/generated/", import.meta.url);
await mkdir(dir, { recursive: true });
await writeFile(
  new URL("escrow.json", dir),
  JSON.stringify({ abi, bytecode, runtimeHash: keccak256(runtime) }, null, 2) +
    "\n",
);
console.log("DeliveryEscrow compiled for the Paris EVM.");
