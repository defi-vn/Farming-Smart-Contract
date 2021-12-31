const hre = require("hardhat");
const deployInfo = require("../../../deploy.json");

const CONTRACT_NAME = "Lottery";
const OPERATOR = [
  "0xD08b70DbA72514Cba07852BF043551a5980f52E5"
];

async function setOperator() {
  // Set operator
  const [owner] = await hre.ethers.getSigners();
  const factory = await hre.ethers.getContractFactory(CONTRACT_NAME);
  await factory
    .connect(owner)
    .attach(deployInfo.live.Lottery)
    .setOperators(OPERATOR, OPERATOR.map(operator => true));
  console.log(`${OPERATOR} has been granted operator role`);
}

setOperator();