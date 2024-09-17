export const chainIdDefaultIdTypeMap = new Map()
  .set(31337, "0x0212") // hardhat
  .set(1101, "0x0231") // zkEVM
  .set(1442, "0x0232") // zkEVM testnet
  .set(137, "0x0211") // polygon main
  .set(80001, "0x0212") // polygon mumbai
  .set(80002, "0x0213") // polygon amoy
  .set(11155111, "0x0223") // ethereum sepolia
  .set(59141, "0x0148") // linea-sepolia
  .set(59144, "0x0149") // linea-main
  .set(21000, "0x01A1") // privado-main
  .set(21001, "0x01A2") // privado-test
  .set(10, "0x0381") // optimism main
  .set(11155420, "0x0382"); // optimism sepolia
