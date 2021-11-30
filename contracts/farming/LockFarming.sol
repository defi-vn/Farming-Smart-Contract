/* SPDX-License-Identifier: UNLICENSED */

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./FarmingFactory.sol";

contract LockFarming is Ownable {
    using SafeMath for uint256;

    struct LockItem {
        uint256 amount;
        uint256 expiredAt;
        uint256 lastClaim;
    }

    address[] public participants;
    uint256 public duration;
    IERC20 public lpContract;
    IERC20 public rewardToken;
    FarmingFactory public farmingFactory;
    address private _rewardWallet;
    uint256 private _totalRewardPerMonth;
    mapping(address => LockItem[]) private _lockItemsOf;

    event ReceiveFromSavingFarming(
        address lpToken,
        address participant,
        uint256 amount
    );
    event Deposit(address lpToken, address participant, uint256 amount);
    event ClaimInterest(address lpToken, address participant, uint256 interest);
    event Withdraw(
        address lpToken,
        address participant,
        uint256 amount,
        uint256 interest
    );

    constructor(
        uint256 duration_,
        address lpToken,
        address rewardToken_,
        address rewardWallet,
        uint256 totalRewardPerMonth,
        address owner_
    ) Ownable() {
        duration = duration_;
        lpContract = IERC20(lpToken);
        rewardToken = IERC20(rewardToken_);
        _rewardWallet = rewardWallet;
        _totalRewardPerMonth = totalRewardPerMonth;
        farmingFactory = FarmingFactory(msg.sender);
        transferOwnership(owner_);
    }

    modifier onlyOperator() {
        require(msg.sender == owner() || msg.sender == address(farmingFactory));
        _;
    }

    function getValidLockAmount(address participant)
        external
        view
        returns (uint256)
    {
        LockItem[] memory lockItems = _lockItemsOf[participant];
        uint256 lockAmount = 0;
        for (uint256 i = 0; i < lockItems.length; i++)
            if (block.timestamp < lockItems[i].expiredAt)
                lockAmount = lockAmount.add(lockItems[i].amount);
        return lockAmount;
    }

    function getNumParticipants() external view returns (uint256) {
        return participants.length;
    }

    function getLockItems(address participant)
        external
        view
        returns (LockItem[] memory)
    {
        return _lockItemsOf[participant];
    }

    function getCurrentInterest(address participant, uint256 index)
        public
        view
        returns (uint256)
    {
        require(index < _lockItemsOf[participant].length);
        LockItem memory item = _lockItemsOf[participant][index];
        uint256 farmingPeriod = block.timestamp - item.lastClaim;
        if (farmingPeriod > duration) farmingPeriod = duration;
        uint256 totalLpToken = lpContract.balanceOf(address(this));
        if (totalLpToken == 0) return 0;
        return
            item
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

    function receiveLpFromSavingFarming(address participant, uint256 amount)
        external
    {
        address savingFarming = farmingFactory.getSavingFarmingContract(
            address(lpContract)
        );
        require(msg.sender == savingFarming);
        if (_lockItemsOf[participant].length == 0)
            participants.push(participant);
        _lockItemsOf[participant].push(
            LockItem(amount, block.timestamp.add(duration), block.timestamp)
        );
        emit ReceiveFromSavingFarming(address(lpContract), participant, amount);
    }

    function deposit(uint256 amount) external {
        require(lpContract.balanceOf(msg.sender) >= amount);
        require(lpContract.allowance(msg.sender, address(this)) >= amount);
        lpContract.transferFrom(msg.sender, address(this), amount);
        if (_lockItemsOf[msg.sender].length == 0) participants.push(msg.sender);
        _lockItemsOf[msg.sender].push(
            LockItem(amount, block.timestamp.add(duration), block.timestamp)
        );
        emit Deposit(address(lpContract), msg.sender, amount);
    }

    function claimInterest(uint256 index) external {
        uint256 numLockItems = _lockItemsOf[msg.sender].length;
        require(index < numLockItems);
        LockItem storage item = _lockItemsOf[msg.sender][index];
        require(block.timestamp < item.expiredAt);
        uint256 interest = getCurrentInterest(msg.sender, index);
        rewardToken.transferFrom(_rewardWallet, msg.sender, interest);
        item.lastClaim = block.timestamp;
        emit ClaimInterest(address(lpContract), msg.sender, interest);
    }

    function claimAllInterest() external {
        uint256 totalInterest = 0;
        for (uint256 i = 0; i < _lockItemsOf[msg.sender].length; i++) {
            LockItem storage item = _lockItemsOf[msg.sender][i];
            if (block.timestamp < item.expiredAt) {
                uint256 interest = getCurrentInterest(msg.sender, i);
                totalInterest = totalInterest.add(interest);
                item.lastClaim = block.timestamp;
            }
        }
        rewardToken.transferFrom(_rewardWallet, msg.sender, totalInterest);
        emit ClaimInterest(address(lpContract), msg.sender, totalInterest);
    }

    function withdraw(uint256 index) external {
        uint256 numLockItems = _lockItemsOf[msg.sender].length;
        require(index < numLockItems);
        LockItem storage item = _lockItemsOf[msg.sender][index];
        require(block.timestamp >= item.expiredAt);
        uint256 withdrawnAmount = item.amount;
        lpContract.transfer(msg.sender, withdrawnAmount);
        uint256 interest = getCurrentInterest(msg.sender, index);
        rewardToken.transferFrom(_rewardWallet, msg.sender, interest);
        item.amount = _lockItemsOf[msg.sender][numLockItems - 1].amount;
        item.expiredAt = _lockItemsOf[msg.sender][numLockItems - 1].expiredAt;
        item.lastClaim = _lockItemsOf[msg.sender][numLockItems - 1].lastClaim;
        _lockItemsOf[msg.sender].pop();
        if (numLockItems == 1) {
            for (uint256 i = 0; i < participants.length; i++)
                if (participants[i] == msg.sender) {
                    participants[i] = participants[participants.length - 1];
                    participants.pop();
                    break;
                }
        }
        emit Withdraw(
            address(lpContract),
            msg.sender,
            withdrawnAmount,
            interest
        );
    }

    function emergencyWithdraw(address recipient) external onlyOperator {
        lpContract.transfer(recipient, lpContract.balanceOf(address(this)));
    }
}
