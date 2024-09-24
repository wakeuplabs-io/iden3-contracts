import fs from "fs";
import path from "path";
import { ethers } from "hardhat";

// opt-sepolia
// eslint-disable-next-line @typescript-eslint/no-var-requires
const universalVerifierAddress = "0x102eB31F9f2797e8A84a79c01FFd9aF7D1d9e556";

const pathOutputJson = path.join(__dirname, "./deploy_ERC20LinkedUniversalVerifier_output.json");

async function main() {
  if (!ethers.isAddress(universalVerifierAddress)) {
    throw new Error("Please set universal verifier address");
  }
  const verifierName = "ERC20LinkedUniversalVerifier";
  const verifierSymbol = "zkERC20";

  const verifier = await ethers.deployContract(verifierName, [
    universalVerifierAddress,
    verifierName,
    verifierSymbol,
  ]);
  await verifier.waitForDeployment();
  console.log(verifierName, " contract address:", await verifier.getAddress());

  const outputJson = {
    verifierName,
    verifierSymbol,
    ERC20Verifier: await verifier.getAddress(),
  };

  fs.writeFileSync(pathOutputJson, JSON.stringify(outputJson, null, 1));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
