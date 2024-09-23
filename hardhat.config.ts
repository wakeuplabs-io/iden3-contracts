import "dotenv/config";
import { HardhatUserConfig, task } from "hardhat/config";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "solidity-coverage";
import "@openzeppelin/hardhat-upgrades";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-verify";
import "@nomicfoundation/hardhat-ignition-ethers";

const DEFAULT_MNEMONIC = "test test test test test test test test test test test junk";

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(await account.getAddress());
  }
});

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.20",
      },
    ],
  },
  networks: {
    opt: {
      chainId: 10,
      url: `https://opt-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts: [`0x${process.env.OPT_PRIVATE_KEY}`],
    },
    "opt-sepolia": {
      chainId: 11155420,
      url: `https://opt-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts: [`0x${process.env.OPT_SEPOLIA_PRIVATE_KEY}`],
    },
    // hardhat: {
    //   forking: {
    //     url: `https://polygon-mumbai.infura.io/v3/${process.env.INFURA_API_KEY}`,
    //     blockNumber: 46689454,
    //   },
    // },
    // hardhat: {
    //   chainId: 80001,
    //   forking: {
    //     url: `https://polygon-mumbai.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    //     blockNumber: 47392227,
    //   },
    //   chains: {
    //     80001: {
    //       hardforkHistory: {
    //         london: 20000000,
    //       },
    //     },
    //   },
    //   accounts: [
    //     {
    //       privateKey: process.env.MUMBAI_PRIVATE_KEY as string,
    //       balance: "1000000000000000000000000",
    //     },
    //   ],
    // },
    // hardhat: {
    //   chainId: 137,
    //   forking: {
    //     url: `https://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    //     blockNumber: 55067427,
    //   },
    //   chains: {
    //     137: {
    //       hardforkHistory: {
    //         london: 20000000,
    //       },
    //     },
    //   },
    // },
    // localhost: {
    //   url: "http://127.0.0.1:8545",
    //   accounts: {
    //     mnemonic: DEFAULT_MNEMONIC,
    //     path: "m/44'/60'/0'/0",
    //     initialIndex: 0,
    //     count: 20,
    //   },
    // },
  },
  gasReporter: {
    currency: "USD",
    coinmarketcap: process.env.COINMARKETCAP_KEY,
    enabled: !!process.env.REPORT_GAS,
    token: "ETH",
    // gasPriceAPI: "https://api.etherscan.io/api?module=proxy&action=eth_gasPrice", // ETH
  },

  // etherscan: {
  //     apiKey: "etherscan API key"
  // },
  ignition: {
    strategyConfig: {
      create2: {
        salt: "0x0000000000000000000000000000000000000000000000000000000000000000", // 20 bytes: zero address; 1 byte: 00 - no cross chain protection, 11 bytes - random salt.
      },
    },
  },

  etherscan: {
    apiKey: {
      opt: process.env.OPTIMISM_API_KEY || "",
      "opt-sepolia": process.env.OPTIMISM_API_KEY || "",
    },
    customChains: [],
  },
};

export default config;
