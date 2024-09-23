/* eslint-disable @typescript-eslint/no-var-requires */
const hre = require("hardhat");

// const pathDeployOutputParameters = path.join(__dirname, "./deploy_state_output.json");
// const deployOutputParameters = require(pathDeployOutputParameters);

// TODO: prepare for optimism
const openzeppelinUpgrade = require(`../.openzeppelin/polygon-${process.env.HARDHAT_NETWORK}.json`);

async function main() {
  // verify verifier
  // try {
  //   // verify governance
  //   await hre.run("verify:verify",
  //     {
  //       address: deployOutputParameters.verifier,
  //     }
  //   );
  // } catch (error) {
  //   expect(error.message.toLowerCase().includes("already verified")).to.be.equal(true);
  // }

  // verify implementation
  for (const property in openzeppelinUpgrade.impls) {
    const address = openzeppelinUpgrade.impls[property].address;
    try {
      await hre.run("verify:verify", { address });
    } catch (error) {
      console.log(error.message);
      //expect(error.message.toLowerCase().includes("already verified")).to.be.equal(true);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
