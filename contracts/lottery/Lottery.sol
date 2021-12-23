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
        uint256 prize;
        uint256 rewardAmount;
    }

    enum SpinStatus {
        SPINNING,
        FINISHED
    }
    uint256 public currentRound;
    IERC20 public rewardToken;
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
    mapping(address => bool) private _operators;

    event NewLotterySchedule(uint256 round, uint256 startingTime);
    event Reward(
        uint256 round,
        address winner,
        uint256 prize,
        uint256 rewardAmount
    );

    constructor(
        address rewardToken_,
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
        currentRound = 0;
        rewardToken = IERC20(rewardToken_);
        _rewardWallet = rewardWallet;
        farmingFactory = FarmingFactory(farmingFactory_);
        numWinners = numWinners_;
        _linkKeyHash = 0xcaf3c3727e033261d383b315559476f48034c13b18f8cafed4d871abe5049186;
        _linkFee = 10**17;
        _status = SpinStatus.FINISHED;
        uint256 numLpTokens = farmingFactory.getNumSupportedLpTokens();
        _operators[msg.sender] = true;
        for (uint256 i = 0; i < numLpTokens; i++)
            _weightOf[farmingFactory.lpTokens(i)] = 1;
    }

    modifier onlyOperator() {
        require(_operators[msg.sender], "Caller is not operator");
        _;
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
        uint8[] memory weights = new uint8[](lpTokens.length);
        for (uint256 i = 0; i < lpTokens.length; i++)
            weights[i] = _weightOf[lpTokens[i]];
        return weights;
    }

    function setOperators(address[] memory operators, bool[] memory isOperators)
        external
        onlyOwner
    {
        require(operators.length == isOperators.length, "Length mismatch");
        for (uint256 i = 0; i < operators.length; i++)
            _operators[operators[i]] = isOperators[i];
    }

    function setRewardWallet(address rewardWallet) external onlyOperator {
        _rewardWallet = rewardWallet;
    }

    function setRewardToken(address rewardToken_) external onlyOperator {
        rewardToken = IERC20(rewardToken_);
    }

    function scheduleNextLottery(
        uint256 startingTime,
        uint256 numWinners_,
        address[] memory lpTokens,
        uint8[] memory weights
    ) external onlyOperator {
        require(_remainingPrizes == 0, "Last round not completed");
        currentRound++;
        nextLotteryTime = startingTime;
        numWinners = numWinners_;
        _remainingPrizes = numWinners_;
        require(lpTokens.length == weights.length, "Lengths mismatch");
        for (uint256 i = 0; i < lpTokens.length; i++) {
            require(
                farmingFactory.checkLpTokenStatus(lpTokens[i]),
                "LP token not supported"
            );
            _weightOf[lpTokens[i]] = weights[i];
        }
        emit NewLotterySchedule(currentRound, startingTime);
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
        onlyOperator
    {
        require(_remainingPrizes > 0, "Out of prizes");
        require(_status == SpinStatus.FINISHED, "Last spin not completed");
        require(block.timestamp > nextLotteryTime, "Not spin time yet");
        if (_remainingPrizes == numWinners) _createLotteryList();
        require(_players.length > _remainingPrizes, "Not enough players");
        require(
            rewardToken.balanceOf(_rewardWallet) >= rewardAmount,
            "Not enough amount to award"
        );
        require(
            rewardToken.allowance(_rewardWallet, address(this)) >= rewardAmount,
            "Not enough allowance to award"
        );
        require(
            LINK.balanceOf(address(this)) >= _linkFee,
            "Not enough LINK to spin"
        );
        _currentPrize = prize;
        _rewardAmount = rewardAmount;
        _status = SpinStatus.SPINNING;
        // requestRandomness(_linkKeyHash, _linkFee);

        // TODO: Use Chainlink VRF and delete from here
        _status = SpinStatus.FINISHED;
        address chosenPlayer = _players[0];
        uint256 randomness = uint256(
            keccak256(abi.encodePacked(block.timestamp))
        );
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
        rewardToken.transferFrom(_rewardWallet, chosenPlayer, _rewardAmount);
        _prizes.push(Prize(chosenPlayer, _currentPrize, _rewardAmount));
        emit Reward(currentRound, chosenPlayer, _currentPrize, _rewardAmount);
        if (_remainingPrizes > 0) _remainingPrizes--;
        if (_remainingPrizes == 0) {
            _prizeHistory[currentRound] = _prizes;
            delete _prizes;
        }
    }

    function fulfillRandomness(bytes32 requestId, uint256 randomness)
        internal
        override
    {
        _status = SpinStatus.FINISHED;
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
        rewardToken.transferFrom(_rewardWallet, chosenPlayer, _rewardAmount);
        _prizes.push(Prize(chosenPlayer, _currentPrize, _rewardAmount));
        emit Reward(currentRound, chosenPlayer, _currentPrize, _rewardAmount);
        if (_remainingPrizes > 0) _remainingPrizes--;
        if (_remainingPrizes == 0) {
            _prizeHistory[currentRound] = _prizes;
            delete _prizes;
        }
    }

    function emergencyWithdraw(address recipient) external onlyOwner {
        LINK.transfer(recipient, LINK.balanceOf(address(this)));
    }
}
