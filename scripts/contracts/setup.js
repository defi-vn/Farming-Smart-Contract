require("dotenv").config();
const { read, write } = require("../common/web3-service");
const DEPLOY_INFO = require("../../deploy.json");
const FARMING_FACTORY_ABI = require("../../artifacts/contracts/farming/FarmingFactory.sol/FarmingFactory.json").abi;
const SAVING_FARMING_ABI = require("../../artifacts/contracts/farming/SavingFarming.sol/SavingFarming.json").abi;
const LOCK_FARMING_ABI = require("../../artifacts/contracts/farming/LockFarming.sol/LockFarming.json").abi;
const LOTTERY_ABI = require("../../artifacts/contracts/lottery/Lottery.sol/Lottery.json").abi;
const DFY_TOKEN_ABI = require("../../artifacts/contracts/tokens/DFYToken.sol/DFYToken.json").abi;
const LP_TOKEN_ABI = require("../../artifacts/contracts/tokens/LpToken.sol/LpToken.json").abi;

const FARMING_FACTORY = "FarmingFactory";
const SAVING_FARMING = "SavingFarming";
const LOCK_FARMING = "LockFarming";
const LOTTERY = "Lottery";
const DFY_TOKEN = "DFYToken";
const LP_TOKEN = "LpToken";
const DEPLOYER = process.env.ADDRESS_1;
const DEPLOYER_PRIVK = process.env.PRIVATE_KEY_1;
const REWARD_WALLET = process.env.ADDRESS_2;
const REWARD_WALLET_PRIVK = process.env.PRIVATE_KEY_2;
const PARTICIPANT_1 = process.env.ADDRESS_3;
const PARTICIPANT_1_PRIVK = process.env.PRIVATE_KEY_3;
const PARTICIPANT_2 = process.env.ADDRESS_4;
const PARTICIPANT_2_PRIVK = process.env.PRIVATE_KEY_4;
const CHAIN_ID = 97;
const ERC20_AMOUNT = "500000000000000000000000000";

async function setup() {
  let contractCollection = [];
  // Approve reward token for all SavingFarming and LockFarming contracts
  let numLpTokens = await read(
    CHAIN_ID,
    DEPLOY_INFO.FarmingFactory,
    FARMING_FACTORY_ABI,
    "getNumSupportedLpTokens",
    []
  );
  for (let i = 0; i < parseInt(numLpTokens); i++) {
    let lpToken = await read(
      CHAIN_ID,
      DEPLOY_INFO.FarmingFactory,
      FARMING_FACTORY_ABI,
      "lpTokens",
      [i]
    );
    console.log("LpToken:", lpToken);
    let savingFarmingAddr = await read(
      CHAIN_ID,
      DEPLOY_INFO.FarmingFactory,
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
      DEPLOY_INFO.DFYToken,
      DFY_TOKEN_ABI,
      "approve",
      [savingFarmingAddr, ERC20_AMOUNT],
      [REWARD_WALLET, REWARD_WALLET_PRIVK]
    );
    let numLockTypes = await read(
      CHAIN_ID,
      DEPLOY_INFO.FarmingFactory,
      FARMING_FACTORY_ABI,
      "getNumLockTypes",
      [lpToken]
    );
    for (let j = 0; j < parseInt(numLockTypes); j++) {
      let lockFarmingAddr = await read(
        CHAIN_ID,
        DEPLOY_INFO.FarmingFactory,
        FARMING_FACTORY_ABI,
        "getLockFarmingContract",
        [lpToken, j]
      );
      info.lockFarming.push(lockFarmingAddr);
      console.log(`Approving reward token for LockFarming contract at ${lockFarmingAddr}...`);
      await write(
        CHAIN_ID,
        DEPLOY_INFO.DFYToken,
        DFY_TOKEN_ABI,
        "approve",
        [lockFarmingAddr, ERC20_AMOUNT],
        [REWARD_WALLET, REWARD_WALLET_PRIVK]
      );
    }
    contractCollection.push(info);
  }

  // Approve reward token for Lottery contract
  console.log(`Approving reward token for Lottery contract at ${DEPLOY_INFO.Lottery}...`);
  await write(
    CHAIN_ID,
    DEPLOY_INFO.DFYToken,
    DFY_TOKEN_ABI,
    "approve",
    [DEPLOY_INFO.Lottery, ERC20_AMOUNT],
    [REWARD_WALLET, REWARD_WALLET_PRIVK]
  );

  return contractCollection;
}

async function createTestTransactions() {
  let contractCollection = await setup();

  // Send some LPs to SavingFarming contract
  let savingFarmingAddr = contractCollection[0].savingFarming;
  let lockFarmingAddr = contractCollection[0].lockFarming[0];
  console.log(`Sending some LPs to SavingFarming contract at ${savingFarmingAddr}...`);
  await write(
    CHAIN_ID,
    DEPLOY_INFO.LpToken,
    LP_TOKEN_ABI,
    "approve",
    [savingFarmingAddr, "10000000000000000000"],
    [PARTICIPANT_1, PARTICIPANT_1_PRIVK]
  );
  await write(
    CHAIN_ID,
    savingFarmingAddr,
    SAVING_FARMING_ABI,
    "deposit",
    ["10000000000000000000"],
    [PARTICIPANT_1, PARTICIPANT_1_PRIVK]
  );

  // Claim interest from SavingFarming contract
  console.log(`Claiming all interest from SavingFarming contract at ${savingFarmingAddr}...`);
  // sleep(4000);
  // await write(
  //   CHAIN_ID,
  //   savingFarmingAddr,
  //   SAVING_FARMING_ABI,
  //   "claimInterest",
  //   [],
  //   [PARTICIPANT_1, PARTICIPANT_1_PRIVK]
  // );

  // Withdraw some LPs from SavingFarming contract
  console.log(`Withdrawing some LPs from SavingFarming contract at ${savingFarmingAddr}...`);
  await write(
    CHAIN_ID,
    savingFarmingAddr,
    SAVING_FARMING_ABI,
    "withdraw",
    ["3000000000000000000"],
    [PARTICIPANT_1, PARTICIPANT_1_PRIVK]
  );

  // Send some LPs from SavingFarming to LockFarming
  console.log(`Transfering some LPs from SavingFarming to LockFarming at ${lockFarmingAddr}...`);
  await write(
    CHAIN_ID,
    savingFarmingAddr,
    SAVING_FARMING_ABI,
    "transferToLockFarming",
    ["6000000000000000000", 0],
    [PARTICIPANT_1, PARTICIPANT_1_PRIVK]
  );

  // Deposit some LPs to LockFarming
  console.log(`Sending some LPs to LockFarming contract at ${lockFarmingAddr}...`);
  await write(
    CHAIN_ID,
    DEPLOY_INFO.LpToken,
    LP_TOKEN_ABI,
    "approve",
    [lockFarmingAddr, "4000000000000000000"],
    [PARTICIPANT_2, PARTICIPANT_2_PRIVK]
  );
  await write(
    CHAIN_ID,
    lockFarmingAddr,
    LOCK_FARMING_ABI,
    "deposit",
    ["4000000000000000000"],
    [PARTICIPANT_2, PARTICIPANT_2_PRIVK]
  );

  // Claim interest of this lock item
  console.log(`Claiming all interest of this lock item...`);
  await write(
    CHAIN_ID,
    lockFarmingAddr,
    LOCK_FARMING_ABI,
    "claimInterest",
    [0],
    [PARTICIPANT_2, PARTICIPANT_2_PRIVK]
  );

  // Claim all interest from LockFarming program
  console.log(`Claiming all interest from LockFarming program...`);
  await write(
    CHAIN_ID,
    lockFarmingAddr,
    LOCK_FARMING_ABI,
    "claimAllInterest",
    [],
    [PARTICIPANT_2, PARTICIPANT_2_PRIVK]
  );

  // Withdraw this lock item
  // console.log(`Withdrawing this lock item...`);
  // await write(
  //   CHAIN_ID,
  //   lockFarmingAddr,
  //   LOCK_FARMING_ABI,
  //   "withdraw",
  //   [0],
  //   [PARTICIPANT_2, PARTICIPANT_2_PRIVK]
  // );
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
};

createTestTransactions();