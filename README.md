# Install

Install npm packages: `npm install`

# Add configurations

The file `hardhat.config.js` uses some environment variables from `.env`. However, this file is not included here because of privacy. Please use your own keys:

```
// .env
INFURA_API_KEY="..."
INFURA_HTTP_LINK="https://rinkeby.infura.io/v3/"
INFURA_WSS_LINK="wss://rinkeby.infura.io/ws/v3/"
BSC_PROVIDER="https://data-seed-prebsc-1-s1.binance.org:8545/"
BSC_API_KEY="..."
ETHERSCAN_API_KEY="..."
MNEMONIC="..."
ADDRESS_1="..."
ADDRESS_2="..."
PRIVATE_KEY_1="..."
PRIVATE_KEY_2="..."
ALCHEMY_API_KEY="..."
DEFENDER_TEAM_API_KEY="..."
DEFENDER_TEAM_API_SECRET_KEY="..."
```

# Deploy the contracts

1. Open the file `scripts/deploy.js`.

2. Provide the name of the contract you want to deploy:
```
CONTRACT_NAME = "..."
```

3. Provide necessary parameters in the function `factory.deploy(...)`:
```
const contract = await factory.deploy(PARA_1, PARA_2, etc.)
```

4. Execute the following command to deploy:
```
npx hardhat run ./scripts/deploy.js --network bsctestnet
```

# Verify the contracts

Use

`npx hardhat verify --network bsctestnet {contract-address} {initialization-parameters}`

to verify the contract. Note that this contract must be deployed before using Hardhat. The `initialization-parameters` should be strings and separated by spaces.

# Test the contracts

Use

`npx hardhat test {path-to-JS-test-file}`

to run the JS test file.

# Create proxy contracts

## Solidity implementation

1. Import `UUPSUpgradeable.sol` and inherit it (compulsory).
```
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
```

2. Import and use corresponding contracts in `@openzeppelin/contracts-upgradeable` instead of `@openzeppelin/contracts`.

3. Use the function `initialize()` instead of `constructor()`. All inherited contracts must be initialized inside `initialize()`.
```
function initialize() public initializer {
	// Examples of initialization
	__UUPSUpgradeable_init();
	__ERC721Holder_init();
	__Ownable_init();
	__Pausable_init();
	
	// Constructor's content here...
}
```

4. Override the function `_authorizeUpgrade(address)`.
```
function _authorizeUpgrade(address) internal override onlyOwner {}
```

## Environment

You are recommended to use `npm v6.14.13` and `node v14.17.3`. Other versions may not be compatible with Hardhat.

## Configuration

### Deployment configuration

1. Open the file `scripts/deploy-proxy.js`.

2. Provide the name of the contract you want to deploy:
```
CONTRACT_NAME = "..."
```

3. Provide necessary parameters in the function `deployProxy(...)`:
```
const contract = await hre.upgrades.deployProxy(
  factory,
  [PARA_1, PARA_2, etc.],
  { kind: "uups" }
);
```

### Upgrade configuration

1. Open the file `scripts/upgrade-proxy.js`.

2. Provide the name and the proxy address of the contract you want to upgrade:
```
const PROXY_ADDRESS = "...";
CONTRACT_NAME = "..."
```

These information should be retrieved from `deployment.json`.

3. Provide necessary parameters in the function `upgradeProxy(...)`:
```
const contract = await hre.upgrades.upgradeProxy(
  factory,
  [PARA_1, PARA_2, etc.],
  { kind: "uups" }
);
```

## Deploy and upgrade

Use the following command to deploy:
```
npx hardhat run ./scripts/deployProxy.js --network bsctestnet
```

Use the following command to upgrade:
```
npx hardhat run ./scripts/upgradeProxy.js --network bsctestnet
```

Remember to store deployed addresses to the file `deployment.json`.

## Verify

Use the command:
```
npx hardhat verify {logic-contract-address} --network bsctestnet
```

You should provide the address of the logic contract, which is sometimes called implementation contract (not the proxy contract).