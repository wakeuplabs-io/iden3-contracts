import hre from "hardhat";

const ERC20LinkedUniversalVerifier = "0x76A9d02221f4142bbb5C07E50643cCbe0Ed6406C";

async function main() {
  const erc20Verifier = await hre.ethers.getContractAt(
    // 'ERC20LinkedUniversalVerifier',
    [
      {
        inputs: [
          {
            internalType: "address",
            name: "to",
            type: "address",
          },
        ],
        name: "mint",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
      },
      {
        inputs: [
          {
            internalType: "address",
            name: "account",
            type: "address",
          },
        ],
        name: "balanceOf",
        outputs: [
          {
            internalType: "uint256",
            name: "",
            type: "uint256",
          },
        ],
        stateMutability: "view",
        type: "function",
      },
    ],
    ERC20LinkedUniversalVerifier,
  );

  const tx = await erc20Verifier.mint("0xF754D0f4de0e815b391D997Eeec5cD07E59858F0");
  await tx.wait();

  console.log(tx.hash);

  console.log(await erc20Verifier.balanceOf("0xF754D0f4de0e815b391D997Eeec5cD07E59858F0"));
}

main();
