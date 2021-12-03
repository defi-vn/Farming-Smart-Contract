/* SPDX-License-Identifier: UNLICENSED */
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract BNBToken is ERC20Capped, ERC20Burnable, Ownable {
    using SafeMath for uint256;

    // owner address, received max total supply amount after mint
    uint256 public _totalSupply = 500000000 * 10**18;

    // Mapping store exchange wallets
    mapping(address => bool) public _exchangeWallets;

    // Sell token Fee percentage
    uint256 public _feePercentage = 500000;
    uint256 public _zoomPercentage = 1e5;

    // Fee wallet
    address public _feeWallet;

    // Exclude fee wallets
    mapping(address => bool) public _excludeFeeWallets;

    constructor(address feeWallet, address ownerAddress)
        Ownable()
        ERC20Capped(_totalSupply)
        ERC20("WBNB Token", "WBNB")
    {
        _feeWallet = feeWallet;
        Ownable.transferOwnership(ownerAddress);
        ERC20._mint(ownerAddress, _totalSupply);
    }

    function _mint(address account, uint256 amount)
        internal
        virtual
        override(ERC20, ERC20Capped)
    {
        ERC20Capped._mint(account, amount);
    }

    // Set fee
    function setFeePercentage(uint256 fee) external onlyOwner {
        _feePercentage = fee;
    }

    // Set fee wallet
    function setFeeWallet(address wallet) external onlyOwner {
        _feeWallet = wallet;
    }

    // Set exchange wallets
    function setExchangeWallet(address wallet, bool isExchange)
        external
        onlyOwner
    {
        _exchangeWallets[wallet] = isExchange;
    }

    // Set exclude fee wallets
    function setExcludeFeeWallet(address wallet, bool isExcludeFee)
        external
        onlyOwner
    {
        _excludeFeeWallets[wallet] = isExcludeFee;
    }

    // Override transfer to calculate fee & keep fee
    function _transfer(
        address sender,
        address recipient,
        uint256 amount
    ) internal virtual override {
        uint256 fee = 0;
        if (_exchangeWallets[recipient]) {
            fee = amount.mul(_feePercentage).div(_zoomPercentage).div(100);
        }

        if (fee > 0 && !_excludeFeeWallets[tx.origin]) {
            ERC20._transfer(sender, recipient, amount.sub(fee));
            ERC20._transfer(sender, _feeWallet, fee);
        } else {
            ERC20._transfer(sender, recipient, amount);
        }
    }
}
