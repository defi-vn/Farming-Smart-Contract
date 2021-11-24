/* SPDX-License-Identifier: UNLICENSED */

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "../farming/FarmingFactory.sol";
import "../farming/LockFarming.sol";

contract Lottery is Ownable {
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
    address private _oraiToken;
    address private _oraiVRFOracle;
    address private _rewardWallet;
    address[] private _players;
    Prize[] private _prizes;
    mapping(address => bool) private _isWinner;
    mapping(uint256 => Prize[]) private _prizeHistory;
    mapping(address => uint256) private _farmingAmountOf;
    mapping(address => uint8) private _weightOf;

    event Reward(uint256 round, address winner, uint256 rewardAmount);

    constructor(
        address dfyToken,
        address rewardWallet,
        address farmingFactory_,
        uint256 numWinners_
    ) Ownable() {
        currentRound = 1;
        dfyContract = IERC20(dfyToken);
        _rewardWallet = rewardWallet;
        farmingFactory = FarmingFactory(farmingFactory_);
        numWinners = numWinners_;
        nextLotteryTime = block.timestamp;
        _oraiToken = address(0xE6487f7BdEB798e2457E44570f367a3059Ed9F93);
        _oraiVRFOracle = address(0x4144Dfd7Df97839507c404d1CA79b47aA227dDA2);
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
                    uint256 farmingAmount = lockFarming.getValidLockAmount(
                        participant
                    );
                    if (farmingAmount > 0) {
                        _totalLockedLPs = _totalLockedLPs.add(
                            farmingAmount.mul(_weightOf[lpToken])
                        );
                        _players.push(participant);
                        _farmingAmountOf[participant] = farmingAmount.mul(
                            _weightOf[lpToken]
                        );
                    }
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
        address chosenPlayer = _players[0];
        do {
            uint256 randomNumber = random().mod(_totalLockedLPs);
            for (uint256 i = 0; i < _players.length; i++) {
                if (randomNumber < _farmingAmountOf[_players[i]]) {
                    chosenPlayer = _players[i];
                    break;
                } else randomNumber -= _farmingAmountOf[_players[i]];
            }
        } while (_isWinner[chosenPlayer]);
        _isWinner[chosenPlayer] = true;
        _prizes.push(Prize(chosenPlayer, rewardAmount));
        dfyContract.transferFrom(_rewardWallet, chosenPlayer, rewardAmount);
        if (_remainingPrizes > 0) _remainingPrizes--;
        if (_remainingPrizes == 0) {
            _prizeHistory[currentRound] = _prizes;
            currentRound++;
            _remainingPrizes = numWinners;
            for (uint256 i = _prizes.length - 1; i >= 0; i--) {
                delete _isWinner[_prizes[i].winner];
                _prizes.pop();
            }
        }
        emit Reward(currentRound, chosenPlayer, rewardAmount);
    }

    function random() private returns (uint256) {
        IERC20(_oraiToken).approve(
            _oraiVRFOracle,
            IVRFOracleOraichain(_oraiVRFOracle).fee()
        );
        bytes memory data = abi.encode(
            address(this),
            this.fulfillRandomness.selector
        );
        bytes32 reqId = IVRFOracleOraichain(_oraiVRFOracle).randomnessRequest(
            uint256(keccak256(abi.encodePacked(gasleft(), block.timestamp))),
            data
        );
        return fulfillRandomness(reqId);
    }

    function fulfillRandomness(bytes32 _reqId) public pure returns (uint256) {
        return uint256(_reqId);
    }
}

interface IVRFOracleOraichain {
    function randomnessRequest(uint256 _seed, bytes calldata _data)
        external
        returns (bytes32);

    function fee() external returns (uint256);
}
