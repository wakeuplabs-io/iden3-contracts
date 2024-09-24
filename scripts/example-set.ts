/* eslint-disable @typescript-eslint/no-var-requires */
import hre from "hardhat";
import Web3 from "web3";
import { poseidon } from "@iden3/js-crypto";
import { SchemaHash } from "@iden3/js-iden3-core";
import { prepareCircuitArrayValues } from "@0xpolygonid/js-sdk";
import { prepareInputs } from "../test/utils/state-utils";

// Put your values here
const VALIDATOR_ADDRESS = "0xbA308e870d35A092810a3F0e4d21ece65551dE42";
const ERC20_VERIFIER_ADDRESS = "0x76A9d02221f4142bbb5C07E50643cCbe0Ed6406C";
const UNIVERSAL_VERIFIER_ADDRESS = "0x102eB31F9f2797e8A84a79c01FFd9aF7D1d9e556";

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

  const requestId = 0;

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

    // get status of request
    console.log(await universalVerifier.getZKPRequest(0));

    // const txb = await universalVerifier.setZKPRequest(requestId, {
    //   metadata: JSON.stringify(invokeRequestMetadata),
    //   validator: VALIDATOR_ADDRESS,
    //   data: packValidatorParams(query),
    // });
    // await txb.wait();
    // console.log("Request set", txb.hash);

    const res = await universalVerifier.getProofStatus(
      "0xF754D0f4de0e815b391D997Eeec5cD07E59858F0",
      0,
    );
    console.log("getProofStatus", res);

    // const [proof_a, proof_b, proof_c, inputs] = [
    //   [
    //     "6360659213940602237546654855929616077057211394986134998105981449421850171491",
    //     "5769238324016964219706003524163959050030628368071891601182496586317190341819",
    //     "1",
    //   ],
    //   [
    //     [
    //       "10335226858536995191551757487566995477583637718697599116767867260066430422538",
    //       "21409121712536317453098273997565119180829193645254023009958084427174225570543",
    //     ],
    //     [
    //       "7505667753831196276497524129021485771278430041753638480548390768599458215713",
    //       "11578012554326144046445734188230427464630319316637402232626741276571897097223",
    //     ],
    //     ["1", "0"],
    //   ],
    //   [
    //     "14078834789668302616143935394891525277554477912218074541682029822162090590988",
    //     "14255775425271424983678674890444136376376547914563071135748623705145563639219",
    //     "1",
    //   ],
    //   [
    //     "1",
    //     "20843528408365985766177711497741126289333215425938889766382736534653010435",
    //     "5632536802361640715726867087548789829025775473957869097276312901674714271327",
    //     "1",
    //     "22644965489175128866759069483315502074742784825768509416732645597628629507",
    //     "1",
    //     "12083225011532807047089476832352963124303121593373319612469597410489608569683",
    //     "1727108614",
    //     "74977327600848231385663280181476307657",
    //     "0",
    //     "17040667407194471738958340146498954457187839778402591036538781364266841966",
    //     "0",
    //     "1",
    //     "99",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //     "0",
    //   ],
    // ];

    // const { inputs, pi_a, pi_b, pi_c } = prepareInputs({
    //   proof: {
    //     pi_a: [
    //       "16060447482934072232578269093759142806246506213993148645030386849704253630879",
    //       "8233823489108734330680652298333091492120233844996855235243220456009928199969",
    //       "1",
    //     ],
    //     pi_b: [
    //       [
    //         "18898598959030885432423646620552568855871473694883231234040065143062018053810",
    //         "832643474835786837888878686714659246007318575465829281343842005484879955536",
    //       ],
    //       [
    //         "12306401635482295766509483198024126248302711678253679827653911718489075249949",
    //         "20990777789792476838437086811098242015917702404121901677695454912274731472246",
    //       ],
    //       ["1", "0"],
    //     ],
    //     pi_c: [
    //       "1566666304378526349951427094243692399858832587159875860779552858695654371583",
    //       "14298783522907493306678638379178643482759072788870339816611486469550613148002",
    //       "1",
    //     ],
    //     protocol: "groth16",
    //     curve: "bn128",
    //   },
    //   pub_signals: [
    //     "1",
    //     "21906816174428088882960639544985793484352873638297256113991436121796805123",
    //     "15045271939084694661437431358729281571840804299863053791890179002991342242959",
    //     "21579554756269435700394510746971689779363993096370224410245789105361040873113",
    //     "0",
    //     "1372133569577688864461476957267755639645351728375",
    //     "19831836565159746543571859136100895797747325320220240191062113636966851634295",
    //     "25800014085998785968363805799080274775344286362723159706825178552310727171",
    //     "1",
    //     "422584936154020202177908007379745096305764598308538971298675179535994098881",
    //     "1727176898",
    //   ],
    // });
    // console.log(
    //   "inputs",
    //   inputs === undefined,
    //   pi_a === undefined,
    //   pi_b === undefined,
    //   pi_c === undefined,
    // );
    // const tx = await universalVerifier.submitZKPResponse(requestId, inputs, pi_a, pi_b, pi_c);
    // await tx.wait();
    // console.log("submitZKPResponse", tx.hash);

    // console.log(await universalVerifier.getZKPRequest(0));
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
