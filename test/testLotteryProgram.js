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
  const [deployer, participant, rewardWallet] = await hre.ethers.getSigners();
  this.deployer = deployer;
  this.participant = participant;
  this.rewardWallet = rewardWallet;
  this.feeWallet = "0x0000000000000000000000000000000000000001";
  this.totalDFYPerMonth = "20000000000000000000000000";
  this.depositAmount = 5000;
  this.weight = 7;

  // Deploy DFYContract
  this.dfyFactory = await hre.ethers.getContractFactory(DFY_TOKEN);
  this.dfyContract = await this.dfyFactory.deploy(this.feeWallet, this.rewardWallet.address);
  await this.dfyContract.deployed();

  // Deploy LpContract
  this.lpFactory = await hre.ethers.getContractFactory(LP_TOKEN);
  this.lpContract = await this.lpFactory.deploy(this.feeWallet, this.participant.address);
  await this.lpContract.deployed();

  // Deploy FarmingFactory
  this.farmingFactory = await hre.ethers.getContractFactory(FARMING_FACTORY);
  this.farmingFactoryContract = await this.farmingFactory.deploy(
    this.dfyContract.address,
    this.rewardWallet.address
  );
  await this.farmingFactoryContract.deployed();

  // Deploy Lottery
  this.lotteryFactory = await hre.ethers.getContractFactory(LOTTERY);
  this.lotteryContract = await this.lotteryFactory.deploy(
    this.dfyContract.address,
    this.rewardWallet.address,
    this.farmingFactoryContract.address,
    5
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
      .createLockFarming(this.lpContract.address, 10, this.totalDFYPerMonth);
    let numLpTokens = await this.farmingFactoryContract.getNumSupportedLpTokens();
    let lpToken = await this.farmingFactoryContract.lpTokens(0);
    let numLockTypes = await this.farmingFactoryContract.getNumLockTypes(lpToken);
    let lockContractAddr = await this.farmingFactoryContract.getLockFarmingContract(lpToken, 1);
    this.lockFarmingContract = this.lockFarmingFactory.attach(lockContractAddr);
    expect(numLpTokens.toString()).to.equal("1");
    expect(lpToken).to.equal(this.lpContract.address);
    expect(numLockTypes.toString()).to.equal("1");
  });

  it("Deposit some LPs to LockFarming", async () => {
    await this.lpFactory
      .connect(this.participant)
      .attach(this.lpContract.address)
      .approve(this.lockFarmingContract.address, this.depositAmount);
    await this.lockFarmingFactory
      .connect(this.participant)
      .attach(this.lockFarmingContract.address)
      .deposit(this.depositAmount);
    let numParticipants = await this.lockFarmingContract.getNumParticipants();
    let client = await this.lockFarmingContract.participants(0);
    let lockItems = await this.lockFarmingContract.getLockItems(this.participant.address);
    let validLockAmount = await this.lockFarmingContract.getValidLockAmount(this.participant.address);
    expect(numParticipants.toString()).to.equal("1");
    expect(client).to.equal(this.participant.address);
    expect(lockItems.length).to.equal(1);
    expect(lockItems[0]?.amount.toString()).to.equal(this.depositAmount.toString());
    expect(validLockAmount.toString()).to.equal(this.depositAmount.toString());
  });

  it("Deposit more LPs to LockFarming", async () => {
    await this.lpFactory
      .connect(this.participant)
      .attach(this.lpContract.address)
      .approve(this.lockFarmingContract.address, this.depositAmount * 3);
    await this.lockFarmingFactory
      .connect(this.participant)
      .attach(this.lockFarmingContract.address)
      .deposit(this.depositAmount * 3);
    let numParticipants = await this.lockFarmingContract.getNumParticipants();
    let client = await this.lockFarmingContract.participants(0);
    let lockItems = await this.lockFarmingContract.getLockItems(this.participant.address);
    let validLockAmount = await this.lockFarmingContract.getValidLockAmount(this.participant.address);
    expect(numParticipants.toString()).to.equal("1");
    expect(client).to.equal(this.participant.address);
    expect(lockItems.length).to.equal(2);
    expect(lockItems[1]?.amount.toString()).to.equal((this.depositAmount * 3).toString());
    expect(validLockAmount.toString()).to.equal((this.depositAmount * 4).toString());
  });

  it("Set lpToken's weight in Lottery", async () => {
    await this.lotteryFactory
      .connect(this.deployer)
      .attach(this.lotteryContract.address)
      .setWeight([this.lpContract.address], [this.weight]);
    let weight = await this.lotteryContract.getWeight(this.lpContract.address);
    expect(weight.toString()).to.equal(this.weight.toString());
  });

  it("Create lottery list - change the privacy of _createLotteryList, _players, _totalLockedLPs to public first", async () => {
    await this.lotteryFactory
      .connect(this.deployer)
      .attach(this.lotteryContract.address)
      ._createLotteryList();
    let player = await this.lotteryContract._players(0);
    let totalLockedLPs = await this.lotteryContract._totalLockedLPs();
    expect(player).to.equal(this.participant.address);
    expect(totalLockedLPs).to.equal((this.depositAmount * 4 * this.weight).toString());
  });
});