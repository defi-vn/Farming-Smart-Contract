const hre = require("hardhat");

const CONTRACT_NAME = "Lottery";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", (await deployer.getBalance()).toString());
  const factory = await hre.ethers.getContractFactory(CONTRACT_NAME);
  console.log("Deploying " + CONTRACT_NAME + "...");
  const contract = await factory.deploy(
    "0x68c5376987060Af932E454072E7956FCc398976d",
    "0x6d1edB03A933c634C11eD712bDb4F276f49d26eb",
    "0x606787feefd265D260862944a878567102944654",
    1
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