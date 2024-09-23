import path from "path";
import { DeployHelper } from "../helpers/DeployHelper";

const pathStateOutputJson = path.join(__dirname, "./deploy_state_output.json");

(async () => {
  const deployHelper = await DeployHelper.initialize();

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const stateDeployment = require(pathStateOutputJson);

  const stateContractAddress = stateDeployment.state ?? "";
  const poseidon2ContractAddress = stateDeployment.poseidon2 ?? "";
  const poseidon3ContractAddress = stateDeployment.poseidon3 ?? "";

  await deployHelper.deployIdentityTreeStore(
    stateContractAddress,
    poseidon2ContractAddress,
    poseidon3ContractAddress,
    "create2",
  );
})();
