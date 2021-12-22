const hre = require("hardhat");
const deployInfo = require("../../../deploy.json");

const CONTRACT_NAME = "Lottery";
const NEW_OWNER = "0x752F4d07DB335ae231014A74d23D98fcF99f7fe9";

async function deploy() {
  // Deploy
  const [owner] = await hre.ethers.getSigners();
  const factory = await hre.ethers.getContractFactory(CONTRACT_NAME);
  await factory
    .connect(owner)
    .attach(deployInfo.staging.Lottery)
    .transferOwnership(NEW_OWNER);
  console.log(`Lottery (staging) has been transfered to new owner at ${NEW_OWNER}`);
}

deploy();