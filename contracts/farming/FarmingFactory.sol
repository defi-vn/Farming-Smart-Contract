/* SPDX-License-Identifier: UNLICENSED */

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./SavingFarming.sol";
import "./LockFarming.sol";

contract FarmingFactory is Ownable {
    address[] public lpTokens;
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

    constructor() Ownable() {}

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

    function setTotalRewardPerMonth(uint256 rewardAmount) external onlyOwner {
        for (uint256 i = 0; i < lpTokens.length; i++) {
            address savingFarming = _savingFarmingOf[lpTokens[i]];
            SavingFarming(savingFarming).setTotalRewardPerMonth(rewardAmount);
            uint8 numLockTypes = _numLockTypesOf[lpTokens[i]];
            for (uint8 j = 0; j < numLockTypes; j++) {
                address lockFarming = _lockFarmingOf[lpTokens[i]][j];
                LockFarming(lockFarming).setTotalRewardPerMonth(rewardAmount);
            }
        }
    }

    function setRewardWallet(address rewardWallet) external onlyOwner {
        for (uint256 i = 0; i < lpTokens.length; i++) {
            address savingFarming = _savingFarmingOf[lpTokens[i]];
            SavingFarming(savingFarming).setRewardWallet(rewardWallet);
            uint8 numLockTypes = _numLockTypesOf[lpTokens[i]];
            for (uint8 j = 0; j < numLockTypes; j++) {
                address lockFarming = _lockFarmingOf[lpTokens[i]][j];
                LockFarming(lockFarming).setRewardWallet(rewardWallet);
            }
        }
    }

    function createSavingFarming(
        address lpToken,
        address rewardToken,
        address rewardWallet,
        uint256 totalRewardPerMonth
    ) external onlyOwner {
        require(_savingFarmingOf[lpToken] == address(0));
        SavingFarming newSavingContract = new SavingFarming(
            lpToken,
            rewardToken,
            rewardWallet,
            totalRewardPerMonth,
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
        uint256 duration,
        address lpToken,
        address rewardToken,
        address rewardWallet,
        uint256 totalRewardPerMonth
    ) external onlyOwner {
        LockFarming newLockContract = new LockFarming(
            duration,
            lpToken,
            rewardToken,
            rewardWallet,
            totalRewardPerMonth,
            owner()
        );
        if (!_isLpTokenSupported[lpToken]) {
            lpTokens.push(lpToken);
            _isLpTokenSupported[lpToken] = true;
        }
        _lockFarmingOf[lpToken][_numLockTypesOf[lpToken]] = address(
            newLockContract
        );
        _numLockTypesOf[lpToken]++;
        emit NewLockFarming(lpToken, duration, address(newLockContract));
    }

    function emergencyWithdraw(address recipient) external onlyOwner {
        for (uint256 i = 0; i < lpTokens.length; i++) {
            address savingFarming = _savingFarmingOf[lpTokens[i]];
            SavingFarming(savingFarming).emergencyWithdraw(recipient);
            uint8 numLockTypes = _numLockTypesOf[lpTokens[i]];
            for (uint8 j = 0; j < numLockTypes; j++) {
                address lockFarming = _lockFarmingOf[lpTokens[i]][j];
                LockFarming(lockFarming).emergencyWithdraw(recipient);
            }
        }
    }
}
