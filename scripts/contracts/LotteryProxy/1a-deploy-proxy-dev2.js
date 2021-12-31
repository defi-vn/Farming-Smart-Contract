const hre = require("hardhat");
const FileSystem = require("fs");
const deployInfo = require("../../../deploy.json");

const CONTRACT_NAME = "LotteryProxy";
const REWARD_WALLET = process.env.ADDRESS_2;

async function deploy() {
  // Deploy
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", (await deployer.getBalance()).toString());
  const factory = await hre.ethers.getContractFactory(CONTRACT_NAME);
  console.log(`Deploying ${CONTRACT_NAME} as proxy...`);
  const contract = await hre.upgrades.deployProxy(
    factory,
    [
      deployInfo.dev2.DFYToken,
      REWARD_WALLET,
      deployInfo.dev2.FarmingFactory
    ],
    { kind: "uups" }
  );
  await contract.deployed();
  let logicAddr = await hre.upgrades.erc1967.getImplementationAddress(contract.address);
  console.log(`${CONTRACT_NAME} proxy address: ${contract.address}`);
  console.log(`${CONTRACT_NAME} logic address: ${logicAddr}`);

  // Write the result to deploy.json
  deployInfo.dev2[CONTRACT_NAME] = {
    proxy: contract.address,
    logic: logicAddr
  };
  FileSystem.writeFile("deploy.json", JSON.stringify(deployInfo, null, "\t"), err => {
    if (err)
      console.log("Error when trying to write to deploy.json!", err);
    else
      console.log("Information has been written to deploy.json!");
  });
}

deploy();