const hre = require("hardhat");
const deployInfo = require("../../../deploy.json");

const CONTRACT_NAME = "Lottery";
const OPERATOR = "0x752F4d07DB335ae231014A74d23D98fcF99f7fe9";

async function setOperator() {
  // Set operator
  const [owner] = await hre.ethers.getSigners();
  const factory = await hre.ethers.getContractFactory(CONTRACT_NAME);
  await factory
    .connect(owner)
    .attach(deployInfo.dev2.Lottery)
    .setOperators([OPERATOR], [true]);
  console.log(`${OPERATOR} has been granted operator role`);
}

setOperator();