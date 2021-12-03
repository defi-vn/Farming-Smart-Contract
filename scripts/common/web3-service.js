require("dotenv").config();
const Web3 = require("web3");
const RPC_URLS = {
  "56": process.env.BSC_PROVIDER,
  "97": process.env.BSC_TESTNET_PROVIDER
};

exports.read = async (chainId, contractAddr, abi, method, params) => {
  try {
    const web3 = new Web3(RPC_URLS[chainId]);
    const contract = new web3.eth.Contract(abi, contractAddr);
    return await contract.methods[method](...params).call();
  } catch (err) {
    console.log("Error", method, params, err);
    return "Error";
  }
};

exports.write = async (
  chainId,
  contractAddr,
  abi,
  method,
  params,
  account,
  value = 0
) => {
  try {
    const web3 = new Web3(RPC_URLS[chainId]);
    let [accountAddr, accountPrivKey] = account;
    let gasPrice = await web3.eth.getGasPrice();
    let nonce = await web3.eth.getTransactionCount(accountAddr);
    let contract = new web3.eth.Contract(abi, contractAddr);
    let transaction = contract.methods[method](...params);
    let txInfo = { from: accountAddr };
    if (value > 0)
      txInfo.value = value;
    let gas = await transaction.estimateGas(txInfo);
    txInfo = {
      to: contractAddr,
      chainId: chainId,
      nonce: nonce,
      data: transaction.encodeABI(),
      gasPrice: gasPrice,
      gas: gas
    };
    let signedTx = await web3.eth.accounts.signTransaction(txInfo, accountPrivKey);
    let receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
    console.log("TxHash", receipt.transactionHash);
  } catch (err) {
    console.log("Error", method, params, err);
  }
};