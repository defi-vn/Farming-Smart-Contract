require("dotenv").config();
const { read, write } = require("../common/web3-service");
const DEPLOY_INFO = require("../../deploy.json");
const FARMING_FACTORY_ABI = require("../../artifacts/contracts/farming/FarmingFactory.sol/FarmingFactory.json").abi;
const LOTTERY_ABI = require("../../artifacts/contracts/lottery/Lottery.sol/Lottery.json").abi;
const DFY_TOKEN_ABI = require("../../artifacts/contracts/tokens/DFYToken.sol/DFYToken.json").abi;
const DEPLOYER = process.env.ADDRESS_1;
const DEPLOYER_PRIVK = process.env.PRIVATE_KEY_1;
const REWARD_WALLET = process.env.ADDRESS_2;
const REWARD_WALLET_PRIVK = process.env.PRIVATE_KEY_2;
const ENVIRONMENT = process.argv[2];
const SUPPORTED_ENVIRONMENTS = ["dev2", "staging", "beta", "pre-live", "live"];
const ERC20_AMOUNT = "500000000000000000000000000";
const TOTAL_REWARD_PER_MONTH = "2000000000000000000";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const OPERATORS = ["0x752F4d07DB335ae231014A74d23D98fcF99f7fe9"];
const SUPPORTED_LPTOKENS = [
  {
    pair: "0xe8ea253701EcCA7c3DE03E801850cf46573BE88c",
    router: "0x9Ac64Cc6e4415144C455BD8E4837Fea55603e5c3"
  },
  {
    pair: "0x31e2eE9573273C7e89105b6ca5deB8aeA87D45b6",
    router: "0x9Ac64Cc6e4415144C455BD8E4837Fea55603e5c3"
  },
  {
    pair: "0xb38531b3d3872965A7965B124f982B39dd36eF0B",
    router: "0x3380ae82e39e42ca34ebed69af67faa0683bb5c1"
  },
  {
    pair: "0x3014EE01031567F49c9f80cFEB64828dD97876Ce",
    router: "0x3380ae82e39e42ca34ebed69af67faa0683bb5c1"
  }
];

async function createFarmingPools() {
  if (!SUPPORTED_ENVIRONMENTS.includes(ENVIRONMENT)) {
    console.log("Wrong environment!");
    process.exit(1);
  }
  const CHAIN_ID = (ENVIRONMENT === "pre-live" || ENVIRONMENT === "live") ? 56 : 97;
  const THREE_MONTHS = ENVIRONMENT === "live" ? 3 * 30 * 24 * 60 * 60 : 5 * 60;

  console.log("=============DEPLOY===================");
  for (let i = 0; i < SUPPORTED_LPTOKENS.length; i++) {
    let savingFarmingAddr = await read(
      CHAIN_ID,
      DEPLOY_INFO[ENVIRONMENT].FarmingFactory,
      FARMING_FACTORY_ABI,
      "getSavingFarmingContract",
      [SUPPORTED_LPTOKENS[i].pair]
    );
    if (savingFarmingAddr !== ZERO_ADDRESS)
      console.log(`SavingFarming pool of LP Token ${SUPPORTED_LPTOKENS[i].pair} has already been created before at ${savingFarmingAddr}!`);
    else {
      console.log(`Creating SavingFarming pool for LP Token at ${SUPPORTED_LPTOKENS[i].pair}...`);
      await write(
        CHAIN_ID,
        DEPLOY_INFO[ENVIRONMENT].FarmingFactory,
        FARMING_FACTORY_ABI,
        "createSavingFarming",
        [
          SUPPORTED_LPTOKENS[i].pair,
          DEPLOY_INFO[ENVIRONMENT].DFYToken,
          REWARD_WALLET,
          TOTAL_REWARD_PER_MONTH
        ],
        [DEPLOYER, DEPLOYER_PRIVK]
      );
    }

    console.log(`Creating LockFarming pool for LP Token at ${SUPPORTED_LPTOKENS[i].pair}...`);
    for (let j = 0; j < 4; j++)
      await write(
        CHAIN_ID,
        DEPLOY_INFO[ENVIRONMENT].FarmingFactory,
        FARMING_FACTORY_ABI,
        "createLockFarming",
        [
          (j + 1) * THREE_MONTHS,
          SUPPORTED_LPTOKENS[i].pair,
          DEPLOY_INFO[ENVIRONMENT].DFYToken,
          REWARD_WALLET,
          TOTAL_REWARD_PER_MONTH
        ],
        [DEPLOYER, DEPLOYER_PRIVK]
      );
  }
  setup();
}

async function setup() {
  if (!SUPPORTED_ENVIRONMENTS.includes(ENVIRONMENT)) {
    console.log("Wrong environment!");
    process.exit(1);
  }
  const CHAIN_ID = (ENVIRONMENT === "pre-live" || ENVIRONMENT === "live") ? 56 : 97;

  console.log("==============SETUP===================");
  // Approve reward token for all SavingFarming and LockFarming contracts
  for (let i = 0; i < SUPPORTED_LPTOKENS.length; i++) {
    let lpToken = SUPPORTED_LPTOKENS[i].pair;
    console.log("LpToken:", lpToken);
    let savingFarmingAddr = await read(
      CHAIN_ID,
      DEPLOY_INFO[ENVIRONMENT].FarmingFactory,
      FARMING_FACTORY_ABI,
      "getSavingFarmingContract",
      [lpToken]
    );
    let info = {
      lpToken: lpToken,
      savingFarming: savingFarmingAddr,
      lockFarming: []
    };
    console.log(`Approving reward token for SavingFarming contract at ${savingFarmingAddr}...`);
    await write(
      CHAIN_ID,
      DEPLOY_INFO[ENVIRONMENT].DFYToken,
      DFY_TOKEN_ABI,
      "approve",
      [savingFarmingAddr, ERC20_AMOUNT],
      [REWARD_WALLET, REWARD_WALLET_PRIVK]
    );
    let numLockTypes = await read(
      CHAIN_ID,
      DEPLOY_INFO[ENVIRONMENT].FarmingFactory,
      FARMING_FACTORY_ABI,
      "getNumLockTypes",
      [lpToken]
    );
    for (let j = 0; j < parseInt(numLockTypes); j++) {
      let lockFarmingAddr = await read(
        CHAIN_ID,
        DEPLOY_INFO[ENVIRONMENT].FarmingFactory,
        FARMING_FACTORY_ABI,
        "getLockFarmingContract",
        [lpToken, j]
      );
      info.lockFarming.push(lockFarmingAddr);
      console.log(`Approving reward token for LockFarming contract at ${lockFarmingAddr}...`);
      await write(
        CHAIN_ID,
        DEPLOY_INFO[ENVIRONMENT].DFYToken,
        DFY_TOKEN_ABI,
        "approve",
        [lockFarmingAddr, ERC20_AMOUNT],
        [REWARD_WALLET, REWARD_WALLET_PRIVK]
      );
    }
  }

  // Approve reward token for Lottery contract
  console.log(`Approving reward token for Lottery contract at ${DEPLOY_INFO[ENVIRONMENT].Lottery}...`);
  await write(
    CHAIN_ID,
    DEPLOY_INFO[ENVIRONMENT].DFYToken,
    DFY_TOKEN_ABI,
    "approve",
    [DEPLOY_INFO[ENVIRONMENT].Lottery, ERC20_AMOUNT],
    [REWARD_WALLET, REWARD_WALLET_PRIVK]
  );

  // Send some LINKs to Lottery contract
  // console.log("Sending some LINKs to Lottery contract...");
  // await write(
  //   CHAIN_ID,
  //   DEPLOY_INFO[ENVIRONMENT].LINK,
  //   DFY_TOKEN_ABI,
  //   "transfer",
  //   [DEPLOY_INFO[ENVIRONMENT].Lottery, "1000000000000000000"],
  //   [DEPLOYER, DEPLOYER_PRIVK]
  // );

  // Set Lottery's operator roles
  console.log("Setting Lottery's operator roles...");
  let isOperators = [];
  for (let i = 0; i < OPERATORS.length; i++)
    isOperators.push(true);
  await write(
    CHAIN_ID,
    DEPLOY_INFO[ENVIRONMENT].Lottery,
    LOTTERY_ABI,
    "setOperators",
    [OPERATORS, isOperators],
    [DEPLOYER, DEPLOYER_PRIVK]
  );
}

createFarmingPools();