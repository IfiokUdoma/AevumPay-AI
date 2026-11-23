// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @dev Six-decimal token used exclusively by the local test suite.
contract TestToken {
    uint8 public constant decimals = 6;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    event Transfer(address indexed from, address indexed to, uint256 value);

    constructor() { balanceOf[msg.sender] = 1000 * 1e6; }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        return move(from, to, amount);
    }
    function transfer(address to, uint256 amount) external returns (bool) {
        return move(msg.sender, to, amount);
    }
    function move(address from, address to, uint256 amount) private returns (bool) {
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}
