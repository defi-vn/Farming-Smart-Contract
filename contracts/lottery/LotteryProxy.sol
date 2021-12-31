/* SPDX-License-Identifier: UNLICENSED */

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "../utils/VRFConsumerBaseUpgradeable.sol";
import "../farming/FarmingFactory.sol";
import "../farming/LockFarming.sol";

contract LotteryProxy is
    OwnableUpgradeable,
    VRFConsumerBaseUpgradeable,
    UUPSUpgradeable
{
    using SafeMathUpgradeable for uint256;

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
    IERC20Upgradeable public rewardToken;
    FarmingFactory public farmingFactory;
    uint256[] public rewardAmounts;
    uint256 public nextLotteryTime;
    uint256 private _totalLockedLPs;
    uint256 private _remainingPrizes;
    address private _rewardWallet;
    address[] private _players;
    Prize[] private _prizes;
    uint256 private _currentPrize;
    bytes32 private _linkKeyHash;
    uint256 private _linkFee;
    SpinStatus private _status;
    mapping(address => bool) private _isPlayer;
    mapping(uint256 => Prize[]) private _prizeHistory;
    mapping(address => uint256) private _farmingAmountOf;
    mapping(address => uint8) private _weightOf;
    mapping(address => bool) private _operators;
    mapping(uint256 => bool) private _spinnedBefore;

    event NewLotterySchedule(
        uint256 round,
        uint256 startingTime,
        uint256[] rewardAmounts
    );
    event Award(
        uint256 round,
        address winner,
        uint256 prize,
        uint256 rewardAmount
    );

    function initialize(
        address rewardToken_,
        address rewardWallet,
        address farmingFactory_
    ) public initializer {
        __UUPSUpgradeable_init();
        __Ownable_init();
        __VRFConsumerBaseUpgradeable_init(
            0x747973a5A2a4Ae1D3a8fDF5479f1514F65Db9C31,
            0x404460C6A5EdE2D891e8297795264fDe62ADBB75
        );
        currentRound = 0;
        rewardToken = IERC20Upgradeable(rewardToken_);
        _rewardWallet = rewardWallet;
        farmingFactory = FarmingFactory(farmingFactory_);
        _linkKeyHash = 0xc251acd21ec4fb7f31bb8868288bfdbaeb4fbfec2df3735ddbd4f7dc8d60103c;
        _linkFee = 2 * 10**17;
        _status = SpinStatus.FINISHED;
        _operators[msg.sender] = true;
        uint256 numLpTokens = farmingFactory.getNumSupportedLpTokens();
        for (uint256 i = 0; i < numLpTokens; i++)
            _weightOf[farmingFactory.lpTokens(i)] = 1;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

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

    function getNumPrizes() external view returns (uint256) {
        return rewardAmounts.length;
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
        rewardToken = IERC20Upgradeable(rewardToken_);
    }

    function scheduleNextLottery(
        uint256 startingTime,
        uint256[] memory rewardAmounts_,
        address[] memory lpTokens,
        uint8[] memory weights
    ) external onlyOperator {
        require(_remainingPrizes == 0, "Last round not completed");
        for (uint256 i = 0; i < rewardAmounts.length; i++)
            delete _spinnedBefore[i];
        currentRound++;
        nextLotteryTime = startingTime;
        _remainingPrizes = rewardAmounts_.length;
        delete rewardAmounts;
        for (uint256 i = 0; i < _remainingPrizes; i++)
            rewardAmounts.push(rewardAmounts_[i]);
        require(lpTokens.length == weights.length, "Lengths mismatch");
        for (uint256 i = 0; i < lpTokens.length; i++) {
            require(
                farmingFactory.checkLpTokenStatus(lpTokens[i]),
                "LP token not supported"
            );
            _weightOf[lpTokens[i]] = weights[i];
        }
        emit NewLotterySchedule(currentRound, startingTime, rewardAmounts_);
    }

    function _createLotteryList() private {
        for (uint256 i = 0; i < _players.length; i++) {
            delete _isPlayer[_players[i]];
            delete _farmingAmountOf[_players[i]];
        }
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
                    uint256 farmingAmount = lockFarming.getValidLockAmount(
                        participant
                    );
                    uint256 weightedFarmingAmount = farmingAmount.mul(
                        _weightOf[lpToken]
                    );
                    if (farmingAmount > 0 && !_isPlayer[participant]) {
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

    function spinReward(uint256 prize) external onlyOperator {
        require(_remainingPrizes > 0, "Out of prizes");
        require(_status == SpinStatus.FINISHED, "Last spin not completed");
        require(block.timestamp > nextLotteryTime, "Not spin time yet");
        require(prize < rewardAmounts.length, "Prize does not exist");
        require(!_spinnedBefore[prize], "Prize spinned before");
        if (_remainingPrizes == rewardAmounts.length) _createLotteryList();
        require(_players.length > _remainingPrizes, "Not enough players");
        require(
            rewardToken.balanceOf(_rewardWallet) >= rewardAmounts[prize],
            "Not enough amount to award"
        );
        require(
            rewardToken.allowance(_rewardWallet, address(this)) >=
                rewardAmounts[prize],
            "Not enough allowance to award"
        );
        require(
            LINK.balanceOf(address(this)) >= _linkFee,
            "Not enough LINK to spin"
        );
        _currentPrize = prize;
        _status = SpinStatus.SPINNING;
        _spinnedBefore[prize] = true;
        requestRandomness(_linkKeyHash, _linkFee);
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
                delete _farmingAmountOf[_players[i]];
                _players[i] = _players[_players.length - 1];
                _players.pop();
                break;
            } else
                randomNumber = randomNumber.sub(_farmingAmountOf[_players[i]]);
        }
        rewardToken.transferFrom(
            _rewardWallet,
            chosenPlayer,
            rewardAmounts[_currentPrize]
        );
        _prizes.push(
            Prize(chosenPlayer, _currentPrize, rewardAmounts[_currentPrize])
        );
        emit Award(
            currentRound,
            chosenPlayer,
            _currentPrize.add(1),
            rewardAmounts[_currentPrize]
        );
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
