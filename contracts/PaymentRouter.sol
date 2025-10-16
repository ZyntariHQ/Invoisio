// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

/**
 * Minimal payment router that forwards ETH/ERC20 to a merchant
 * and emits a PaymentReceived event for off-chain attribution.
 */
contract PaymentRouter {
    event PaymentReceived(
        bytes32 indexed invoiceId,
        address indexed payer,
        address indexed token,
        address merchant,
        uint256 amount
    );

    /**
     * Pay with ETH; forwards funds to merchant and emits event.
     */
    function payETH(address merchant, bytes32 invoiceId) external payable {
        require(merchant != address(0), "merchant");
        require(msg.value > 0, "amount");
        (bool ok, ) = merchant.call{value: msg.value}("");
        require(ok, "forward");
        emit PaymentReceived(invoiceId, msg.sender, address(0), merchant, msg.value);
    }

    /**
     * Pay with ERC20 (e.g., USDC); requires allowance set beforehand.
     */
    function payERC20(address token, address merchant, uint256 amount, bytes32 invoiceId) external {
        require(token != address(0), "token");
        require(merchant != address(0), "merchant");
        require(amount > 0, "amount");
        bool ok = IERC20(token).transferFrom(msg.sender, merchant, amount);
        require(ok, "transferFrom");
        emit PaymentReceived(invoiceId, msg.sender, token, merchant, amount);
    }
}