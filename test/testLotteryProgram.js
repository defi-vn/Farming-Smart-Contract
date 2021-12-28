require('@nomiclabs/hardhat-ethers');

const hre = require('hardhat');
const { expect } = require("chai");
const LOTTERY = "Lottery";
const FARMING_FACTORY = "FarmingFactory";
const LOCK_FARMING = "LockFarming";
const DFY_TOKEN = "DFYToken";
const LP_TOKEN = "LpToken";

before("Deploy Lottery, FarmingFactory, DFY contract, LP contract", async () => {
  // Prepare parameters
  const [
    deployer,
    operator,
    participant1,
    participant2,
    participant3,
    participant4,
    rewardWallet
  ] = await hre.ethers.getSigners();
  this.deployer = deployer;
  this.operator = operator;
  this.participant1 = participant1;
  this.participant2 = participant2;
  this.participant3 = participant3;
  this.participant4 = participant4;
  this.rewardWallet = rewardWallet;
  this.feeWallet = "0x0000000000000000000000000000000000000001";
  this.totalRewardPerMonth = "20000000000000000000000000";
  this.weight = 1;
  this.totalSupply = "500000000000000000000000000";

  // Deploy DFYContract
  this.dfyFactory = await hre.ethers.getContractFactory(DFY_TOKEN);
  this.dfyContract = await this.dfyFactory.deploy(this.feeWallet, this.rewardWallet.address);
  await this.dfyContract.deployed();

  // Deploy LpContract
  this.lpFactory = await hre.ethers.getContractFactory(LP_TOKEN);
  this.lpContract = await this.lpFactory.deploy(this.feeWallet, this.participant1.address);
  await this.lpContract.deployed();

  // Deploy FarmingFactory
  this.farmingFactory = await hre.ethers.getContractFactory(FARMING_FACTORY);
  this.farmingFactoryContract = await this.farmingFactory.deploy();
  await this.farmingFactoryContract.deployed();

  // Deploy Lottery
  this.lotteryFactory = await hre.ethers.getContractFactory(LOTTERY);
  this.lotteryContract = await this.lotteryFactory.deploy(
    this.dfyContract.address,
    this.rewardWallet.address,
    this.farmingFactoryContract.address
  );
  await this.lotteryContract.deployed();

  // Get LockFarming factories
  this.lockFarmingFactory = await hre.ethers.getContractFactory(LOCK_FARMING);
});

describe("Test farming program", () => {
  it("Create new LockFarming contract", async () => {
    await this.farmingFactory
      .connect(this.deployer)
      .attach(this.farmingFactoryContract.address)
      .createLockFarming(
        1000,
        this.lpContract.address,
        this.dfyContract.address,
        this.rewardWallet.address,
        this.totalRewardPerMonth
      );
    let numLpTokens = await this.farmingFactoryContract.getNumSupportedLpTokens();
    let lpToken = await this.farmingFactoryContract.lpTokens(0);
    let numLockTypes = await this.farmingFactoryContract.getNumLockTypes(lpToken);
    let lockContractAddr = await this.farmingFactoryContract.getLockFarmingContract(lpToken, 0);
    this.lockFarmingContract = this.lockFarmingFactory.attach(lockContractAddr);
    expect(numLpTokens.toString()).to.equal("1");
    expect(lpToken).to.equal(this.lpContract.address);
    expect(numLockTypes.toString()).to.equal("1");
  });

  it("Set operator role", async () => {
    await this.lotteryFactory
      .connect(this.deployer)
      .attach(this.lotteryContract.address)
      .setOperators([this.operator.address], [true]);
  });

  it("Approve DFY token for Lottery contract", async () => {
    await this.dfyFactory
      .connect(this.rewardWallet)
      .attach(this.dfyContract.address)
      .approve(this.lotteryContract.address, this.totalSupply);
    let allowance = await this.dfyContract.allowance(
      this.rewardWallet.address,
      this.lotteryContract.address
    );
    expect(allowance.toString()).to.equal(this.totalSupply);
  });

  it("Participant 1 deposits some LPs to LockFarming", async () => {
    await this.lpFactory
      .connect(this.participant1)
      .attach(this.lpContract.address)
      .approve(this.lockFarmingContract.address, 1500);
    await this.lockFarmingFactory
      .connect(this.participant1)
      .attach(this.lockFarmingContract.address)
      .deposit(1500);
    let numParticipants = await this.lockFarmingContract.getNumParticipants();
    let client = await this.lockFarmingContract.participants(0);
    let lockItems = await this.lockFarmingContract.getLockItems(this.participant1.address);
    let validLockAmount = await this.lockFarmingContract.getValidLockAmount(this.participant1.address);
    expect(numParticipants.toString()).to.equal("1");
    expect(client).to.equal(this.participant1.address);
    expect(lockItems.length).to.equal(1);
    expect(lockItems[0]?.amount.toString()).to.equal("1500");
    expect(validLockAmount.toString()).to.equal("1500");
  });

  it("Participant 2 deposits some LPs to LockFarming", async () => {
    await this.lpFactory
      .connect(this.participant1)
      .attach(this.lpContract.address)
      .transfer(this.participant2.address, 2000);
    await this.lpFactory
      .connect(this.participant2)
      .attach(this.lpContract.address)
      .approve(this.lockFarmingContract.address, 2000);
    await this.lockFarmingFactory
      .connect(this.participant2)
      .attach(this.lockFarmingContract.address)
      .deposit(2000);
    let numParticipants = await this.lockFarmingContract.getNumParticipants();
    let client1 = await this.lockFarmingContract.participants(0);
    let client2 = await this.lockFarmingContract.participants(1);
    let lockItems = await this.lockFarmingContract.getLockItems(this.participant2.address);
    let validLockAmount = await this.lockFarmingContract.getValidLockAmount(this.participant2.address);
    expect(numParticipants.toString()).to.equal("2");
    expect(client1).to.equal(this.participant1.address);
    expect(client2).to.equal(this.participant2.address);
    expect(lockItems.length).to.equal(1);
    expect(lockItems[0]?.amount.toString()).to.equal("2000");
    expect(validLockAmount.toString()).to.equal("2000");
  });

  it("Participant 3 deposits some LPs to LockFarming", async () => {
    await this.lpFactory
      .connect(this.participant1)
      .attach(this.lpContract.address)
      .transfer(this.participant3.address, 2000);
    await this.lpFactory
      .connect(this.participant3)
      .attach(this.lpContract.address)
      .approve(this.lockFarmingContract.address, 2000);
    await this.lockFarmingFactory
      .connect(this.participant3)
      .attach(this.lockFarmingContract.address)
      .deposit(2000);
    let numParticipants = await this.lockFarmingContract.getNumParticipants();
    expect(numParticipants.toString()).to.equal("3");
  });

  it("Participant 4 deposits some LPs to LockFarming", async () => {
    await this.lpFactory
      .connect(this.participant1)
      .attach(this.lpContract.address)
      .transfer(this.participant4.address, 5000);
    await this.lpFactory
      .connect(this.participant4)
      .attach(this.lpContract.address)
      .approve(this.lockFarmingContract.address, 5000);
    await this.lockFarmingFactory
      .connect(this.participant4)
      .attach(this.lockFarmingContract.address)
      .deposit(5000);
    let numParticipants = await this.lockFarmingContract.getNumParticipants();
    expect(numParticipants.toString()).to.equal("4");
  });

  it("Set reward wallet", async () => {
    await this.lotteryFactory
      .connect(this.deployer)
      .attach(this.lotteryContract.address)
      .setRewardWallet(this.rewardWallet.address);
  });

  it("Set reward token", async () => {
    await this.lotteryFactory
      .connect(this.deployer)
      .attach(this.lotteryContract.address)
      .setRewardToken(this.dfyContract.address);
  });

  it("Schedule first lottery round", async () => {
    await this.lotteryFactory
      .connect(this.deployer)
      .attach(this.lotteryContract.address)
      .scheduleNextLottery(
        Math.floor(Date.now() / 1000) - 1,
        [2500],
        [this.lpContract.address],
        [this.weight]
      );
    let currentRound = await this.lotteryContract.currentRound();
    let weight = await this.lotteryContract.getWeight([this.lpContract.address]);
    expect(currentRound.toString()).to.equal("1");
    expect(weight.length).to.equal(1);
    expect(weight[0].toString()).to.equal(this.weight.toString());
  });

  it("Spin reward - not use Chainlink VRF", async () => {
    await this.lotteryFactory
      .connect(this.deployer)
      .attach(this.lotteryContract.address)
      .spinReward(0);
  });

  it("Schedule second lottery round", async () => {
    await this.lotteryFactory
      .connect(this.operator)
      .attach(this.lotteryContract.address)
      .scheduleNextLottery(
        Math.floor(Date.now() / 1000) - 1,
        [1400, 2400, 3200],
        [this.lpContract.address],
        [this.weight]
      );
    let currentRound = await this.lotteryContract.currentRound();
    let weight = await this.lotteryContract.getWeight([this.lpContract.address]);
    expect(currentRound.toString()).to.equal("2");
    expect(weight.length).to.equal(1);
    expect(weight[0].toString()).to.equal(this.weight.toString());
  });

  it("Spin reward 3 times - not use Chainlink VRF", async () => {
    await this.lotteryFactory
      .connect(this.operator)
      .attach(this.lotteryContract.address)
      .spinReward(0);
    await this.lotteryFactory
      .connect(this.operator)
      .attach(this.lotteryContract.address)
      .spinReward(2);
    await this.lotteryFactory
      .connect(this.operator)
      .attach(this.lotteryContract.address)
      .spinReward(1);
  });

  it("Schedule third lottery round", async () => {
    await this.lotteryFactory
      .connect(this.operator)
      .attach(this.lotteryContract.address)
      .scheduleNextLottery(
        Math.floor(Date.now() / 1000) - 1,
        [2200, 3300],
        [this.lpContract.address],
        [7]
      );
    let currentRound = await this.lotteryContract.currentRound();
    let weights = await this.lotteryContract.getWeight([this.lpContract.address]);
    expect(currentRound.toString()).to.equal("3");
    expect(weights.length).to.equal(1);
    expect(weights[0]?.toString()).to.equal("7");
  });

  it("Spin reward twice - not use Chainlink VRF", async () => {
    await this.lotteryFactory
      .connect(this.operator)
      .attach(this.lotteryContract.address)
      .spinReward(1);
    await this.lotteryFactory
      .connect(this.operator)
      .attach(this.lotteryContract.address)
      .spinReward(0);
  });

  it("Schedule forth lottery round", async () => {
    await this.lotteryFactory
      .connect(this.operator)
      .attach(this.lotteryContract.address)
      .scheduleNextLottery(
        Math.floor(Date.now() / 1000) - 1,
        [210, 320, 430],
        [this.lpContract.address],
        [3]
      );
    let currentRound = await this.lotteryContract.currentRound();
    let weights = await this.lotteryContract.getWeight([this.lpContract.address]);
    expect(currentRound.toString()).to.equal("4");
    expect(weights.length).to.equal(1);
    expect(weights[0]?.toString()).to.equal("3");
  });

  it("Spin reward 3 times - not use Chainlink VRF", async () => {
    await this.lotteryFactory
      .connect(this.operator)
      .attach(this.lotteryContract.address)
      .spinReward(1);
    await this.lotteryFactory
      .connect(this.operator)
      .attach(this.lotteryContract.address)
      .spinReward(0);
    await this.lotteryFactory
      .connect(this.operator)
      .attach(this.lotteryContract.address)
      .spinReward(2);
  });
});