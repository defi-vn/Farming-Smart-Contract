/* SPDX-License-Identifier: UNLICENSED */

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@chainlink/contracts/src/v0.8/VRFConsumerBase.sol";
import "../farming/FarmingFactory.sol";
import "../farming/LockFarming.sol";

contract Lottery is Ownable, VRFConsumerBase {
    using SafeMath for uint256;

    struct Prize {
        address winner;
        uint256 reward;
    }

    enum SpinStatus {
        SPINNING,
        SPIN_OVER
    }
    uint256 public currentRound;
    IERC20 public DFY;
    FarmingFactory public farmingFactory;
    uint256 public numWinners;
    uint256 public nextLotteryTime;
    uint256 private _totalLockedLPs;
    uint256 private _remainingPrizes;
    address private _rewardWallet;
    address[] private _players;
    Prize[] private _prizes;
    uint256 private _currentPrize;
    uint256 private _rewardAmount;
    bytes32 private _linkKeyHash;
    uint256 private _linkFee;
    SpinStatus private _status;
    mapping(address => bool) private _isPlayer;
    mapping(uint256 => Prize[]) private _prizeHistory;
    mapping(address => uint256) private _farmingAmountOf;
    mapping(address => uint8) private _weightOf;

    event Reward(
        uint256 round,
        address winner,
        uint256 prize,
        uint256 rewardAmount
    );

    constructor(
        address dfyToken,
        address rewardWallet,
        address farmingFactory_,
        uint256 numWinners_
    )
        Ownable()
        VRFConsumerBase(
            0xa555fC018435bef5A13C6c6870a9d4C11DEC329C,
            0x84b9B910527Ad5C03A9Ca831909E21e236EA7b06
        )
    {
        currentRound = 1;
        DFY = IERC20(dfyToken);
        _rewardWallet = rewardWallet;
        farmingFactory = FarmingFactory(farmingFactory_);
        numWinners = numWinners_;
        _remainingPrizes = numWinners_;
        nextLotteryTime = block.timestamp;
        _linkKeyHash = 0xcaf3c3727e033261d383b315559476f48034c13b18f8cafed4d871abe5049186;
        _linkFee = 10**17;
        _status = SpinStatus.SPIN_OVER;
    }

    function getPrizeHistory(uint256 round)
        external
        view
        returns (Prize[] memory)
    {
        return _prizeHistory[round];
    }

    function getWeight(address[] memory lpTokens)
        external
        view
        returns (uint8[] memory)
    {
        uint8[] memory weights;
        for (uint256 i = 0; i < lpTokens.length; i++)
            weights[i] = _weightOf[lpTokens[i]];
        return weights;
    }

    function setWeight(address[] memory lpTokens, uint8[] memory weights)
        external
        onlyOwner
    {
        require(lpTokens.length == farmingFactory.getNumSupportedLpTokens());
        for (uint256 i = 0; i < lpTokens.length; i++) {
            require(farmingFactory.checkLpTokenStatus(lpTokens[i]));
            _weightOf[lpTokens[i]] = weights[i];
        }
    }

    function setNextLotteryTime(uint256 nextTime) external onlyOwner {
        nextLotteryTime = nextTime;
    }

    function setNumWinners(uint256 numWinners_) external onlyOwner {
        require(_remainingPrizes == numWinners);
        numWinners = numWinners_;
        _remainingPrizes = numWinners_;
    }

    function _createLotteryList() private {
        for (uint256 i = 0; i < _players.length; i++)
            delete _isPlayer[_players[i]];
        delete _players;
        delete _totalLockedLPs;
        uint256 numLpTokens = farmingFactory.getNumSupportedLpTokens();
        for (uint256 i = 0; i < numLpTokens; i++) {
            address lpToken = farmingFactory.lpTokens(i);
            uint8 numLockTypes = farmingFactory.getNumLockTypes(lpToken);
            for (uint8 j = 0; j < numLockTypes; j++) {
                address lockFarmingAddr = farmingFactory.getLockFarmingContract(
                    lpToken,
                    j
                );
                LockFarming lockFarming = LockFarming(lockFarmingAddr);
                uint256 numParticipants = lockFarming.getNumParticipants();
                for (uint256 k = 0; k < numParticipants; k++) {
                    address participant = lockFarming.participants(k);
                    uint256 weightedFarmingAmount = lockFarming
                        .getValidLockAmount(participant)
                        .mul(_weightOf[lpToken]);
                    if (!_isPlayer[participant]) {
                        _players.push(participant);
                        _isPlayer[participant] = true;
                    }
                    _totalLockedLPs = _totalLockedLPs.add(
                        weightedFarmingAmount
                    );
                    _farmingAmountOf[participant] = _farmingAmountOf[
                        participant
                    ].add(weightedFarmingAmount);
                }
            }
        }
    }

    function spinReward(uint256 prize, uint256 rewardAmount)
        external
        onlyOwner
    {
        require(_status == SpinStatus.SPIN_OVER);
        require(block.timestamp > nextLotteryTime);
        if (_remainingPrizes == numWinners) _createLotteryList();
        require(_players.length > numWinners && numWinners > 0);
        require(DFY.balanceOf(_rewardWallet) >= rewardAmount);
        require(DFY.allowance(_rewardWallet, address(this)) >= rewardAmount);
        require(LINK.balanceOf(address(this)) >= _linkFee);
        _currentPrize = prize;
        _rewardAmount = rewardAmount;
        _status = SpinStatus.SPINNING;
        requestRandomness(_linkKeyHash, _linkFee);
    }

    function fulfillRandomness(bytes32 requestId, uint256 randomness)
        internal
        override
    {
        _status = SpinStatus.SPIN_OVER;
        address chosenPlayer = _players[0];
        uint256 randomNumber = randomness.mod(_totalLockedLPs);
        for (uint256 i = 0; i < _players.length; i++) {
            if (randomNumber < _farmingAmountOf[_players[i]]) {
                chosenPlayer = _players[i];
                delete _isPlayer[_players[i]];
                _totalLockedLPs = _totalLockedLPs.sub(
                    _farmingAmountOf[_players[i]]
                );
                _players[i] = _players[_players.length - 1];
                _players.pop();
                break;
            } else randomNumber -= _farmingAmountOf[_players[i]];
        }
        emit Reward(currentRound, chosenPlayer, _currentPrize, _rewardAmount);
        _prizes.push(Prize(chosenPlayer, _rewardAmount));
        DFY.transferFrom(_rewardWallet, chosenPlayer, _rewardAmount);
        if (_remainingPrizes > 0) _remainingPrizes--;
        if (_remainingPrizes == 0) {
            _prizeHistory[currentRound] = _prizes;
            currentRound++;
            _remainingPrizes = numWinners;
            delete _prizes;
        }
    }

    function emergencyWithdraw() external onlyOwner {
        LINK.transfer(owner(), LINK.balanceOf(address(this)));
    }
}
