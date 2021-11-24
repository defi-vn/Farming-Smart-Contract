/* SPDX-License-Identifier: UNLICENSED */

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./SavingFarming.sol";
import "./LockFarming.sol";

contract FarmingFactory is Ownable {
    address[] public lpTokens;
    address public dfyToken;
    address private _rewardWallet;
    mapping(address => bool) private _isLpTokenSupported;
    mapping(address => address) private _savingFarmingOf;
    mapping(address => uint8) private _numLockTypesOf;
    mapping(address => mapping(uint8 => address)) private _lockFarmingOf;

    event NewSavingFarming(address lpToken, address savingFarmingContract);
    event NewLockFarming(
        address lpToken,
        uint256 duration,
        address lockFarmingContract
    );

    constructor(address dfyToken_, address rewardWallet) Ownable() {
        dfyToken = dfyToken_;
        _rewardWallet = rewardWallet;
    }

    function checkLpTokenStatus(address lpToken) external view returns (bool) {
        return _isLpTokenSupported[lpToken];
    }

    function getNumSupportedLpTokens() external view returns (uint256) {
        return lpTokens.length;
    }

    function getSavingFarmingContract(address lpToken)
        external
        view
        returns (address)
    {
        return _savingFarmingOf[lpToken];
    }

    function getNumLockTypes(address lpToken) external view returns (uint8) {
        return _numLockTypesOf[lpToken];
    }

    function getLockFarmingContract(address lpToken, uint8 lockType)
        external
        view
        returns (address)
    {
        require(lockType > 0 && lockType <= _numLockTypesOf[lpToken]);
        return _lockFarmingOf[lpToken][lockType];
    }

    function createSavingFarming(address lpToken, uint256 totalDFYPerMonth)
        external
        onlyOwner
    {
        require(_savingFarmingOf[lpToken] == address(0));
        SavingFarming newSavingContract = new SavingFarming(
            lpToken,
            dfyToken,
            _rewardWallet,
            totalDFYPerMonth,
            owner()
        );
        _savingFarmingOf[lpToken] = address(newSavingContract);
        if (!_isLpTokenSupported[lpToken]) {
            lpTokens.push(lpToken);
            _isLpTokenSupported[lpToken] = true;
        }
        emit NewSavingFarming(lpToken, address(newSavingContract));
    }

    function createLockFarming(
        address lpToken,
        uint256 duration,
        uint256 totalDFYPerMonth
    ) external onlyOwner {
        LockFarming newLockContract = new LockFarming(
            duration,
            lpToken,
            dfyToken,
            _rewardWallet,
            totalDFYPerMonth,
            owner()
        );
        if (!_isLpTokenSupported[lpToken]) {
            lpTokens.push(lpToken);
            _isLpTokenSupported[lpToken] = true;
        }
        _numLockTypesOf[lpToken]++;
        _lockFarmingOf[lpToken][_numLockTypesOf[lpToken]] = address(
            newLockContract
        );
        emit NewLockFarming(lpToken, duration, address(newLockContract));
    }
}
