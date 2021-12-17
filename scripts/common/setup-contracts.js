const Web3 = require("web3");
require("dotenv").config();

const INFURA_API_KEY = process.env.INFURA_API_KEY;
const ADDRESS_1 = process.env.ADDRESS_1;
const PRIVATE_KEY_1 = process.env.PRIVATE_KEY_1;
const BSC_PROVIDER = process.env.BSC_PROVIDER;
const BSC_TESTNET_PROVIDER = process.env.BSC_TESTNET_PROVIDER;

const ORACLES = ["0x06bcf4fc5F1a6c835fb70B66E8870dD6DE7549fa"];
const NETWORKS = {
  "4": {
    name: "Rinkeby",
    provider: "https://rinkeby.infura.io/v3/" + INFURA_API_KEY,
    fee: 20
  },
  "5": {
    name: "Goerli",
    provider: "https://goerli.infura.io/v3/" + INFURA_API_KEY,
    fee: 30
  },
  "97": {
    name: "BSC Testnet",
    provider: BSC_TESTNET_PROVIDER,
    fee: 50
  },
  "56": {
    name: "Binance Smart Chain",
    provider: BSC_PROVIDER,
    fee: 300
  }
};
const CONTRACTS = {
  BRIDGE_20: {
    abi: require("../../artifacts/contracts/bridges/Bridge20.sol/Bridge20.json").abi,
    address: require("../contracts/Bridge20/config").PROXY_ADDRESS
  },
  BRIDGE_721: {
    abi: require("../../artifacts/contracts/bridges/Bridge721.sol/Bridge721.json").abi,
    address: require("../contracts/Bridge721/config").PROXY_ADDRESS
  },
  BRIDGE_1155: {
    abi: require("../../artifacts/contracts/bridges/Bridge1155.sol/Bridge1155.json").abi,
    address: require("../contracts/Bridge1155/config").PROXY_ADDRESS
  },
  ERC_20: {
    abi: require("../../artifacts/contracts/tokens/CryptToken.sol/CryptiaToken.json").abi,
    address: require("../contracts/CryptToken/config").ADDRESS
  }
};

let getData = () => {
  const CONTRACT_FLAG = "--contracts";
  const NETWORK_FLAG = "--networks";
  let arguments = process.argv.slice(2);
  if (!arguments.includes(CONTRACT_FLAG)) {
    console.error("Please provide the option " + CONTRACT_FLAG);
    process.exit();
  }
  if (!arguments.includes(NETWORK_FLAG)) {
    console.error("Please provide the option " + NETWORK_FLAG);
    process.exit();
  }
  let contractFlagIdx = arguments.indexOf(CONTRACT_FLAG);
  let networkFlagIdx = arguments.indexOf(NETWORK_FLAG);
  if (contractFlagIdx > networkFlagIdx)
    return {
      networks: arguments.slice(networkFlagIdx + 1, contractFlagIdx),
      contracts: arguments.slice(contractFlagIdx + 1)
    };
  return {
    contracts: arguments.slice(contractFlagIdx + 1, networkFlagIdx),
    networks: arguments.slice(networkFlagIdx + 1)
  };
};

let write = async (chainId, address, abi, method, params, from, privateKey, callback) => {
  try {
    let web3 = new Web3(NETWORKS[chainId].provider);
    let gasPrice = await web3.eth.getGasPrice();
    let nonce = await web3.eth.getTransactionCount(from);
    let contract = new web3.eth.Contract(abi, address);
    let transaction = contract.methods[method](...params);
    let gas = await transaction.estimateGas({ from: from });
    let txInfo = {
      to: address,
      chainId: chainId,
      nonce: nonce,
      data: transaction.encodeABI(),
      gasPrice: gasPrice,
      gas: gas
    };
    let signedTx = await web3.eth.accounts.signTransaction(txInfo, privateKey);
    let receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
    if (callback)
      callback(receipt.transactionHash);
  } catch (err) {
    console.error("Error", method, err);
  }
};

let read = async (chainId, address, abi, method, params) => {
  try {
    let web3 = new Web3(NETWORKS[chainId].provider);
    let contract = new web3.eth.Contract(abi, address);
    return await contract.methods[method](...params).call();
  } catch (err) {
    console.error("Error", method, err);
    return null;
  }
};

let setup = async () => {
  let arrNetworks = getData().networks;
  let arrContracts = getData().contracts;
  for (let i = 0; i < arrNetworks.length; i++)
    for (let j = 0; j < arrContracts.length; j++) {
      let network = arrNetworks[i];
      let contract = "BRIDGE_" + arrContracts[j];
      console.log("=============================================");
      console.log("Preparing to set up contract "
        + contract
        + " at "
        + NETWORKS[network].name
        + " network...");

      // Set up oracles
      console.log("Setting up oracles...");
      for (let k = 0; k < ORACLES.length; k++)
        await write(
          network.toString(),
          CONTRACTS[contract].address[network.toString()],
          CONTRACTS[contract].abi,
          "setOperator",
          [ORACLES[k], true],
          ADDRESS_1,
          PRIVATE_KEY_1,
          txHash => console.log("- Set up oracle " + ORACLES[k] + ": " + txHash)
        );

      // Set up cross-chain fee
      console.log("Setting up cross-chain fee...");
      for (let k = 0; k < arrNetworks.length; k++)
        if (k !== i)
          await write(
            network.toString(),
            CONTRACTS[contract].address[network.toString()],
            CONTRACTS[contract].abi,
            "setTxFee",
            [arrNetworks[k], NETWORKS[network].fee],
            ADDRESS_1,
            PRIVATE_KEY_1,
            txHash => console.log("- Set up cross-chain fee from "
              + NETWORKS[arrNetworks[k]].name
              + " to "
              + NETWORKS[network].name
              + ": "
              + txHash)
          );

      // Set up connections with counterparty contracts
      console.log("Setting up connections with counterparty ERC_20 contracts...");
      if (contract === "BRIDGE_20")
        for (let k = 0; k < arrNetworks.length; k++)
          if (k !== i)
            await write(
              network.toString(),
              CONTRACTS[contract].address[network.toString()],
              CONTRACTS[contract].abi,
              "setCurrencyAddress",
              [CONTRACTS.ERC_20.address[network.toString()], arrNetworks[k], CONTRACTS.ERC_20.address[arrNetworks[k].toString()]],
              ADDRESS_1,
              PRIVATE_KEY_1,
              txHash => console.log("- Set up counterparty contract of ERC_20 ("
                + NETWORKS[network.toString()].name
                + ") at "
                + NETWORKS[arrNetworks[k].toString()].name
                + ": "
                + txHash)
            );

      // Provide initial liquidity to Bridge20
      if (contract === "BRIDGE_20") {
        let currentLiquidity = await read(
          network.toString(),
          CONTRACTS[contract].address[network.toString()],
          CONTRACTS[contract].abi,
          "getLiquidity",
          [CONTRACTS.ERC_20.address[network.toString()]]
        );
        if (currentLiquidity.toString() === "0")
          await write(
            network.toString(),
            CONTRACTS.ERC_20.address[network.toString()],
            CONTRACTS.ERC_20.abi,
            "transfer",
            [CONTRACTS[contract].address[network.toString()], "400000000000000000000000000"],
            ADDRESS_1,
            PRIVATE_KEY_1,
            txHash => console.log("Provide initial liquidity to "
              + contract
              + " at "
              + NETWORKS[network].name
              + ": "
              + txHash)
          );
      }
    }
};

setup();

/** node ./scripts/common/setup-contracts.js --contracts {standard-numbers} --networks {chainIds} */