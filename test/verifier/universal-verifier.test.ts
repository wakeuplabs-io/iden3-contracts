import { expect } from "chai";
import { DeployHelper } from "../../helpers/DeployHelper";
import { ethers } from "hardhat";
import { packValidatorParams } from "../utils/validator-pack-utils";
import { prepareInputs } from "../utils/state-utils";
import { Block } from "ethers";
import {
  AbstractPrivateKeyStore,
  AgentResolver,
  BjjProvider,
  core,
  CredentialRequest,
  CredentialStatusPublisherRegistry,
  CredentialStatusResolverRegistry,
  CredentialStatusType,
  CredentialStorage,
  CredentialWallet,
  defaultEthConnectionConfig,
  EthConnectionConfig,
  EthStateStorage,
  FSCircuitStorage,
  ICircuitStorage,
  ICredentialWallet,
  IDataStorage,
  Iden3SmtRhsCredentialStatusPublisher,
  Identity,
  IdentityCreationOptions,
  IdentityStorage,
  IdentityWallet,
  IIdentityWallet,
  InMemoryDataSource,
  InMemoryMerkleTreeStorage,
  InMemoryPrivateKeyStore,
  IssuerResolver,
  IStateStorage,
  KMS,
  KmsKeyType,
  OnChainResolver,
  Operators,
  prepareCircuitArrayValues,
  Profile,
  ProofService,
  RHSResolver,
  W3CCredential,
} from "@0xpolygonid/js-sdk";
import { poseidon } from "@iden3/js-crypto";
import { SchemaHash } from "@iden3/js-iden3-core";
import path from "path";

// const OPID_METHOD = "opid";

// core.registerDidMethod(OPID_METHOD, 0b00000011);
// core.registerDidMethodNetwork({
//   method: OPID_METHOD,
//   blockchain: "optimism",
//   chainId: 31337,
//   network: "sepolia",
//   networkFlag: 0b1000_0000 | 0b0000_0010,
// });
// core.registerDidMethodNetwork({
//   method: OPID_METHOD,
//   blockchain: "optimism",
//   chainId: 10,
//   network: "main",
//   networkFlag: 0b1000_0000 | 0b0000_0001,
// });

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

async function setZKPRequest(
  verifier: any,
  validator: any,
  requestId: number,
  erc20VerifierAddress: string,
) {
  const schemaBigInt = "74977327600848231385663280181476307657";

  const type = "KYCAgeCredential";
  const schemaUrl =
    "https://raw.githubusercontent.com/iden3/claim-schema-vocab/main/schemas/json-ld/kyc-v3.json-ld";
  // merklized path to field in the W3C credential according to JSONLD  schema e.g. birthday in the KYCAgeCredential under the url "https://raw.githubusercontent.com/iden3/claim-schema-vocab/main/schemas/json-ld/kyc-v3.json-ld"
  const schemaClaimPathKey =
    "20376033832371109177683048456014525905119173674985843915445634726167450989630";

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

  query.queryHash = calculateQueryHashV2(
    query.value,
    query.schema,
    query.slotIndex,
    query.operator,
    query.claimPathKey,
    query.claimPathNotExists,
  ).toString();

  const invokeRequestMetadata = {
    id: "7f38a193-0918-4a48-9fac-36adfdb8b542",
    typ: "application/iden3comm-plain-json",
    type: "https://iden3-communication.io/proofs/1.0/contract-invoke-request",
    thid: "7f38a193-0918-4a48-9fac-36adfdb8b542",
    body: {
      reason: "airdrop participation",
      transaction_data: {
        contract_address: erc20VerifierAddress,
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

  const tx = await verifier.setZKPRequest(requestId, {
    metadata: JSON.stringify(invokeRequestMetadata),
    validator: await validator.getAddress(),
    data: packValidatorParams(query),
  });
  await tx.wait();

  return { query };
}

describe("Universal Verifier MTP & SIG validators", function () {
  let verifier: any, sig: any, state: any;
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

    deployHelper = await DeployHelper.initialize(null, false);
    verifier = await deployHelper.deployUniversalVerifier(signer);

    ({ state } = await await deployHelper.deployState([], "VerifierStateTransition", "create2"));
    const stub = await deployHelper.deployValidatorContracts("sigV2", await state.getAddress());
    sig = stub.validator;
    console.log("verifierWrapper", await stub.verifierWrapper.getAddress());
    console.log("validator", await sig.getAddress());
    await verifier.addValidatorToWhitelist(await sig.getAddress());
    await verifier.connect();
  });

  it.only("Test aaaa", async () => {
    console.log(await verifier.getChallenge("0xF754D0f4de0e815b391D997Eeec5cD07E59858F0"));
  });

  it("Test setZKPRequest", async () => {
    const requestId = 0;
    const { query } = await setZKPRequest(
      verifier,
      sig,
      requestId,
      "0x177328000994fBF302C0E20c7C493Cc0C7892927",
    );

    console.log("SET", query);

    // const { inputs, pi_a, pi_b, pi_c } = prepareInputs(proof);
    // const tx2 = await verifier.submitZKPResponse(0, inputs, pi_a, pi_b, pi_c);
    // await tx2.wait();
    // console.log("submitZKPResponse", tx2.hash);
  });

  it("Test setZKPRequest", async () => {
    const requestId = 0;

    const { query } = await setZKPRequest(verifier, sig, requestId, "");

    console.log("SET");

    const defaultNetworkConnection = {
      rpcUrl: "http://127.0.0.1:8545",
      contractAddress: await state.getAddress(),
    };

    const defaultIdentityCreationOptions: IdentityCreationOptions = {
      method: "iden3",
      blockchain: "eth",
      networkId: "sepolia",
      revocationOpts: {
        type: CredentialStatusType.Iden3ReverseSparseMerkleTreeProof,
        id: "https://rhs-staging.polygonid.me",
      },
    };

    const { dataStorage, credentialWallet, identityWallet } =
      await initInMemoryDataStorageAndWallets(defaultNetworkConnection);

    const circuitStorage = await initCircuitStorage();
    const proofService = await initProofService(
      identityWallet,
      credentialWallet,
      dataStorage.states,
      circuitStorage,
    );

    console.log("init done");

    const { did: userDID } = await identityWallet.createIdentity({
      ...defaultIdentityCreationOptions,
    });

    console.log("=============== user did ===============");
    console.log(userDID.string());

    const { did: issuerDID } = await identityWallet.createIdentity({
      ...defaultIdentityCreationOptions,
    });

    const credentialRequest = createKYCAgeCredential(userDID);
    const credential = await identityWallet.issueCredential(issuerDID, credentialRequest);

    await dataStorage.credential.saveCredential(credential);

    console.log("================= generate Iden3SparseMerkleTreeProof =======================");

    const res = await identityWallet.addCredentialsToMerkleTree([credential], issuerDID);

    console.log("================= publish to blockchain ===================");

    const ethSigner = (await ethers.getSigners())[0];
    const txId = await proofService.transitState(
      issuerDID,
      res.oldTreeState,
      true,
      dataStorage.states,
      ethSigner,
    );
    console.log(txId);

    console.log("================= generate credentialAtomicSigV2OnChain ===================");

    const proof = await proofService.generateProof(
      {
        id: requestId,
        circuitId: "credentialAtomicQuerySigV2OnChain",
        query: query,
      },
      userDID,
    );

    const { inputs, pi_a, pi_b, pi_c } = prepareInputs(proof);
    const tx2 = await verifier.submitZKPResponse(0, inputs, pi_a, pi_b, pi_c);
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

export async function initInMemoryDataStorageAndWallets(config: {
  contractAddress: string;
  rpcUrl: string;
}) {
  const dataStorage = initInMemoryDataStorage(config);
  const credentialWallet = await initCredentialWallet(dataStorage);
  const memoryKeyStore = new InMemoryPrivateKeyStore();

  const identityWallet = await initIdentityWallet(dataStorage, credentialWallet, memoryKeyStore);

  return {
    dataStorage,
    credentialWallet,
    identityWallet,
  };
}

export function initInMemoryDataStorage({
  contractAddress,
  rpcUrl,
}: {
  contractAddress: string;
  rpcUrl: string;
}): IDataStorage {
  const conf: EthConnectionConfig = defaultEthConnectionConfig;
  conf.contractAddress = contractAddress;
  conf.url = rpcUrl;

  // change here priority fees in case transaction is stuck or processing too long
  // conf.maxPriorityFeePerGas = '250000000000' - 250 gwei
  // conf.maxFeePerGas = '250000000000' - 250 gwei

  const dataStorage = {
    credential: new CredentialStorage(new InMemoryDataSource<W3CCredential>()),
    identity: new IdentityStorage(
      new InMemoryDataSource<Identity>(),
      new InMemoryDataSource<Profile>(),
    ),
    mt: new InMemoryMerkleTreeStorage(40),

    states: new EthStateStorage(defaultEthConnectionConfig),
  };

  return dataStorage;
}

export async function initCredentialWallet(dataStorage: IDataStorage): Promise<CredentialWallet> {
  const resolvers = new CredentialStatusResolverRegistry();
  resolvers.register(CredentialStatusType.SparseMerkleTreeProof, new IssuerResolver());
  resolvers.register(
    CredentialStatusType.Iden3ReverseSparseMerkleTreeProof,
    new RHSResolver(dataStorage.states),
  );
  resolvers.register(
    CredentialStatusType.Iden3OnchainSparseMerkleTreeProof2023,
    new OnChainResolver([defaultEthConnectionConfig]),
  );
  resolvers.register(CredentialStatusType.Iden3commRevocationStatusV1, new AgentResolver());

  return new CredentialWallet(dataStorage, resolvers);
}

export async function initCircuitStorage(): Promise<ICircuitStorage> {
  return new FSCircuitStorage({
    dirname: path.join(__dirname, "../../circuits"),
  });
}

export async function initIdentityWallet(
  dataStorage: IDataStorage,
  credentialWallet: ICredentialWallet,
  keyStore: AbstractPrivateKeyStore,
): Promise<IIdentityWallet> {
  const bjjProvider = new BjjProvider(KmsKeyType.BabyJubJub, keyStore);
  const kms = new KMS();
  kms.registerKeyProvider(KmsKeyType.BabyJubJub, bjjProvider);

  const credentialStatusPublisherRegistry = new CredentialStatusPublisherRegistry();
  credentialStatusPublisherRegistry.register(
    CredentialStatusType.Iden3ReverseSparseMerkleTreeProof,
    new Iden3SmtRhsCredentialStatusPublisher(),
  );

  return new IdentityWallet(kms, dataStorage, credentialWallet, {
    credentialStatusPublisherRegistry,
  });
}

export async function initProofService(
  identityWallet: IIdentityWallet,
  credentialWallet: ICredentialWallet,
  stateStorage: IStateStorage,
  circuitStorage: ICircuitStorage,
): Promise<ProofService> {
  return new ProofService(identityWallet, credentialWallet, circuitStorage, stateStorage, {
    ipfsGatewayURL: "https://ipfs.io",
  });
}

function createKYCAgeCredential(did: core.DID) {
  const credentialRequest: CredentialRequest = {
    credentialSchema:
      "https://raw.githubusercontent.com/iden3/claim-schema-vocab/main/schemas/json/KYCAgeCredential-v3.json",
    type: "KYCAgeCredential",
    credentialSubject: {
      id: did.string(),
      birthday: 19960424,
      documentType: 99,
    },
    expiration: 12345678888,
    revocationOpts: {
      type: CredentialStatusType.Iden3ReverseSparseMerkleTreeProof,
      id: "https://rhs-staging.polygonid.me",
    },
  };
  return credentialRequest;
}
