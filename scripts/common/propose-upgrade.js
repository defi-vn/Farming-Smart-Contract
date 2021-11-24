require("@nomiclabs/hardhat-ethers");
require("@openzeppelin/hardhat-upgrades");
const hre = require("hardhat");
const CONTRACT_NAME = "ClockAuction";
const PROXY_ADDRESS = "0x2a74c5D1aC99F11268203bdEBBB6386c858D99E1";
const GNOSIS_SAFE = process.env.GNOSIS_SAFE;

async function main() {
  const contract = await hre.ethers.getContractFactory(CONTRACT_NAME);
  console.log("Preparing proposal...");
  const proposal = await hre.defender.proposeUpgrade(PROXY_ADDRESS, contract, { multisig: GNOSIS_SAFE });
  console.log("Upgrade proposal created at:", proposal.url);
}

main().then(() => {
  process.exit(0);
}).catch(error => {
  console.error(error);
  process.exit(1);
});