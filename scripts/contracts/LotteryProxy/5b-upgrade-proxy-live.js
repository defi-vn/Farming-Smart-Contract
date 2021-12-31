require('@nomiclabs/hardhat-ethers');
require('@openzeppelin/hardhat-upgrades');

const hre = require("hardhat");
const FileSystem = require("fs");
const deployInfo = require("../../../deploy.json");

const PROXY_ADDRESS = deployInfo.live.LotteryProxy.proxy;
const CONTRACT_NAME_V1 = "LotteryProxy";
const CONTRACT_NAME_V2 = "LotteryProxy";

async function upgrade() {
  // Upgrade
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", (await deployer.getBalance()).toString());
  const factoryV1 = await hre.ethers.getContractFactory(CONTRACT_NAME_V1);
  const contractV1 = factoryV1.attach(PROXY_ADDRESS);
  console.log(`Upgrading ${CONTRACT_NAME_V1} at ${contractV1.address}...`);
  const factoryV2 = await hre.ethers.getContractFactory(CONTRACT_NAME_V2);
  const contractV2 = await hre.upgrades.upgradeProxy(contractV1, factoryV2);
  await contractV2.deployed();
  let logicAddr = await hre.upgrades.erc1967.getImplementationAddress(contractV2.address);
  console.log(`${CONTRACT_NAME_V2} proxy address: ${contractV2.address}`);
  console.log(`${CONTRACT_NAME_V2} logic address: ${logicAddr}`);

  // Write the result to deploy.json
  deployInfo.live[CONTRACT_NAME_V2] = {
    proxy: contractV2.address,
    logic: logicAddr
  };
  FileSystem.writeFile("deploy.json", JSON.stringify(deployInfo, null, "\t"), err => {
    if (err)
      console.log("Error when trying to write to deploy.json!", err);
    else
      console.log("Information has been written to deploy.json!");
  });
}

upgrade();