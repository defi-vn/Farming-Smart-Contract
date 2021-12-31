const hre = require("hardhat");
const deployInfo = require("../../../deploy.json");

const CONTRACT_NAME = "Lottery";
const OPERATOR = [
  "0xD08b70DbA72514Cba07852BF043551a5980f52E5",
  "0x752F4d07DB335ae231014A74d23D98fcF99f7fe9",
  "0x96aD5880f6899E28ee8af2121DF83bb324A535C2"
];

async function setOperator() {
  // Set operator
  const [owner] = await hre.ethers.getSigners();
  const factory = await hre.ethers.getContractFactory(CONTRACT_NAME);
  await factory
    .connect(owner)
    .attach(deployInfo.beta.Lottery)
    .setOperators(OPERATOR, OPERATOR.map(operator => true));
  console.log(`${OPERATOR} has been granted operator role`);
}

setOperator();