import { expect } from "chai";
import { DeployHelper } from "../../helpers/DeployHelper";
import { ethers } from "hardhat";
import { packValidatorParams } from "../utils/validator-pack-utils";
import { prepareInputs } from "../utils/state-utils";
import { Block } from "ethers";
import { Operators, prepareCircuitArrayValues } from "@0xpolygonid/js-sdk";
import { poseidon } from "@iden3/js-crypto";
import { SchemaHash } from "@iden3/js-iden3-core";

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

describe("Universal Verifier MTP & SIG validators", function () {
  let verifier: any, sig: any;
  let signer, signer2, signer3;
  let signerAddress: string;
  let deployHelper: DeployHelper;

  const query = {
    schema: BigInt("180410020913331409885634153623124536270"),
    claimPathKey: BigInt(
      "8566939875427719562376598811066985304309117528846759529734201066483458512800",
    ),
    operator: 1n,
    slotIndex: 0n,
    value: [1420070400000000000n, ...new Array(63).fill("0").map((x) => BigInt(x))],
    queryHash: BigInt(
      "1496222740463292783938163206931059379817846775593932664024082849882751356658",
    ),
    circuitIds: ["credentialAtomicQuerySigV2OnChain"],
    claimPathNotExists: 0,
  };

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const proofJson = require("../validators/sig/data/valid_sig_user_genesis.json");

  beforeEach(async () => {
    [signer, signer2, signer3] = await ethers.getSigners();
    signerAddress = await signer.getAddress();

    deployHelper = await DeployHelper.initialize(null, true);
    verifier = await deployHelper.deployUniversalVerifier(signer);

    const stub = await deployHelper.deployValidatorStub();
    sig = stub;
    console.log("validator", await sig.getAddress());
    await verifier.addValidatorToWhitelist(await sig.getAddress());
    await verifier.connect();
  });

  it.only("Test setZKPRequest", async () => {
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
      schema: BigInt(schemaBigInt),
      claimPathKey: schemaClaimPathKey,
      operator: Operators.LT,
      slotIndex: 0,
      value: [20020101, ...new Array(63).fill(0)], // for operators 1-3 only first value matters
      circuitIds: ["credentialAtomicQuerySigV2OnChain"],
      skipClaimRevocationCheck: false,
      claimPathNotExists: 0,
    };

    console.log("AB");

    query.queryHash = calculateQueryHashV2(
      query.value,
      query.schema,
      query.slotIndex,
      query.operator,
      query.claimPathKey,
      query.claimPathNotExists,
    ).toString();

    console.log("BA");

    const invokeRequestMetadata = {
      id: "7f38a193-0918-4a48-9fac-36adfdb8b542",
      typ: "application/iden3comm-plain-json",
      type: "https://iden3-communication.io/proofs/1.0/contract-invoke-request",
      thid: "7f38a193-0918-4a48-9fac-36adfdb8b542",
      body: {
        reason: "airdrop participation",
        transaction_data: {
          contract_address: "0x40F2E71e40C9a9f03eB2D8A6c0854fa7bca236B5", // ERC20_VERIFIER_ADDRESS
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

    console.log("CA");

    const tx = await verifier.setZKPRequest(requestId, {
      metadata: JSON.stringify(invokeRequestMetadata),
      validator: await sig.getAddress(),
      data: packValidatorParams(query),
    });
    await tx.wait();

    const [proof_a, proof_b, proof_c, inputs] = [
      [
        "15333738621121908341914484728801891398681477202182205126950530581662344927289",
        "19553989225093377424603146381132670063968406055980905241214993031611949605480",
        "1",
      ],
      [
        [
          "4829265401956462757947327681147838940172559384646778223725017758892192758548",
          "8307778233894131746104331292803431128182409607061182672309684025102205524552",
        ],
        [
          "9344488960721950125275976745180809344550564063951398083691760649973423397937",
          "10323855453917973079911414988968411933268399879963577122311383331621425734282",
        ],
        ["1", "0"],
      ],
      [
        "21110266528114743327711862419994991947997544499468324228696460677751823390183",
        "12737888512976020155506861913097200649673438374224825522855121615272824254897",
        "1",
      ],
      [
        "1",
        "21761383179612012732638965656484136965135490221370744332413211445554610691",
        "8781686975587562019942734536870070462870608019285425912459374480760608066296",
        "1",
        "19856847669049160587527374422820328531522787600223254452194686446502642179",
        "1",
        "1175884054920944254505531460379374199342563191062568487558050719319324534671",
        "1727105561",
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

    const tx2 = await verifier.submitZKPResponse(
      requestId,
      inputs,
      proof_a.slice(0, 2),
      proof_b.slice(0, 2),
      proof_c.slice(0, 2),
    );
    await tx2.wait();
    console.log("submitZKPResponse", tx2.hash);
  });

  it("Test add, get ZKPRequest, requestIdExists, getZKPRequestsCount", async () => {
    const requestsCount = 3;
    const validatorAddr = await sig.getAddress();

    for (let i = 0; i < requestsCount; i++) {
      await expect(
        verifier.setZKPRequest(i, {
          metadata: "metadataN" + i,
          validator: validatorAddr,
          data: "0x0" + i,
        }),
      )
        .to.emit(verifier, "ZKPRequestSet")
        .withArgs(i, signerAddress, "metadataN" + i, validatorAddr, "0x0" + i);
      const request = await verifier.getZKPRequest(i);
      expect(request.metadata).to.be.equal("metadataN" + i);
      expect(request.validator).to.be.equal(validatorAddr);
      expect(request.data).to.be.equal("0x0" + i);

      const requestIdExists = await verifier.requestIdExists(i);
      expect(requestIdExists).to.be.true;
      const requestIdDoesntExists = await verifier.requestIdExists(i + 1);
      expect(requestIdDoesntExists).to.be.false;

      await expect(verifier.getZKPRequest(i + 1)).to.be.rejectedWith("request id doesn't exist");
    }

    const count = await verifier.getZKPRequestsCount();
    expect(count).to.be.equal(requestsCount);
  });

  it("Test submit response", async () => {
    const requestId = 0;
    const nonExistingRequestId = 1;
    const data = packValidatorParams(query);

    await verifier.setZKPRequest(0, {
      metadata: "metadata",
      validator: await sig.getAddress(),
      data: data,
    });

    const { inputs, pi_a, pi_b, pi_c } = prepareInputs(proofJson);
    const tx = await verifier.submitZKPResponse(0, inputs, pi_a, pi_b, pi_c);
    const txRes = await tx.wait();
    const filter = verifier.filters.ZKPResponseSubmitted;

    const events = await verifier.queryFilter(filter, -1);
    expect(events[0].eventName).to.be.equal("ZKPResponseSubmitted");
    expect(events[0].args.requestId).to.be.equal(0);
    expect(events[0].args.caller).to.be.equal(signerAddress);

    const { timestamp: txResTimestamp } = (await ethers.provider.getBlock(
      txRes.blockNumber,
    )) as Block;

    await expect(
      verifier.verifyZKPResponse(
        0,
        inputs,
        pi_a,
        pi_b,
        pi_c,
        "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
      ),
    ).not.to.be.rejected;

    const status = await verifier.getProofStatus(signerAddress, requestId);
    expect(status.isVerified).to.be.true;
    expect(status.validatorVersion).to.be.equal("2.0.1-mock");
    expect(status.blockNumber).to.be.equal(txRes.blockNumber);
    expect(status.blockTimestamp).to.be.equal(txResTimestamp);

    await expect(verifier.getProofStatus(signerAddress, nonExistingRequestId)).to.be.rejectedWith(
      "request id doesn't exist",
    );
  });

  it("Test getZKPRequests pagination", async () => {
    for (let i = 0; i < 30; i++) {
      await verifier.setZKPRequest(i, {
        metadata: "metadataN" + i,
        validator: await sig.getAddress(),
        data: "0x00",
      });
    }
    let queries = await verifier.getZKPRequests(5, 10);
    expect(queries.length).to.be.equal(10);
    expect(queries[0].metadata).to.be.equal("metadataN5");
    expect(queries[9].metadata).to.be.equal("metadataN14");

    queries = await verifier.getZKPRequests(15, 3);
    expect(queries.length).to.be.equal(3);
    expect(queries[0].metadata).to.be.equal("metadataN15");
    expect(queries[1].metadata).to.be.equal("metadataN16");
    expect(queries[2].metadata).to.be.equal("metadataN17");
  });

  it("Check access control", async () => {
    const owner = signer;
    const requestOwner = signer2;
    const someSigner = signer3;
    const requestId = 0;
    const nonExistentRequestId = 1;
    const requestOwnerAddr = await requestOwner.getAddress();
    const someSignerAddress = await someSigner.getAddress();

    await expect(verifier.getRequestOwner(requestId)).to.be.rejectedWith(
      "request id doesn't exist",
    );
    await verifier.connect(requestOwner).setZKPRequest(requestId, {
      metadata: "metadata",
      validator: await sig.getAddress(),
      data: packValidatorParams(query),
    });

    expect(await verifier.getRequestOwner(requestId)).to.be.equal(requestOwnerAddr);
    await expect(
      verifier.connect(someSigner).setRequestOwner(requestId, someSigner),
    ).to.be.rejectedWith("Not an owner or request owner");

    await verifier.connect(requestOwner).setRequestOwner(requestId, someSigner);
    expect(await verifier.getRequestOwner(requestId)).to.be.equal(someSignerAddress);

    await expect(
      verifier.connect(requestOwner).setRequestOwner(requestId, requestOwnerAddr),
    ).to.be.rejectedWith("Not an owner or request owner");
    await verifier.connect(owner).setRequestOwner(requestId, requestOwnerAddr);
    expect(await verifier.getRequestOwner(requestId)).to.be.equal(requestOwnerAddr);

    await expect(verifier.getRequestOwner(nonExistentRequestId)).to.be.rejectedWith(
      "request id doesn't exist",
    );
    await expect(
      verifier.setRequestOwner(nonExistentRequestId, someSignerAddress),
    ).to.be.rejectedWith("request id doesn't exist");
  });

  it("Check disable/enable functionality", async () => {
    const owner = signer;
    const requestOwner = signer2;
    const someSigner = signer3;
    const requestId = 0;
    const nonExistentRequestId = 1;

    await expect(verifier.isZKPRequestEnabled(requestId)).to.be.rejectedWith(
      "request id doesn't exist",
    );

    await verifier.connect(requestOwner).setZKPRequest(requestId, {
      metadata: "metadata",
      validator: await sig.getAddress(),
      data: packValidatorParams(query),
    });
    expect(await verifier.isZKPRequestEnabled(requestId)).to.be.true;

    await expect(verifier.connect(someSigner).disableZKPRequest(requestId)).to.be.rejectedWith(
      "Not an owner or request owner",
    );
    expect(await verifier.isZKPRequestEnabled(requestId)).to.be.true;

    await verifier.connect(owner).disableZKPRequest(requestId);
    expect(await verifier.isZKPRequestEnabled(requestId)).to.be.false;

    await expect(verifier.connect(someSigner).enableZKPRequest(requestId)).to.be.rejectedWith(
      "Not an owner or request owner",
    );
    await verifier.connect(requestOwner).enableZKPRequest(requestId);
    expect(await verifier.isZKPRequestEnabled(requestId)).to.be.true;

    const { inputs, pi_a, pi_b, pi_c } = prepareInputs(proofJson);
    await verifier.submitZKPResponse(0, inputs, pi_a, pi_b, pi_c);

    await verifier.connect(requestOwner).disableZKPRequest(requestId);
    await expect(verifier.submitZKPResponse(0, inputs, pi_a, pi_b, pi_c)).to.be.rejectedWith(
      "Request is disabled",
    );
    await expect(
      verifier.verifyZKPResponse(
        0,
        inputs,
        pi_a,
        pi_b,
        pi_c,
        "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
      ),
    ).to.be.rejectedWith("Request is disabled");

    await expect(verifier.isZKPRequestEnabled(nonExistentRequestId)).to.be.rejectedWith(
      "request id doesn't exist",
    );
    await expect(verifier.disableZKPRequest(nonExistentRequestId)).to.be.rejectedWith(
      "request id doesn't exist",
    );
    await expect(verifier.enableZKPRequest(nonExistentRequestId)).to.be.rejectedWith(
      "request id doesn't exist",
    );
  });

  it("Check whitelisted validators", async () => {
    const owner = signer;
    const someAddress = signer2;
    const requestId = 1;
    const otherRequestId = 2;
    const { state } = await deployHelper.deployState();
    const { validator: mtp } = await deployHelper.deployValidatorContracts(
      "mtpV2",
      await state.getAddress(),
    );
    const mtpValAddr = await mtp.getAddress();
    expect(await verifier.isWhitelistedValidator(mtpValAddr)).to.be.false;

    await expect(
      verifier.setZKPRequest(requestId, {
        metadata: "metadata",
        validator: mtpValAddr,
        data: "0x00",
      }),
    ).to.be.rejectedWith("Validator is not whitelisted");

    await expect(verifier.connect(someAddress).addValidatorToWhitelist(mtpValAddr))
      .to.be.revertedWithCustomError(verifier, "OwnableUnauthorizedAccount")
      .withArgs(someAddress);
    expect(await verifier.isWhitelistedValidator(mtpValAddr)).to.be.false;

    await verifier.connect(owner).addValidatorToWhitelist(mtpValAddr);
    expect(await verifier.isWhitelistedValidator(mtpValAddr)).to.be.true;

    await expect(
      verifier.setZKPRequest(requestId, {
        metadata: "metadata",
        validator: mtpValAddr,
        data: "0x00",
      }),
    ).not.to.be.rejected;

    // can't whitelist validator, which does not support ICircuitValidator interface
    await expect(verifier.addValidatorToWhitelist(someAddress)).to.be.rejected;

    await expect(
      verifier.setZKPRequest(otherRequestId, {
        metadata: "metadata",
        validator: someAddress,
        data: "0x00",
      }),
    ).to.be.rejectedWith("Validator is not whitelisted");

    await verifier.removeValidatorFromWhitelist(mtpValAddr);

    await expect(
      verifier.submitZKPResponse(
        requestId,
        [],
        [0, 0],
        [
          [0, 0],
          [0, 0],
        ],
        [0, 0],
      ),
    ).to.be.rejectedWith("Validator is not whitelisted");
  });
});
