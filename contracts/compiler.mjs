import { readFile } from "node:fs/promises";
import solc from "solc";

export async function compile(fileName, contractName) {
  const content = await readFile(new URL(fileName, import.meta.url), "utf8");
  const input = {
    language: "Solidity",
    sources: { [fileName]: { content } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "paris",
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"],
        },
      },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors ?? []).filter(
    (entry) => entry.severity === "error",
  );
  if (errors.length)
    throw new Error(errors.map((entry) => entry.formattedMessage).join("\n"));
  const contract = output.contracts[fileName][contractName];
  return {
    abi: contract.abi,
    bytecode: "0x" + contract.evm.bytecode.object,
    runtime: "0x" + contract.evm.deployedBytecode.object,
  };
}
