require("dotenv").config();
const { read, write } = require("../common/web3-service");
const DEPLOY_INFO = require("../../deploy.json");
const FARMING_FACTORY_ABI = require("../../artifacts/contracts/farming/FarmingFactory.sol/FarmingFactory.json").abi;
const SAVING_FARMING_ABI = require("../../artifacts/contracts/farming/SavingFarming.sol/SavingFarming.json").abi;
const LOCK_FARMING_ABI = require("../../artifacts/contracts/farming/LockFarming.sol/LockFarming.json").abi;
const LOTTERY_ABI = require("../../artifacts/contracts/lottery/Lottery.sol/Lottery.json").abi;
const DFY_TOKEN_ABI = require("../../artifacts/contracts/tokens/DFYToken.sol/DFYToken.json").abi;
const LP_TOKEN_ABI = require("../../abi/pair.json");
const DEPLOYER = process.env.ADDRESS_1;
const DEPLOYER_PRIVK = process.env.PRIVATE_KEY_1;
const REWARD_WALLET = process.env.ADDRESS_2;
const REWARD_WALLET_PRIVK = process.env.PRIVATE_KEY_2;
const PARTICIPANT_1 = process.env.ADDRESS_3;
const PARTICIPANT_1_PRIVK = process.env.PRIVATE_KEY_3;
const PARTICIPANT_2 = process.env.ADDRESS_4;
const PARTICIPANT_2_PRIVK = process.env.PRIVATE_KEY_4;
const ENVIRONMENT = process.argv[2];
const SUPPORTED_ENVIRONMENTS = ["dev2", "staging", "beta", "pre-live", "live"];
const ERC20_AMOUNT = "500000000000000000000000000";
const MONTH = 30 * 24 * 60 * 60;
const TOTAL_REWARD_PER_MONTH = "20000000000000000000";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
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
          (j + 1) * 5 * 60,
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
  let contractCollection = [];
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
    contractCollection.push(info);
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
  console.log("Sending some LINKs to Lottery contract...");
  await write(
    CHAIN_ID,
    DEPLOY_INFO[ENVIRONMENT].LINK,
    DFY_TOKEN_ABI,
    "transfer",
    [DEPLOY_INFO[ENVIRONMENT].Lottery, "200000000000000000"],
    [DEPLOYER, DEPLOYER_PRIVK]
  );

  return contractCollection;
}

async function createTestTransactions() {
  if (!SUPPORTED_ENVIRONMENTS.includes(ENVIRONMENT)) {
    console.log("Wrong environment!");
    process.exit(1);
  }
  const CHAIN_ID = (ENVIRONMENT === "pre-live" || ENVIRONMENT === "live") ? 56 : 97;

  // let contractCollection = await setup();
  // let savingFarmingAddr = contractCollection[0].savingFarming;
  let savingFarmingAddr = "0x9fcd8cffd42ebc4bc35fc5062a28ba2f06de4dab";
  // let lockFarmingAddr = contractCollection[0].lockFarming[0];

  // Send some LPs to SavingFarming contract
  // console.log(`Sending some LPs to SavingFarming contract at ${savingFarmingAddr}...`);
  // await write(
  //   CHAIN_ID,
  //   DEPLOY_INFO[ENVIRONMENT].LpToken,
  //   LP_TOKEN_ABI,
  //   "approve",
  //   [savingFarmingAddr, "10000000000000000000"],
  //   [PARTICIPANT_1, PARTICIPANT_1_PRIVK]
  // );
  // await write(
  //   CHAIN_ID,
  //   savingFarmingAddr,
  //   SAVING_FARMING_ABI,
  //   "deposit",
  //   ["10000000000000000000"],
  //   [PARTICIPANT_1, PARTICIPANT_1_PRIVK]
  // );

  // Claim interest from SavingFarming contract
  // console.log(`Claiming all interest from SavingFarming contract at ${savingFarmingAddr}...`);
  // await write(
  //   CHAIN_ID,
  //   savingFarmingAddr,
  //   SAVING_FARMING_ABI,
  //   "claimInterest",
  //   [],
  //   [PARTICIPANT_1, PARTICIPANT_1_PRIVK]
  // );

  // Withdraw some LPs from SavingFarming contract
  // console.log(`Withdrawing some LPs from SavingFarming contract at ${savingFarmingAddr}...`);
  // await write(
  //   CHAIN_ID,
  //   savingFarmingAddr,
  //   SAVING_FARMING_ABI,
  //   "withdraw",
  //   ["3000000000000000000"],
  //   [PARTICIPANT_1, PARTICIPANT_1_PRIVK]
  // );

  // Send some LPs from SavingFarming to LockFarming
  // console.log(`Transfering some LPs from SavingFarming to LockFarming at ${lockFarmingAddr}...`);
  // await write(
  //   CHAIN_ID,
  //   savingFarmingAddr,
  //   SAVING_FARMING_ABI,
  //   "transferToLockFarming",
  //   ["6000000000000000000", 0],
  //   [PARTICIPANT_1, PARTICIPANT_1_PRIVK]
  // );

  // // Deposit some LPs to LockFarming
  // console.log(`Sending some LPs to LockFarming contract at ${lockFarmingAddr}...`);
  // await write(
  //   CHAIN_ID,
  //   DEPLOY_INFO[ENVIRONMENT].LpToken,
  //   LP_TOKEN_ABI,
  //   "approve",
  //   [lockFarmingAddr, "4000000000000000000"],
  //   [PARTICIPANT_2, PARTICIPANT_2_PRIVK]
  // );
  // await write(
  //   CHAIN_ID,
  //   lockFarmingAddr,
  //   LOCK_FARMING_ABI,
  //   "deposit",
  //   ["4000000000000000000"],
  //   [PARTICIPANT_2, PARTICIPANT_2_PRIVK]
  // );

  // // Claim interest of this lock item
  // console.log(`Claiming all interest of this lock item...`);
  // await write(
  //   CHAIN_ID,
  //   lockFarmingAddr,
  //   LOCK_FARMING_ABI,
  //   "claimInterest",
  //   [0],
  //   [PARTICIPANT_2, PARTICIPANT_2_PRIVK]
  // );

  // // Claim all interest from LockFarming program
  // console.log(`Claiming all interest from LockFarming program...`);
  // await write(
  //   CHAIN_ID,
  //   lockFarmingAddr,
  //   LOCK_FARMING_ABI,
  //   "claimAllInterest",
  //   [],
  //   [PARTICIPANT_2, PARTICIPANT_2_PRIVK]
  // );

  // // Deposit some LPs to LockFarming
  // console.log(`Sending some LPs to LockFarming contract at ${lockFarmingAddr}...`);
  // await write(
  //   CHAIN_ID,
  //   DEPLOY_INFO[ENVIRONMENT].LpToken,
  //   LP_TOKEN_ABI,
  //   "approve",
  //   [lockFarmingAddr, "7000000000000000000"],
  //   [PARTICIPANT_1, PARTICIPANT_1_PRIVK]
  // );
  // await write(
  //   CHAIN_ID,
  //   lockFarmingAddr,
  //   LOCK_FARMING_ABI,
  //   "deposit",
  //   ["7000000000000000000"],
  //   [PARTICIPANT_1, PARTICIPANT_1_PRIVK]
  // );

  // // Schedule next lottery round
  // console.log(`Scheduling next lottery round...`);
  // await write(
  //   CHAIN_ID,
  //   DEPLOY_INFO[ENVIRONMENT].Lottery,
  //   LOTTERY_ABI,
  //   "scheduleNextLottery",
  //   [Math.floor(Date.now() / 1000) + 10, 1, [DEPLOY_INFO[ENVIRONMENT].LpToken], [2]],
  //   [DEPLOYER, DEPLOYER_PRIVK]
  // );

  // // Spin lottery reward
  // console.log(`Spinning lottery and then award the winner...`);
  // sleep(12000);
  // await write(
  //   CHAIN_ID,
  //   DEPLOY_INFO[ENVIRONMENT].Lottery,
  //   LOTTERY_ABI,
  //   "spinReward",
  //   [2, "1200000000000000000"],
  //   [DEPLOYER, DEPLOYER_PRIVK]
  // );
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
};

// createTestTransactions();
// createFarmingPools();
setup();