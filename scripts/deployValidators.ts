import fs from "fs";
import path from "path";
import { DeployHelper } from "../helpers/DeployHelper";

const pathOutputJson = path.join(__dirname, "./deploy_validator_output.json");
const pathStateOutputJson = path.join(__dirname, "./deploy_state_output.json");

async function main() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const stateAddress = require(pathStateOutputJson).state;

  const validators: ("mtpV2" | "sigV2" | "v3")[] = ["v3"];
  const deployHelper = await DeployHelper.initialize(null, true);

  const deployInfo: any = [];
  for (const v of validators) {
    const { validator, verifierWrapper } = await deployHelper.deployValidatorContracts(
      v,
      stateAddress,
      "create2",
    );
    deployInfo.push({
      validatorType: v,
      validator: await validator.getAddress(),
      verifier: await verifierWrapper.getAddress(),
    });
  }
  const outputJson = {
    info: deployInfo,
    network: process.env.HARDHAT_NETWORK,
  };
  fs.writeFileSync(pathOutputJson, JSON.stringify(outputJson, null, 1));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
