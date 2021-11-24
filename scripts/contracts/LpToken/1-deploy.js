const hre = require("hardhat");

const CONTRACT_NAME = "LpToken";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", (await deployer.getBalance()).toString());
  const factory = await hre.ethers.getContractFactory(CONTRACT_NAME);
  console.log("Deploying " + CONTRACT_NAME + "...");
  const contract = await factory.deploy(
    "0x0000000000000000000000000000000000000001",
    "0x9B2a4d0A65A1c873B7c60d73D5DdDa37916Aa323"
  );
  await contract.deployed();
  console.log(`${CONTRACT_NAME} deployed address: ${contract.address}`);
}

main().then(() => {
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});