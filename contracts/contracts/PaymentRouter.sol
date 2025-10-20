// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PaymentRouter
 * @notice Secure router for forwarding ETH or ERC20 payments to merchants.
 * @dev Uses ReentrancyGuard to prevent reentrant calls on ETH forwarding.
 */
contract PaymentRouter is Ownable, ReentrancyGuard {
    
    /// @notice Emitted when a payment is received (ETH or ERC20)
    event PaymentReceived(
        bytes32 indexed invoiceId,
        address indexed payer,
        address indexed token,
        address merchant,
        uint256 amount
    );

    /// @notice Emitted when ETH is received via fallback function
    event ETHReceived(address indexed from, uint256 amount);
    
    /// @notice Emitted when ETH is refunded from direct transfers
    event ETHRefunded(address indexed to, uint256 amount);

    /// @notice Track total ETH received via fallback
    uint256 public totalETHReceived;

    /**
     * @notice Constructor that sets the initial owner
     * @param initialOwner The address that will be the initial owner
     */
    constructor(address initialOwner) Ownable(initialOwner) {
        require(initialOwner != address(0), "PaymentRouter: zero address owner");
    }

    /**
     * @notice Receive function to accept ETH with automatic refund
     * @dev Automatically refunds ETH sent directly without using payETH function
     * @dev Emits events for tracking direct transfers
     */
    receive() external payable {
        // Track the received ETH
        totalETHReceived += msg.value;
        
        // Emit event for tracking
        emit ETHReceived(msg.sender, msg.value);
        
        // Automatically refund to prevent locked funds
        // This ensures ETH doesn't get stuck in the contract accidentally
        _safeTransferETH(msg.sender, msg.value);
        
        // Emit refund event
        emit ETHRefunded(msg.sender, msg.value);
    }

    /**
     * @notice Fallback function for additional data or invalid calls
     * @dev Handles calls with data or invalid function calls
     */
    fallback() external payable {
        // If ETH was sent with the fallback, handle it same as receive()
        if (msg.value > 0) {
            totalETHReceived += msg.value;
            emit ETHReceived(msg.sender, msg.value);
            _safeTransferETH(msg.sender, msg.value);
            emit ETHRefunded(msg.sender, msg.value);
        }
        // No need to revert - just refund and continue
    }

    /**
     * @notice Pay with ETH; forwards funds to merchant and emits event.
     * @param merchant The merchant's receiving address
     * @param invoiceId Unique identifier for the invoice
     */
    function payETH(address merchant, bytes32 invoiceId)
        external
        payable
        nonReentrant
    {
        require(merchant != address(0), "Invalid merchant");
        require(msg.value > 0, "Invalid amount");
        require(merchant != address(this), "Cannot pay to contract itself");

        (bool success, ) = merchant.call{value: msg.value}("");
        require(success, "ETH transfer failed");

        emit PaymentReceived(invoiceId, msg.sender, address(0), merchant, msg.value);
    }

    /**
     * @notice Pay with ERC20 (e.g., USDC); requires allowance set beforehand.
     * @param token ERC20 token address (e.g., USDC)
     * @param merchant The merchant's receiving address
     * @param amount Amount of tokens to transfer
     * @param invoiceId Unique identifier for the invoice
     */
    function payERC20(
        address token,
        address merchant,
        uint256 amount,
        bytes32 invoiceId
    ) external nonReentrant {
        require(token != address(0), "Invalid token");
        require(merchant != address(0), "Invalid merchant");
        require(amount > 0, "Invalid amount");
        require(merchant != address(this), "Cannot pay to contract itself");

        bool success = IERC20(token).transferFrom(msg.sender, merchant, amount);
        require(success, "ERC20 transfer failed");

        emit PaymentReceived(invoiceId, msg.sender, token, merchant, amount);
    }

    /**
     * @notice Internal function to safely transfer ETH
     * @param to Recipient address
     * @param value Amount of ETH to transfer
     */
    function _safeTransferETH(address to, uint256 value) internal {
        (bool success, ) = to.call{value: value}("");
        require(success, "ETH transfer failed");
    }

    /**
     * @notice Emergency function to rescue ETH sent to contract by mistake
     * @param to Address to send the ETH to
     * @param amount Amount of ETH to rescue
     */
    function rescueETH(address payable to, uint256 amount) external onlyOwner {
        require(to != address(0), "Invalid address");
        require(amount <= address(this).balance, "Insufficient balance");
        
        _safeTransferETH(to, amount);
    }

    /**
     * @notice Emergency function to rescue ERC20 tokens sent to contract by mistake
     * @param token ERC20 token address
     * @param to Address to send the tokens to
     * @param amount Amount of tokens to rescue
     */
    function rescueERC20(address token, address to, uint256 amount) external onlyOwner {
        require(token != address(0), "Invalid token");
        require(to != address(0), "Invalid address");
        
        bool success = IERC20(token).transfer(to, amount);
        require(success, "ERC20 rescue failed");
    }

    /**
     * @notice Get contract ETH balance
     */
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /**
     * @notice Check if contract can receive ETH (always true with auto-refund)
     */
    function canReceiveETH() external pure returns (bool) {
        return true;
    }
}

