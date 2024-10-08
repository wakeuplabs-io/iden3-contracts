import { ethers, network, upgrades, ignition } from "hardhat";
import { Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { deployPoseidons } from "./PoseidonDeployHelper";
import { chainIdDefaultIdTypeMap } from "./ChainIdDefTypeMap";
import { GenesisUtilsWrapper, PrimitiveTypeUtilsWrapper } from "../typechain";
import {
  StateModule,
  StateLibModule,
  SmtLibModule,
  VerifierStateTransitionModule,
  VerifierStubModule,
  UniversalVerifierModule,
  IdentityTreeStoreModule,
  VerifierMTPWrapperModule,
  VerifierSigWrapperModule,
  VerifierV3WrapperModule,
  CredentialAtomicQueryMTPV2ValidatorModule,
  CredentialAtomicQuerySigV2ValidatorModule,
  CredentialAtomicQueryV3ValidatorModule,
} from "../ignition";

const SMT_MAX_DEPTH = 64;

export class DeployHelper {
  constructor(
    private signers: SignerWithAddress[],
    private readonly enableLogging: boolean = false,
  ) {}

  static async initialize(
    signers: SignerWithAddress[] | null = null,
    enableLogging = false,
  ): Promise<DeployHelper> {
    let sgrs;
    if (signers === null) {
      sgrs = await ethers.getSigners();
    } else {
      sgrs = signers;
    }
    return new DeployHelper(sgrs, enableLogging);
  }
  async deployState(
    supportedIdTypes: string[] = [],
    verifierContractName: "VerifierStateTransition" | "VerifierStub" = "VerifierStateTransition",
    deployStrategy: "basic" | "create2" = "basic",
  ): Promise<{
    state: Contract;
    verifier: Contract;
    stateLib: Contract;
    smtLib: Contract;
    poseidon1: Contract;
    poseidon2: Contract;
    poseidon3: Contract;
    poseidon4: Contract;
    defaultIdType;
  }> {
    this.log("======== State: deploy started ========");

    const { defaultIdType, chainId } = await this.getDefaultIdType();
    this.log(`found defaultIdType ${defaultIdType} for chainId ${chainId}`);

    const owner = this.signers[0];

    this.log("deploying verifier...");

    let verifier;
    if (verifierContractName === "VerifierStateTransition") {
      const verifierDeploy = await ignition.deploy(VerifierStateTransitionModule, {
        strategy: deployStrategy,
      });
      verifier = verifierDeploy.verifierStateTransition;
    } else if (verifierContractName === "VerifierStub") {
      const verifierDeploy = await ignition.deploy(VerifierStubModule, {
        strategy: deployStrategy,
      });
      verifier = verifierDeploy.verifierStub;
    } else {
      throw new Error("invalid verifierContractName");
    }
    await verifier.waitForDeployment();
    this.log(
      `${verifierContractName} contract deployed to address ${await verifier.getAddress()} from ${await owner.getAddress()}`,
    );

    this.log("deploying poseidons...");
    const [poseidon1Elements, poseidon2Elements, poseidon3Elements, poseidon4Elements] =
      await deployPoseidons([1, 2, 3, 4], deployStrategy);

    this.log("deploying SmtLib...");
    const smtLib = await this.deploySmtLib(
      await poseidon2Elements.getAddress(),
      await poseidon3Elements.getAddress(),
      "SmtLib",
      deployStrategy,
    );

    this.log("deploying StateLib...");
    const stateLib = await this.deployStateLib(deployStrategy);

    this.log("deploying state...");
    let state;
    if (deployStrategy !== "create2") {
      const StateFactory = await ethers.getContractFactory("State", {
        libraries: {
          StateLib: await stateLib.getAddress(),
          SmtLib: await smtLib.getAddress(),
          PoseidonUnit1L: await poseidon1Elements.getAddress(),
        },
      });
      state = await upgrades.deployProxy(
        StateFactory,
        [await verifier.getAddress(), defaultIdType, await owner.getAddress()],
        {
          unsafeAllowLinkedLibraries: true,
        },
      );
      await state.waitForDeployment();
    } else {
      const stateDeploy = await ignition.deploy(StateModule, {
        parameters: {
          StateProxyModule: {
            stateLibAddress: await stateLib.getAddress(),
            smtLibAddress: await smtLib.getAddress(),
            poseidonUnit1LAddress: await poseidon1Elements.getAddress(),
          },
        },
        strategy: deployStrategy,
      });
      state = stateDeploy.state;
      await state.initialize(await verifier.getAddress(), defaultIdType, await owner.getAddress());
    }
    await state.waitForDeployment();
    this.log(
      `State contract deployed to address ${await state.getAddress()} from ${await owner.getAddress()}`,
    );

    if (supportedIdTypes.length) {
      supportedIdTypes = [...new Set(supportedIdTypes)];
      for (const idType of supportedIdTypes) {
        const tx = await state.setSupportedIdType(idType, true);
        await tx.wait();
        this.log(`Added id type ${idType}`);
      }
    }
    this.log("======== State: deploy completed ========");

    return {
      state,
      verifier,
      stateLib,
      smtLib,
      poseidon1: poseidon1Elements,
      poseidon2: poseidon2Elements,
      poseidon3: poseidon3Elements,
      poseidon4: poseidon4Elements,
      defaultIdType,
    };
  }

  async upgradeState(
    stateAddress: string,
    redeployVerifier = true,
    verifierContractName = "VerifierStateTransition",
    stateContractName = "State",
  ): Promise<{
    state: Contract;
    verifier: Contract;
    smtLib: Contract;
    stateLib: Contract;
    poseidon1: Contract;
    poseidon2: Contract;
    poseidon3: Contract;
  }> {
    this.log("======== State: upgrade started ========");

    let stateContract: Contract = await ethers.getContractAt("State", stateAddress);

    const proxyAdminOwner = this.signers[0];
    const stateAdminOwner = this.signers[1];

    this.log("deploying verifier...");

    let verifierContract: Contract;
    if (redeployVerifier) {
      const verifierFactory = await ethers.getContractFactory(verifierContractName);
      verifierContract = await verifierFactory.deploy();
      await verifierContract.waitForDeployment();
      this.log(
        `${verifierContractName} contract deployed to address ${await verifierContract.getAddress()} from ${await proxyAdminOwner.getAddress()}`,
      );
    } else {
      verifierContract = await ethers.getContractAt(
        "VerifierStateTransition",
        await stateContract.getVerifier(),
      );
    }

    this.log("deploying poseidons...");
    const [poseidon1Elements, poseidon2Elements, poseidon3Elements] = await deployPoseidons([
      1, 2, 3,
    ]);

    this.log("deploying SmtLib...");
    const smtLib = await this.deploySmtLib(
      await poseidon2Elements.getAddress(),
      await poseidon3Elements.getAddress(),
    );

    this.log("deploying StateLib...");
    const stateLib = await this.deployStateLib();

    this.log("upgrading state...");

    /*

    // in case you need to redefine priority fee config for upgrade operation

    const feedata = await owner.provider!.getFeeData();
    feedata.maxPriorityFeePerGas = 100000000000n;
    owner.provider!.getFeeData = async () => (feedata);
   */
    const StateFactory = await ethers.getContractFactory(stateContractName, {
      signer: proxyAdminOwner,
      libraries: {
        StateLib: await stateLib.getAddress(),
        SmtLib: await smtLib.getAddress(),
        PoseidonUnit1L: await poseidon1Elements.getAddress(),
      },
    });
    stateContract = await upgrades.upgradeProxy(stateAddress, StateFactory, {
      unsafeAllowLinkedLibraries: true,
    });
    await stateContract.waitForDeployment();
    this.log(
      `State contract upgraded at address ${await stateContract.getAddress()} from ${await proxyAdminOwner.getAddress()}`,
    );

    this.log("======== State: upgrade completed ========");
    return {
      state: stateContract,
      verifier: verifierContract,
      smtLib,
      stateLib,
      poseidon1: poseidon1Elements,
      poseidon2: poseidon2Elements,
      poseidon3: poseidon3Elements,
    };
  }

  async deploySmtLib(
    poseidon2Address: string,
    poseidon3Address: string,
    contractName = "SmtLib",
    deployStrategy: "basic" | "create2" = "basic",
  ): Promise<Contract> {
    const smtLibDeploy = await ignition.deploy(SmtLibModule, {
      parameters: {
        SmtLibModule: {
          poseidon2ElementAddress: poseidon2Address,
          poseidon3ElementAddress: poseidon3Address,
        },
      },
      strategy: deployStrategy,
    });

    const smtLib = smtLibDeploy.smtLib;
    await smtLib.waitForDeployment();
    this.enableLogging && this.log(`${contractName} deployed to:  ${await smtLib.getAddress()}`);

    return smtLib;
  }

  async deployStateLib(deployStrategy: "basic" | "create2" = "basic"): Promise<Contract> {
    const stateLibDeploy = await ignition.deploy(StateLibModule, {
      strategy: deployStrategy,
    });
    const stateLib = stateLibDeploy.stateLib;
    await stateLib.waitForDeployment();
    this.enableLogging && this.log(`StateLib deployed to:  ${await stateLib.getAddress()}`);

    return stateLib;
  }

  async deploySmtLibTestWrapper(maxDepth: number = SMT_MAX_DEPTH): Promise<Contract> {
    const contractName = "SmtLibTestWrapper";

    this.log("deploying poseidons...");
    const [poseidon2Elements, poseidon3Elements] = await deployPoseidons([2, 3]);

    const smtLib = await this.deploySmtLib(
      await poseidon2Elements.getAddress(),
      await poseidon3Elements.getAddress(),
    );

    const SmtWrapper = await ethers.getContractFactory(contractName, {
      libraries: {
        SmtLib: await smtLib.getAddress(),
      },
    });
    const smtWrapper = await SmtWrapper.deploy(maxDepth);
    await smtWrapper.waitForDeployment();
    this.enableLogging &&
      this.log(`${contractName} deployed to:  ${await smtWrapper.getAddress()}`);

    return smtWrapper;
  }

  async deployStateLibTestWrapper(): Promise<Contract> {
    const contractName = "StateLibTestWrapper";

    const stateLib = await this.deployStateLib();

    const StateLibWrapper = await ethers.getContractFactory(contractName, {
      libraries: {
        StateLib: await stateLib.getAddress(),
      },
    });
    const stateLibWrapper = await StateLibWrapper.deploy();
    await stateLibWrapper.waitForDeployment();
    this.enableLogging &&
      this.log(`${contractName} deployed to:  ${await stateLibWrapper.getAddress()}`);

    return stateLibWrapper;
  }

  async deployBinarySearchTestWrapper(): Promise<Contract> {
    this.log("deploying poseidons...");
    const [poseidon2Elements, poseidon3Elements] = await deployPoseidons([2, 3]);

    const smtLib = await this.deploySmtLib(
      await poseidon2Elements.getAddress(),
      await poseidon3Elements.getAddress(),
    );

    const bsWrapperName = "BinarySearchTestWrapper";
    const BSWrapper = await ethers.getContractFactory(bsWrapperName, {
      libraries: {
        SmtLib: await smtLib.getAddress(),
      },
    });
    const bsWrapper = await BSWrapper.deploy();
    await bsWrapper.waitForDeployment();
    this.enableLogging &&
      this.log(`${bsWrapperName} deployed to:  ${await bsWrapper.getAddress()}`);

    return bsWrapper;
  }

  async deployValidatorContracts(
    validatorType: "mtpV2" | "sigV2" | "v3",
    stateAddress: string,
    deployStrategy: "basic" | "create2" = "basic",
  ): Promise<{
    state: any;
    verifierWrapper: any;
    validator: any;
  }> {
    if (deployStrategy === "create2") {
      let verifierContractWrapperModule, validatorContractModule;
      switch (validatorType) {
        case "mtpV2":
          verifierContractWrapperModule = VerifierMTPWrapperModule;
          validatorContractModule = CredentialAtomicQueryMTPV2ValidatorModule;
          break;
        case "sigV2":
          verifierContractWrapperModule = VerifierSigWrapperModule;
          validatorContractModule = CredentialAtomicQuerySigV2ValidatorModule;
          break;
        case "v3":
          verifierContractWrapperModule = VerifierV3WrapperModule;
          validatorContractModule = CredentialAtomicQueryV3ValidatorModule;
          break;
      }

      const wrapperDeploy = await ignition.deploy(verifierContractWrapperModule, {
        strategy: deployStrategy,
      });
      const verifierWrapper = wrapperDeploy.wrapper;
      await verifierWrapper.waitForDeployment();
      console.log(`${validatorType} Wrapper deployed to: ${await verifierWrapper.getAddress()}`);

      const validatorDeploy = await ignition.deploy(validatorContractModule, {
        strategy: deployStrategy,
      });
      const validator = validatorDeploy.validator;
      await validator.waitForDeployment();
      console.log(`${validatorType} Validator deployed to: ${await validator.getAddress()}`);
      await validator.initialize(await verifierWrapper.getAddress(), stateAddress);
      console.log("validator contract initialized");

      const state = await ethers.getContractAt("State", stateAddress);
      return {
        validator,
        verifierWrapper,
        state,
      };
    }
    let verifierContractWrapperName, validatorContractName;
    switch (validatorType) {
      case "mtpV2":
        verifierContractWrapperName = "VerifierMTPWrapper";
        validatorContractName = "CredentialAtomicQueryMTPV2Validator";
        break;
      case "sigV2":
        verifierContractWrapperName = "VerifierSigWrapper";
        validatorContractName = "CredentialAtomicQuerySigV2Validator";
        break;
      case "v3":
        verifierContractWrapperName = "VerifierV3Wrapper";
        validatorContractName = "CredentialAtomicQueryV3Validator";
        break;
    }

    const ValidatorContractVerifierWrapper = await ethers.getContractFactory(
      verifierContractWrapperName,
    );
    const validatorContractVerifierWrapper = await ValidatorContractVerifierWrapper.deploy();

    await validatorContractVerifierWrapper.waitForDeployment();
    console.log(
      "Validator Verifier Wrapper deployed to:",
      await validatorContractVerifierWrapper.getAddress(),
    );

    const ValidatorContract = await ethers.getContractFactory(validatorContractName);

    const validatorContractProxy = await upgrades.deployProxy(ValidatorContract, [
      await validatorContractVerifierWrapper.getAddress(),
      stateAddress,
    ]);

    await validatorContractProxy.waitForDeployment();
    console.log(
      `${validatorContractName} deployed to: ${await validatorContractProxy.getAddress()}`,
    );

    const state = await ethers.getContractAt("State", stateAddress);
    return {
      validator: validatorContractProxy,
      verifierWrapper: validatorContractVerifierWrapper,
      state,
    };
  }

  async deployValidatorStub(): Promise<Contract> {
    const stub = await ethers.getContractFactory("ValidatorStub");
    const stubInstance = await stub.deploy();
    await stubInstance.waitForDeployment();

    console.log("Validator stub  deployed to:", await stubInstance.getAddress());

    return stubInstance;
  }

  async upgradeValidator(
    validatorAddress: string,
    validatorContractName: string,
  ): Promise<{
    validator: Contract;
  }> {
    this.log("======== Validator: upgrade started ========");

    const owner = this.signers[0];

    this.log("upgrading validator...");
    const ValidatorFactory = await ethers.getContractFactory(validatorContractName);
    const validator = await upgrades.upgradeProxy(validatorAddress, ValidatorFactory);
    await validator.waitForDeployment();
    this.log(
      `Validator ${validatorContractName} upgraded at address ${await validator.getAddress()} from ${await owner.getAddress()}`,
    );

    this.log("======== Validator: upgrade completed ========");
    return {
      validator: validator,
    };
  }

  async deployGenesisUtilsWrapper(): Promise<GenesisUtilsWrapper> {
    const GenesisUtilsWrapper = await ethers.getContractFactory("GenesisUtilsWrapper");
    const genesisUtilsWrapper = await GenesisUtilsWrapper.deploy();
    console.log("GenesisUtilsWrapper deployed to:", await genesisUtilsWrapper.getAddress());
    return genesisUtilsWrapper;
  }
  async deployPrimitiveTypeUtilsWrapper(): Promise<PrimitiveTypeUtilsWrapper> {
    const PrimitiveTypeUtilsWrapper = await ethers.getContractFactory("PrimitiveTypeUtilsWrapper");
    const primitiveTypeUtilsWrapper = await PrimitiveTypeUtilsWrapper.deploy();
    console.log("PrimitiveUtilsWrapper deployed to:", await primitiveTypeUtilsWrapper.getAddress());
    return primitiveTypeUtilsWrapper;
  }

  async deployZKPVerifier(owner: SignerWithAddress): Promise<Contract> {
    const Verifier = await ethers.getContractFactory("ZKPVerifierWrapper");
    // const zkpVerifier = await ZKPVerifier.deploy(await owner.getAddress());
    const verifier = await upgrades.deployProxy(Verifier, [await owner.getAddress()]);
    await verifier.waitForDeployment();
    console.log("ZKPVerifierWrapper deployed to:", await verifier.getAddress());
    return verifier;
  }

  async deployUniversalVerifier(
    owner: SignerWithAddress | undefined,
    deployStrategy: "basic" | "create2" = "basic",
  ): Promise<Contract> {
    if (!owner) {
      owner = this.signers[0];
    }
    const verifierDeploy = await ignition.deploy(UniversalVerifierModule, {
      strategy: deployStrategy,
    });
    const verifier = verifierDeploy.universalVerifier;
    await verifier.waitForDeployment();
    await verifier.initialize();
    console.log("UniversalVerifier deployed to:", await verifier.getAddress());
    return verifier;
  }

  async getDefaultIdType(): Promise<{ defaultIdType: number; chainId: number }> {
    const chainId = parseInt(await network.provider.send("eth_chainId"), 16);
    const defaultIdType = chainIdDefaultIdTypeMap.get(chainId);
    if (!defaultIdType) {
      throw new Error(`Failed to find defaultIdType in Map for chainId ${chainId}`);
    }
    return { defaultIdType, chainId };
  }

  async deployIdentityTreeStore(
    stateContractAddress: string,
    poseidon2ElementsAddress: string = "",
    poseidon3ElementsAddress: string = "",
    deployStrategy: "basic" | "create2" = "basic",
  ): Promise<{
    identityTreeStore: Contract;
  }> {
    if (!poseidon2ElementsAddress || !poseidon3ElementsAddress) {
      const [poseidon2Elements, poseidon3Elements] = await deployPoseidons([2, 3], deployStrategy);
      poseidon2ElementsAddress = await poseidon2Elements.getAddress();
      poseidon3ElementsAddress = await poseidon3Elements.getAddress();
    }

    if (deployStrategy === 'create2') {
      const identityTreeStoreDeploy = await ignition.deploy(IdentityTreeStoreModule, {
        parameters: {
          IdentityTreeStoreProxyModule: {
            poseidonUnit2LAddress: poseidon2ElementsAddress,
            poseidonUnit3LAddress: poseidon3ElementsAddress,
          },
        },
        strategy: deployStrategy,
      });

      const identityTreeStore = identityTreeStoreDeploy.identityTreeStore;
      await identityTreeStore.waitForDeployment();
      await identityTreeStore.initialize(stateContractAddress);
      console.log("\nIdentityTreeStore deployed to:", await identityTreeStore.getAddress());
      return {
        identityTreeStore,
      };
    } else {
      const IdentityTreeStore = await ethers.getContractFactory("IdentityTreeStore", {
        libraries: {
          PoseidonUnit2L: poseidon2ElementsAddress,
          PoseidonUnit3L: poseidon3ElementsAddress,
        },
      });

      const identityTreeStore = await upgrades.deployProxy(
        IdentityTreeStore,
        [stateContractAddress],
        { unsafeAllow: ["external-library-linking"] },
      );
      await identityTreeStore.waitForDeployment();
      console.log(await identityTreeStore.getAddress());
      return {
        identityTreeStore,
      };
    }
  }

  async upgradeIdentityTreeStore(
    identityTreeStoreAddress: string,
    stateAddress: string,
  ): Promise<Contract> {
    const proxyAdminOwnerSigner = this.signers[0];

    const [poseidon2Elements, poseidon3Elements] = await deployPoseidons([2, 3]);

    const IdentityTreeStore = await ethers.getContractFactory("IdentityTreeStore", {
      libraries: {
        PoseidonUnit2L: await poseidon2Elements.getAddress(),
        PoseidonUnit3L: await poseidon3Elements.getAddress(),
      },
      signer: proxyAdminOwnerSigner,
    });

    const identityTreeStore = await upgrades.upgradeProxy(
      identityTreeStoreAddress,
      IdentityTreeStore,
      {
        unsafeAllow: ["external-library-linking"],
        call: {
          fn: "initialize",
          args: [stateAddress],
        },
      },
    );

    await identityTreeStore.waitForDeployment();

    this.log(
      `IdentityTreeStore contract upgraded at address ${await identityTreeStore.getAddress()} from ${await proxyAdminOwnerSigner.getAddress()}`,
    );

    return identityTreeStore;
  }

  private log(...args): void {
    this.enableLogging && console.log(args);
  }
}
