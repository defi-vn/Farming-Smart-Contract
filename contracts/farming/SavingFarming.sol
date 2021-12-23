/* SPDX-License-Identifier: UNLICENSED */

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "./LockFarming.sol";
import "./FarmingFactory.sol";

contract SavingFarming is Ownable, Pausable {
    using SafeMath for uint256;

    struct FarmingInfo {
        uint256 startedAt;
        uint256 amount;
    }

    address[] public participants;
    IERC20 public lpContract;
    IERC20 public rewardToken;
    FarmingFactory public farmingFactory;
    address private _rewardWallet;
    uint256 private _totalRewardPerMonth;
    mapping(address => FarmingInfo) private _farmingInfoOf;

    event SavingDeposit(address lpToken, address participant, uint256 amount);
    event SavingWithdraw(address lpToken, address participant, uint256 amount);
    event TransferToLockFarming(
        address lpToken,
        address participant,
        uint256 amount,
        uint8 option
    );
    event Settle(address lpToken, address participant, uint256 interest);

    constructor(
        address lpToken,
        address rewardToken_,
        address rewardWallet,
        uint256 totalRewardPerMonth,
        address owner_
    ) Ownable() {
        lpContract = IERC20(lpToken);
        rewardToken = IERC20(rewardToken_);
        _rewardWallet = rewardWallet;
        _totalRewardPerMonth = totalRewardPerMonth;
        farmingFactory = FarmingFactory(msg.sender);
        transferOwnership(owner_);
    }

    modifier onlyOperator() {
        require(
            msg.sender == owner() || msg.sender == address(farmingFactory),
            "Caller is not operator"
        );
        _;
    }

    function getNumParticipants() external view returns (uint256) {
        return participants.length;
    }

    function getFarmingAmount(address participant)
        external
        view
        returns (uint256)
    {
        return _farmingInfoOf[participant].amount;
    }

    function getCurrentInterest(address participant)
        public
        view
        returns (uint256)
    {
        FarmingInfo memory info = _farmingInfoOf[participant];
        uint256 farmingPeriod = block.timestamp - info.startedAt;
        uint256 totalLpToken = lpContract.balanceOf(address(this));
        if (paused()) return 0;
        if (totalLpToken == 0) return 0;
        return
            info
                .amount
                .mul(_totalRewardPerMonth)
                .div(259200)
                .mul(farmingPeriod)
                .div(totalLpToken);
    }

    function setTotalRewardPerMonth(uint256 rewardAmount)
        external
        onlyOperator
    {
        _totalRewardPerMonth = rewardAmount;
    }

    function setRewardWallet(address rewardWallet) external onlyOperator {
        _rewardWallet = rewardWallet;
    }

    function deposit(uint256 amount) external whenNotPaused {
        require(
            lpContract.balanceOf(msg.sender) >= amount,
            "Not enough balance"
        );
        require(
            lpContract.allowance(msg.sender, address(this)) >= amount,
            "Not enough allowance"
        );
        _settle(msg.sender);
        lpContract.transferFrom(msg.sender, address(this), amount);
        if (_farmingInfoOf[msg.sender].amount == 0)
            participants.push(msg.sender);
        _farmingInfoOf[msg.sender].startedAt = block.timestamp;
        _farmingInfoOf[msg.sender].amount = _farmingInfoOf[msg.sender]
            .amount
            .add(amount);
        emit SavingDeposit(address(lpContract), msg.sender, amount);
    }

    function claimInterest() external whenNotPaused {
        _settle(msg.sender);
        _farmingInfoOf[msg.sender].startedAt = block.timestamp;
    }

    function withdraw(uint256 amount) external {
        require(
            _farmingInfoOf[msg.sender].amount >= amount,
            "Not enough amount to withdraw"
        );
        _settle(msg.sender);
        lpContract.transfer(msg.sender, amount);
        if (_farmingInfoOf[msg.sender].amount == amount)
            for (uint256 i = 0; i < participants.length; i++)
                if (participants[i] == msg.sender) {
                    participants[i] = participants[participants.length - 1];
                    participants.pop();
                    break;
                }
        _farmingInfoOf[msg.sender].startedAt = block.timestamp;
        _farmingInfoOf[msg.sender].amount = _farmingInfoOf[msg.sender]
            .amount
            .sub(amount);
        emit SavingWithdraw(address(lpContract), msg.sender, amount);
    }

    function transferToLockFarming(uint256 amount, uint8 option)
        external
        whenNotPaused
    {
        require(
            _farmingInfoOf[msg.sender].amount >= amount,
            "Not enough amount to transfer"
        );
        uint8 numLockTypes = farmingFactory.getNumLockTypes(
            address(lpContract)
        );
        require(option < numLockTypes, "Option out of range");
        address lockFarming = farmingFactory.getLockFarmingContract(
            address(lpContract),
            option
        );
        require(lockFarming != address(0), "Lock farming pool does not exists");
        _settle(msg.sender);
        lpContract.transfer(lockFarming, amount);
        LockFarming(lockFarming).receiveLpFromSavingFarming(msg.sender, amount);
        if (_farmingInfoOf[msg.sender].amount == amount)
            for (uint256 i = 0; i < participants.length; i++)
                if (participants[i] == msg.sender) {
                    participants[i] = participants[participants.length - 1];
                    participants.pop();
                    break;
                }
        _farmingInfoOf[msg.sender].startedAt = block.timestamp;
        _farmingInfoOf[msg.sender].amount = _farmingInfoOf[msg.sender]
            .amount
            .sub(amount);
        emit TransferToLockFarming(
            address(lpContract),
            msg.sender,
            amount,
            option
        );
    }

    function _settle(address participant) private {
        uint256 interest = getCurrentInterest(participant);
        require(
            rewardToken.balanceOf(_rewardWallet) >= interest,
            "Not enough balance to award"
        );
        require(
            rewardToken.allowance(_rewardWallet, address(this)) >= interest,
            "Not enough allowance to award"
        );
        rewardToken.transferFrom(_rewardWallet, participant, interest);
        emit Settle(address(lpContract), participant, interest);
    }

    function emergencyWithdraw(address recipient) external onlyOperator {
        lpContract.transfer(recipient, lpContract.balanceOf(address(this)));
    }

    function pause() external onlyOperator {
        _pause();
    }

    function unpause() external onlyOperator {
        _unpause();
    }
}
