require('@nomiclabs/hardhat-ethers');

const hre = require('hardhat');
const { expect } = require("chai");
const FARMING_FACTORY = "FarmingFactory";
const SAVING_FARMING = "SavingFarming";
const LOCK_FARMING = "LockFarming";
const REWARD_TOKEN = "DFYToken";
const LP_TOKEN = "LpToken";

before("Deploy FarmingFactory, DFY contract, LP contract", async () => {
  // Prepare parameters
  const [deployer, participant, rewardWallet] = await hre.ethers.getSigners();
  this.deployer = deployer;
  this.participant = participant;
  this.rewardWallet = rewardWallet;
  this.feeWallet = "0x0000000000000000000000000000000000000001";
  this.totalRewardPerMonth = "20000000000000000000000000";
  this.depositAmount = 5000;

  // Deploy RewardContract
  this.dfyFactory = await hre.ethers.getContractFactory(REWARD_TOKEN);
  this.dfyContract = await this.dfyFactory.deploy(this.feeWallet, this.rewardWallet.address);
  await this.dfyContract.deployed();

  // Deploy LpContract
  this.lpFactory = await hre.ethers.getContractFactory(LP_TOKEN);
  this.lpContract = await this.lpFactory.deploy(this.feeWallet, this.participant.address);
  await this.lpContract.deployed();

  // Deploy FarmingFactory
  this.farmingFactory = await hre.ethers.getContractFactory(FARMING_FACTORY);
  this.farmingFactoryContract = await this.farmingFactory.deploy();
  await this.farmingFactoryContract.deployed();

  // Get SavingFarming and LockFarming factories
  this.savingFarmingFactory = await hre.ethers.getContractFactory(SAVING_FARMING);
  this.lockFarmingFactory = await hre.ethers.getContractFactory(LOCK_FARMING);
});

describe("Test farming program", () => {
  it("Create new SavingFarming and LockFarming contracts", async () => {
    let savingCreationTx = await this.farmingFactory
      .connect(this.deployer)
      .attach(this.farmingFactoryContract.address)
      .createSavingFarming(
        this.lpContract.address,
        this.dfyContract.address,
        this.rewardWallet.address,
        this.totalRewardPerMonth
      );
    let events = (await savingCreationTx.wait()).events;
    let savingFarmingAddr = events[2]?.args?.savingFarmingContract;
    this.savingFarmingContract = this.savingFarmingFactory.attach(savingFarmingAddr);
    let lockCreationTx = await this.farmingFactory
      .connect(this.deployer)
      .attach(this.farmingFactoryContract.address)
      .createLockFarming(
        10,
        this.lpContract.address,
        this.dfyContract.address,
        this.rewardWallet.address,
        this.totalRewardPerMonth
      );
    events = (await lockCreationTx.wait()).events;
    let lockFarmingAddr = events[2]?.args?.lockFarmingContract;
    this.lockFarmingContract = this.lockFarmingFactory.attach(lockFarmingAddr);
    let numSupportedLpTokens = await this.farmingFactoryContract.getNumSupportedLpTokens();
    let lpAddress = await this.farmingFactoryContract.lpTokens(0);
    let farmingAddr1 = await this.savingFarmingContract.farmingFactory();
    let farmingAddr2 = await this.lockFarmingContract.farmingFactory();
    expect(numSupportedLpTokens.toString()).to.equal("1");
    expect(lpAddress).to.equal(this.lpContract.address);
    expect(farmingAddr1).to.equal(this.farmingFactoryContract.address);
    expect(farmingAddr2).to.equal(this.farmingFactoryContract.address);
  });

  it("Approve and check initial values", async () => {
    await this.dfyFactory
      .connect(this.rewardWallet)
      .attach(this.dfyContract.address)
      .approve(this.savingFarmingContract.address, "500000000000000000000000000");
    await this.dfyFactory
      .connect(this.rewardWallet)
      .attach(this.dfyContract.address)
      .approve(this.lockFarmingContract.address, "500000000000000000000000000");
    let dfyValue = await this.dfyContract.balanceOf(this.rewardWallet.address);
    let allowance1 = await this.dfyContract.allowance(this.rewardWallet.address, this.savingFarmingContract.address);
    let allowance2 = await this.dfyContract.allowance(this.rewardWallet.address, this.lockFarmingContract.address);
    let lpValue = await this.lpContract.balanceOf(this.participant.address);
    expect(dfyValue.toString()).to.equal("500000000000000000000000000");
    expect(allowance1.toString()).to.equal("500000000000000000000000000");
    expect(allowance2.toString()).to.equal("500000000000000000000000000");
    expect(lpValue.toString()).to.equal("500000000000000000000000000");
  });

  it("Set monthly total reward amount by 2 ways", async () => {
    await this.savingFarmingFactory
      .connect(this.deployer)
      .attach(this.savingFarmingContract.address)
      .setTotalRewardPerMonth(this.totalRewardPerMonth);
    await this.lockFarmingFactory
      .connect(this.deployer)
      .attach(this.lockFarmingContract.address)
      .setTotalRewardPerMonth(this.totalRewardPerMonth);
    await this.farmingFactory
      .connect(this.deployer)
      .attach(this.farmingFactoryContract.address)
      .setTotalRewardPerMonth(this.totalRewardPerMonth);
  });

  it("Set reward wallet address by 2 ways", async () => {
    await this.savingFarmingFactory
      .connect(this.deployer)
      .attach(this.savingFarmingContract.address)
      .setRewardWallet(this.rewardWallet.address);
    await this.lockFarmingFactory
      .connect(this.deployer)
      .attach(this.lockFarmingContract.address)
      .setRewardWallet(this.rewardWallet.address);
    await this.farmingFactory
      .connect(this.deployer)
      .attach(this.farmingFactoryContract.address)
      .setRewardWallet(this.rewardWallet.address);
  });

  it("Deposit some LPs to SavingFarming", async () => {
    await this.lpFactory
      .connect(this.participant)
      .attach(this.lpContract.address)
      .approve(this.savingFarmingContract.address, this.depositAmount);
    await this.savingFarmingFactory
      .connect(this.participant)
      .attach(this.savingFarmingContract.address)
      .deposit(this.depositAmount);
    let numParticipants = await this.savingFarmingContract.getNumParticipants();
    let client = await this.savingFarmingContract.participants(0);
    let farmingAmount = await this.savingFarmingContract.getFarmingAmount(this.participant.address);
    expect(numParticipants.toString()).to.equal("1");
    expect(client).to.equal(this.participant.address);
    expect(farmingAmount.toString()).to.equal(this.depositAmount.toString());
  });

  it("Deposit more LPs to SavingFarming", async () => {
    await this.lpFactory
      .connect(this.participant)
      .attach(this.lpContract.address)
      .approve(this.savingFarmingContract.address, this.depositAmount * 2);
    await this.savingFarmingFactory
      .connect(this.participant)
      .attach(this.savingFarmingContract.address)
      .deposit(this.depositAmount * 2);
    let numParticipants = await this.savingFarmingContract.getNumParticipants();
    let client = await this.savingFarmingContract.participants(0);
    let farmingAmount = await this.savingFarmingContract.getFarmingAmount(this.participant.address);
    expect(numParticipants.toString()).to.equal("1");
    expect(client).to.equal(this.participant.address);
    expect(farmingAmount.toString()).to.equal((this.depositAmount * 3).toString());
  });

  it("Claim interest from SavingFarming", async () => {
    await this.savingFarmingFactory
      .connect(this.participant)
      .attach(this.savingFarmingContract.address)
      .claimInterest();
  });

  it("Withdraw some LPs from SavingFarming", async () => {
    await this.savingFarmingFactory
      .connect(this.participant)
      .attach(this.savingFarmingContract.address)
      .withdraw(this.depositAmount);
    let numParticipants = await this.savingFarmingContract.getNumParticipants();
    let client = await this.savingFarmingContract.participants(0);
    let farmingAmount = await this.savingFarmingContract.getFarmingAmount(this.participant.address);
    expect(numParticipants.toString()).to.equal("1");
    expect(client).to.equal(this.participant.address);
    expect(farmingAmount.toString()).to.equal((this.depositAmount * 2).toString());
  });

  it("Withdraw all remaining LPs from SavingFarming", async () => {
    await this.savingFarmingFactory
      .connect(this.participant)
      .attach(this.savingFarmingContract.address)
      .withdraw(this.depositAmount * 2);
    let numParticipants = await this.savingFarmingContract.getNumParticipants();
    let farmingAmount = await this.savingFarmingContract.getFarmingAmount(this.participant.address);
    expect(numParticipants.toString()).to.equal("0");
    expect(farmingAmount.toString()).to.equal("0");
  });

  it("Deposit some LPs to LockFarming contract", async () => {
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
    expect(numParticipants.toString()).to.equal("1");
    expect(client).to.equal(this.participant.address);
    expect(lockItems.length).to.equal(1);
    expect(lockItems[0].amount.toString()).to.equal(this.depositAmount.toString());
    expect(parseInt(lockItems[0].expiredAt.toString()) - parseInt(lockItems[0].lastClaim.toString())).to.equal(10);
  });

  it("Deposit more LPs to LockFarming contract", async () => {
    await this.lpFactory
      .connect(this.participant)
      .attach(this.lpContract.address)
      .approve(this.lockFarmingContract.address, 3 * this.depositAmount);
    await this.lockFarmingFactory
      .connect(this.participant)
      .attach(this.lockFarmingContract.address)
      .deposit(3 * this.depositAmount);
    let numParticipants = await this.lockFarmingContract.getNumParticipants();
    let client = await this.lockFarmingContract.participants(0);
    let lockItems = await this.lockFarmingContract.getLockItems(this.participant.address);
    expect(numParticipants.toString()).to.equal("1");
    expect(client).to.equal(this.participant.address);
    expect(lockItems.length).to.equal(2);
    expect(lockItems[1].amount.toString()).to.equal((3 * this.depositAmount).toString());
  });

  it("Claim interest from LockFarming contract", async () => {
    await this.lockFarmingFactory
      .connect(this.participant)
      .attach(this.lockFarmingContract.address)
      .claimInterest(0);
    await this.lockFarmingFactory
      .connect(this.participant)
      .attach(this.lockFarmingContract.address)
      .claimInterest(1);
  });

  it("Claim all interest from LockFarming contract", async () => {
    await this.lockFarmingFactory
      .connect(this.participant)
      .attach(this.lockFarmingContract.address)
      .claimAllInterest();
  });

  it("Withdraw some LPs from LockFarming contract", async () => {
    await sleep(12000);
    await this.lockFarmingFactory
      .connect(this.participant)
      .attach(this.lockFarmingContract.address)
      .withdraw(0);
    let numParticipants = await this.lockFarmingContract.getNumParticipants();
    let client = await this.lockFarmingContract.participants(0);
    let lockItems = await this.lockFarmingContract.getLockItems(this.participant.address);
    expect(numParticipants.toString()).to.equal("1");
    expect(client).to.equal(this.participant.address);
    expect(lockItems.length).to.equal(1);
    expect(lockItems[0].amount.toString()).to.equal((3 * this.depositAmount).toString());
  });

  it("Withdraw all remaining LPs from LockFarming contract", async () => {
    await this.lockFarmingFactory
      .connect(this.participant)
      .attach(this.lockFarmingContract.address)
      .withdraw(0);
    let numParticipants = await this.lockFarmingContract.getNumParticipants();
    let lockItems = await this.lockFarmingContract.getLockItems(this.participant.address);
    expect(numParticipants.toString()).to.equal("0");
    expect(lockItems.length).to.equal(0);
  });

  it("Transfer LPs from SavingFarming to LockFarming", async () => {
    await this.lpFactory
      .connect(this.participant)
      .attach(this.lpContract.address)
      .approve(this.savingFarmingContract.address, this.depositAmount);
    await this.savingFarmingFactory
      .connect(this.participant)
      .attach(this.savingFarmingContract.address)
      .deposit(this.depositAmount);
    await this.savingFarmingFactory
      .connect(this.participant)
      .attach(this.savingFarmingContract.address)
      .transferToLockFarming(this.depositAmount, 0);
    let lockItems = await this.lockFarmingContract.getLockItems(this.participant.address);
    let numParticipants = await this.savingFarmingContract.getNumParticipants();
    let farmingAmount = await this.savingFarmingContract.getFarmingAmount(this.participant.address);
    expect(lockItems.length).to.equal(1);
    expect(lockItems[0].amount.toString()).to.equal(this.depositAmount.toString());
    expect(numParticipants.toString()).to.equal("0");
    expect(farmingAmount.toString()).to.equal("0");
  });
});

let sleep = ms => {
  return new Promise(resolve => setTimeout(resolve, ms));
};