/* SPDX-License-Identifier: UNLICENSED */

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./LockFarming.sol";
import "./FarmingFactory.sol";

contract SavingFarming is Ownable {
    using SafeMath for uint256;

    struct FarmingInfo {
        uint256 startedAt;
        uint256 amount;
    }

    address[] public participants;
    IERC20 public lpContract;
    IERC20 public DFY;
    FarmingFactory public farmingFactory;
    address private _rewardWallet;
    uint256 private _totalDFYPerMonth;
    mapping(address => FarmingInfo) private _farmingInfoOf;

    event Deposit(address lpToken, address participant, uint256 amount);
    event Withdraw(address lpToken, address participant, uint256 amount);
    event TransferToLockFarming(
        address lpToken,
        address participant,
        uint256 amount
    );
    event Settle(address lpToken, address participant, uint256 interest);

    constructor(
        address lpToken,
        address dfyToken,
        address rewardWallet,
        uint256 totalDFYPerMonth,
        address owner_
    ) Ownable() {
        lpContract = IERC20(lpToken);
        DFY = IERC20(dfyToken);
        _rewardWallet = rewardWallet;
        _totalDFYPerMonth = totalDFYPerMonth;
        farmingFactory = FarmingFactory(msg.sender);
        transferOwnership(owner_);
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
        if (totalLpToken == 0) return 0;
        return
            info
                .amount
                .mul(_totalDFYPerMonth)
                .div(259200)
                .mul(farmingPeriod)
                .div(totalLpToken);
    }

    function setTotalDFYPerMonth(uint256 dfyAmount) external onlyOwner {
        _totalDFYPerMonth = dfyAmount;
    }

    function deposit(uint256 amount) external {
        require(lpContract.balanceOf(msg.sender) >= amount);
        require(lpContract.allowance(msg.sender, address(this)) >= amount);
        _settle(msg.sender);
        lpContract.transferFrom(msg.sender, address(this), amount);
        if (_farmingInfoOf[msg.sender].amount == 0)
            participants.push(msg.sender);
        _farmingInfoOf[msg.sender].startedAt = block.timestamp;
        _farmingInfoOf[msg.sender].amount = _farmingInfoOf[msg.sender]
            .amount
            .add(amount);
        emit Deposit(address(lpContract), msg.sender, amount);
    }

    function claimInterest() external {
        _settle(msg.sender);
        _farmingInfoOf[msg.sender].startedAt = block.timestamp;
    }

    function withdraw(uint256 amount) external {
        require(_farmingInfoOf[msg.sender].amount >= amount);
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
        emit Withdraw(address(lpContract), msg.sender, amount);
    }

    function transferToLockFarming(uint256 amount, uint8 option) external {
        require(_farmingInfoOf[msg.sender].amount >= amount);
        uint8 numLockTypes = farmingFactory.getNumLockTypes(
            address(lpContract)
        );
        require(option > 0 && option <= numLockTypes);
        address lockFarming = farmingFactory.getLockFarmingContract(
            address(lpContract),
            option
        );
        require(lockFarming != address(0));
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
        emit TransferToLockFarming(address(lpContract), msg.sender, amount);
    }

    function _settle(address participant) private {
        uint256 interest = getCurrentInterest(participant);
        require(DFY.balanceOf(_rewardWallet) >= interest);
        require(DFY.allowance(_rewardWallet, address(this)) >= interest);
        DFY.transferFrom(_rewardWallet, participant, interest);
        emit Settle(address(lpContract), participant, interest);
    }

    function emergencyWithdraw() external onlyOwner {
        lpContract.transfer(owner(), lpContract.balanceOf(address(this)));
    }
}
