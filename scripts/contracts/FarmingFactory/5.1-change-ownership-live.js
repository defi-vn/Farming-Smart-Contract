const hre = require("hardhat");
const FileSystem = require("fs");
const deployInfo = require("../../../deploy.json");
const { Farms } = require("../../Farming-contracts.json");

const GNOSIS_SAFE = process.env.GNOSIS_SAFE;

const CONTRACT_NAME = "FarmingFactory";
const SAVING_FARM = "SavingFarming";
const LOCK_FARM = "LockFarming";

async function deploy() {
  // Deploy
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log(
    "Balance:",
    ((await deployer.getBalance()) / 10 ** 18).toString()
  );

  console.log("Start time: ", Date(Date.now()));

  //   console.log(Farms);

  const SavingFarmFactory = await hre.ethers.getContractFactory(SAVING_FARM);
  const LockFarmFactory = await hre.ethers.getContractFactory(LOCK_FARM);

  for await (let farm of Farms) {
    for await (let savingFarm of farm.SavingFarming) {
      console.log(savingFarm);
      let savingContract = SavingFarmFactory.attach(savingFarm.Address);
      console.log(
        `Changing ownership of ${SAVING_FARM} at ${savingFarm.Address} to ${GNOSIS_SAFE}`
      );
      let tnx = await savingContract.transferOwnership(GNOSIS_SAFE);
      receipt = await tnx.wait();
      console.log("Completed");
    }

    console.log("====================");

    for await (let lockFarm of farm.LockFarming) {
      console.log(lockFarm);
      let lockFarmContract = LockFarmFactory.attach(lockFarm.Address);
      console.log(
        `Changing ownership of ${LOCK_FARM} at ${lockFarm.Address} to ${GNOSIS_SAFE}`
      );
      let tnx = await lockFarmContract.transferOwnership(GNOSIS_SAFE);
      receipt = await tnx.wait();
      console.log("Completed");
    }

    console.log("============================================================\n\r");
  }

  console.log(`Completed at ${Date(Date.now())}`);
}

deploy();
