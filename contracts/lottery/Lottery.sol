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

    uint256 public currentRound;
    IERC20 public dfyContract;
    FarmingFactory public farmingFactory;
    uint256 public numWinners;
    uint256 public nextLotteryTime;
    uint256 private _totalLockedLPs;
    uint256 private _remainingPrizes;
    address private _rewardWallet;
    address[] private _players;
    Prize[] private _prizes;
    uint256 private _rewardAmount;
    bytes32 private _linkKeyHash;
    uint256 private _linkFee;
    mapping(address => bool) private _isPlayer;
    mapping(uint256 => Prize[]) private _prizeHistory;
    mapping(address => uint256) private _farmingAmountOf;
    mapping(address => uint8) private _weightOf;

    event Reward(uint256 round, address winner, uint256 rewardAmount);

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
        dfyContract = IERC20(dfyToken);
        _rewardWallet = rewardWallet;
        farmingFactory = FarmingFactory(farmingFactory_);
        numWinners = numWinners_;
        nextLotteryTime = block.timestamp;
        _linkKeyHash = 0xcaf3c3727e033261d383b315559476f48034c13b18f8cafed4d871abe5049186;
        _linkFee = 10**17;
    }

    function getPrizeHistory(uint256 round)
        external
        view
        returns (Prize[] memory)
    {
        return _prizeHistory[round];
    }

    function getWeight(address lpToken) external view returns (uint8) {
        return _weightOf[lpToken];
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

    function _createLotteryList() private {
        for (uint256 i = 0; i < _players.length; i++)
            delete _isPlayer[_players[i]];
        delete _players;
        delete _totalLockedLPs;
        uint256 numLpTokens = farmingFactory.getNumSupportedLpTokens();
        for (uint256 i = 0; i < numLpTokens; i++) {
            address lpToken = farmingFactory.lpTokens(i);
            uint8 numLockTypes = farmingFactory.getNumLockTypes(lpToken);
            for (uint8 j = 1; j <= numLockTypes; j++) {
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

    function spinReward(uint256 rewardAmount) external onlyOwner {
        require(block.timestamp > nextLotteryTime);
        _createLotteryList();
        require(_players.length > numWinners && numWinners > 0);
        require(dfyContract.balanceOf(_rewardWallet) >= rewardAmount);
        require(
            dfyContract.allowance(_rewardWallet, address(this)) >= rewardAmount
        );
        _rewardAmount = rewardAmount;
        _random();
    }

    function _random() private returns (bytes32 requestId) {
        require(LINK.balanceOf(address(this)) >= _linkFee);
        return requestRandomness(_linkKeyHash, _linkFee);
    }

    function fulfillRandomness(bytes32 requestId, uint256 randomness)
        internal
        override
    {
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
        _prizes.push(Prize(chosenPlayer, _rewardAmount));
        dfyContract.transferFrom(_rewardWallet, chosenPlayer, _rewardAmount);
        if (_remainingPrizes > 0) _remainingPrizes--;
        if (_remainingPrizes == 0) {
            _prizeHistory[currentRound] = _prizes;
            currentRound++;
            _remainingPrizes = numWinners;
            delete _prizes;
        }
        emit Reward(currentRound, chosenPlayer, _rewardAmount);
    }
}
