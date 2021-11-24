const hre = require("hardhat");

const CONTRACT_NAME = "DFYToken";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", (await deployer.getBalance()).toString());
  const factory = await hre.ethers.getContractFactory(CONTRACT_NAME);
  console.log("Deploying " + CONTRACT_NAME + "...");
  const contract = await factory.deploy(
    "0x0000000000000000000000000000000000000001",
    "0x6d1edB03A933c634C11eD712bDb4F276f49d26eb"
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