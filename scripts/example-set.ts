/* eslint-disable @typescript-eslint/no-var-requires */
import hre from "hardhat";
import Web3 from "web3";
import { poseidon } from "@iden3/js-crypto";
import { SchemaHash } from "@iden3/js-iden3-core";
import { prepareCircuitArrayValues } from "@0xpolygonid/js-sdk";

// Put your values here
const VALIDATOR_ADDRESS = require("./deploy_validator_output.json").info[0].validator;
const ERC20_VERIFIER_ADDRESS =
  require("./deploy_ERC20LinkedUniversalVerifier_output.json").ERC20Verifier; // ERC20LinkedUniversalVerifier opt-sepolia
const UNIVERSAL_VERIFIER_ADDRESS = "0xd85091088D8428faF96cf809535eFF0d4A2b0ebd";

const Operators = {
  NOOP: 0, // No operation, skip query verification in circuit
  EQ: 1, // equal
  LT: 2, // less than
  GT: 3, // greater than
  IN: 4, // in
  NIN: 5, // not in
  NE: 6, // not equal
};

function packValidatorParams(query, allowedIssuers = []) {
  const web3 = new Web3(Web3.givenProvider || "ws://localhost:8545");
  return web3.eth.abi.encodeParameter(
    {
      CredentialAtomicQuery: {
        schema: "uint256",
        claimPathKey: "uint256",
        operator: "uint256",
        slotIndex: "uint256",
        value: "uint256[]",
        queryHash: "uint256",
        allowedIssuers: "uint256[]",
        circuitIds: "string[]",
        skipClaimRevocationCheck: "bool",
        claimPathNotExists: "uint256",
      },
    },
    {
      schema: query.schema,
      claimPathKey: query.claimPathKey,
      operator: query.operator,
      slotIndex: query.slotIndex,
      value: query.value,
      queryHash: query.queryHash,
      allowedIssuers: allowedIssuers,
      circuitIds: query.circuitIds,
      skipClaimRevocationCheck: query.skipClaimRevocationCheck,
      claimPathNotExists: query.claimPathNotExists,
    },
  );
}

function coreSchemaFromStr(schemaIntString) {
  const schemaInt = BigInt(schemaIntString);
  return SchemaHash.newSchemaHashFromInt(schemaInt);
}

function calculateQueryHashV2(
  values,
  schema,
  slotIndex,
  operator,
  claimPathKey,
  claimPathNotExists,
) {
  const expValue = prepareCircuitArrayValues(values, 64);
  const valueHash = poseidon.spongeHashX(expValue, 6);
  const schemaHash = coreSchemaFromStr(schema);
  const quaryHash = poseidon.hash([
    schemaHash.bigInt(),
    BigInt(slotIndex),
    BigInt(operator),
    BigInt(claimPathKey),
    BigInt(claimPathNotExists),
    valueHash,
  ]);
  return quaryHash;
}

async function main() {
  // you can run https://go.dev/play/p/oB_oOW7kBEw to get schema hash and claimPathKey using YOUR schema
  const schemaBigInt = "74977327600848231385663280181476307657";

  const type = "KYCAgeCredential";
  const schemaUrl =
    "https://raw.githubusercontent.com/iden3/claim-schema-vocab/main/schemas/json-ld/kyc-v3.json-ld";
  // merklized path to field in the W3C credential according to JSONLD  schema e.g. birthday in the KYCAgeCredential under the url "https://raw.githubusercontent.com/iden3/claim-schema-vocab/main/schemas/json-ld/kyc-v3.json-ld"
  const schemaClaimPathKey =
    "20376033832371109177683048456014525905119173674985843915445634726167450989630";

  const requestId = 1;

  const query: any = {
    requestId,
    schema: schemaBigInt,
    claimPathKey: schemaClaimPathKey,
    operator: Operators.LT,
    slotIndex: 0,
    value: [20020101, ...new Array(63).fill(0)], // for operators 1-3 only first value matters
    circuitIds: ["credentialAtomicQuerySigV2OnChain"],
    skipClaimRevocationCheck: false,
    claimPathNotExists: 0,
  };

  query.queryHash = calculateQueryHashV2(
    query.value,
    query.schema,
    query.slotIndex,
    query.operator,
    query.claimPathKey,
    query.claimPathNotExists,
  ).toString();

  //   const erc20Verifier = await hre.ethers.getContractAt('ERC20Verifier', ERC20_VERIFIER_ADDRESS);

  const invokeRequestMetadata = {
    id: "7f38a193-0918-4a48-9fac-36adfdb8b542",
    typ: "application/iden3comm-plain-json",
    type: "https://iden3-communication.io/proofs/1.0/contract-invoke-request",
    thid: "7f38a193-0918-4a48-9fac-36adfdb8b542",
    body: {
      reason: "airdrop participation",
      transaction_data: {
        contract_address: ERC20_VERIFIER_ADDRESS,
        method_id: "b68967e2",
        chain_id: 11155420,
        network: "opt-sepolia",
      },
      scope: [
        {
          id: query.requestId,
          circuitId: query.circuitIds[0],
          query: {
            allowedIssuers: ["*"],
            context: schemaUrl,
            credentialSubject: {
              birthday: {
                $lt: query.value[0],
              },
            },
            type,
          },
        },
      ],
    },
  };

  try {
    // ############ Use this code to set request in ERC20Verifier ############

    // await erc20Verifier.setZKPRequest(requestId, {
    //   metadata: JSON.stringify(invokeRequestMetadata),
    //   validator: VALIDATOR_ADDRESS,
    //   data: packValidatorParams(query)
    // });

    // ############### Use this code to set request in Universal Verifier ############

    const universalVerifier = await hre.ethers.getContractAt(
      "UniversalVerifier",
      UNIVERSAL_VERIFIER_ADDRESS,
    );

    // console.log("JAJ");
    // const txa = await universalVerifier.addValidatorToWhitelist(VALIDATOR_ADDRESS);
    // await txa.wait();
    // console.log("addValidatorToWhitelist", txa.hash);

    // // You can call this method on behalf of any signer which is supposed to be request controller
    // const txb = await universalVerifier.setZKPRequest(requestId, {
    //   metadata: JSON.stringify(invokeRequestMetadata),
    //   validator: VALIDATOR_ADDRESS,
    //   data: packValidatorParams(query),
    // });
    // await txb.wait();
    // console.log("Request set", txb.hash);

    const res = await universalVerifier.getProofStatus(
      "0xF754D0f4de0e815b391D997Eeec5cD07E59858F0",
      1,
    );
    console.log("getProofStatus", res);

    const [proof_a, proof_b, proof_c, inputs] = [
      [
        "6360659213940602237546654855929616077057211394986134998105981449421850171491",
        "5769238324016964219706003524163959050030628368071891601182496586317190341819",
        "1",
      ],
      [
        [
          "10335226858536995191551757487566995477583637718697599116767867260066430422538",
          "21409121712536317453098273997565119180829193645254023009958084427174225570543",
        ],
        [
          "7505667753831196276497524129021485771278430041753638480548390768599458215713",
          "11578012554326144046445734188230427464630319316637402232626741276571897097223",
        ],
        ["1", "0"],
      ],
      [
        "14078834789668302616143935394891525277554477912218074541682029822162090590988",
        "14255775425271424983678674890444136376376547914563071135748623705145563639219",
        "1",
      ],
      [
        "1",
        "20843528408365985766177711497741126289333215425938889766382736534653010435",
        "5632536802361640715726867087548789829025775473957869097276312901674714271327",
        "1",
        "22644965489175128866759069483315502074742784825768509416732645597628629507",
        "1",
        "12083225011532807047089476832352963124303121593373319612469597410489608569683",
        "1727108614",
        "74977327600848231385663280181476307657",
        "0",
        "17040667407194471738958340146498954457187839778402591036538781364266841966",
        "0",
        "1",
        "99",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
      ],
    ];

    const tx = await universalVerifier.submitZKPResponse(
      requestId,
      inputs.slice(0, 11),
      proof_a.slice(0, 2),
      proof_b.slice(0, 2),
      proof_c.slice(0, 2),
    );
    await tx.wait();
    console.log("submitZKPResponse", tx.hash);
  } catch (e) {
    console.log("error: ", e);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
