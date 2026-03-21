// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./InvoiceToken.sol";

/**
 * @title FundingPool
 * @notice Manages investor ETH deposits for invoice funding, proportional
 *         share tracking, and settlement distribution.
 * @dev Investors send ETH to fund specific invoice token IDs. On settlement,
 *      the contract distributes ETH (principal + return) proportionally.
 */
contract FundingPool is AccessControl, ReentrancyGuard {
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    InvoiceToken public invoiceToken;

    struct FundingInfo {
        uint256 totalFunded;        // Total ETH funded so far
        uint256 targetAmount;       // Required total (totalShares * sharePrice)
        uint256 investorCount;
        bool settled;
    }

    // tokenId => FundingInfo
    mapping(uint256 => FundingInfo) public fundingInfo;

    // tokenId => investor address => amount funded in wei
    mapping(uint256 => mapping(address => uint256)) public investorStakes;

    // tokenId => investor address => shares purchased
    mapping(uint256 => mapping(address => uint256)) public investorShares;

    // tokenId => list of investor addresses
    mapping(uint256 => address[]) public invoiceInvestors;

    // investor => claimable ETH balance (pull pattern)
    mapping(address => uint256) public claimableBalance;

    // Events
    event InvoiceFunded(uint256 indexed tokenId, address indexed investor, uint256 amount, uint256 shares);
    event InvoiceFullyFunded(uint256 indexed tokenId, uint256 totalAmount);
    event InvoiceSettled(uint256 indexed tokenId, uint256 totalDistributed);
    event InvoiceDefaulted(uint256 indexed tokenId);
    event FundsClaimed(address indexed investor, uint256 amount);
    event SMEPaid(uint256 indexed tokenId, address indexed sme, uint256 amount);

    constructor(address _invoiceTokenAddress) {
        invoiceToken = InvoiceToken(_invoiceTokenAddress);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ORACLE_ROLE, msg.sender);
    }

    /**
     * @notice Fund an invoice by purchasing shares with ETH.
     * @param _tokenId The invoice token ID to fund
     */
    function fundInvoice(uint256 _tokenId) external payable nonReentrant {
        InvoiceToken.Invoice memory inv = invoiceToken.getInvoice(_tokenId);
        require(inv.state == InvoiceToken.InvoiceState.Open, "Invoice not open for funding");
        require(msg.value > 0, "Must send ETH");

        FundingInfo storage info = fundingInfo[_tokenId];

        // Initialize target amount on first funding
        if (info.targetAmount == 0) {
            info.targetAmount = inv.totalShares * inv.sharePrice;
        }

        // Calculate shares based on ETH sent
        uint256 sharesToBuy = msg.value / inv.sharePrice;
        require(sharesToBuy > 0, "Insufficient ETH for at least 1 share");

        uint256 actualCost = sharesToBuy * inv.sharePrice;
        uint256 remainingShares = inv.totalShares - (info.totalFunded / inv.sharePrice);
        require(sharesToBuy <= remainingShares, "Not enough shares available");

        // Record investment
        if (investorStakes[_tokenId][msg.sender] == 0) {
            invoiceInvestors[_tokenId].push(msg.sender);
            info.investorCount++;
        }

        investorStakes[_tokenId][msg.sender] += actualCost;
        investorShares[_tokenId][msg.sender] += sharesToBuy;
        info.totalFunded += actualCost;

        // Refund excess ETH
        uint256 refund = msg.value - actualCost;
        if (refund > 0) {
            (bool sent, ) = payable(msg.sender).call{value: refund}("");
            require(sent, "Refund failed");
        }

        emit InvoiceFunded(_tokenId, msg.sender, actualCost, sharesToBuy);

        // Check if fully funded
        if (info.totalFunded >= info.targetAmount) {
            invoiceToken.updateState(_tokenId, InvoiceToken.InvoiceState.Funded);

            // Transfer funded ETH to SME (minus platform fee)
            uint256 platformFee = info.totalFunded / 100; // 1% fee
            uint256 smeAmount = info.totalFunded - platformFee;
            (bool paid, ) = payable(inv.issuer).call{value: smeAmount}("");
            require(paid, "SME payment failed");

            emit InvoiceFullyFunded(_tokenId, info.totalFunded);
            emit SMEPaid(_tokenId, inv.issuer, smeAmount);
        }
    }

    /**
     * @notice Settle an invoice after oracle-confirmed payment.
     *         Distributes face value proportionally to investors (principal + return).
     * @param _tokenId The invoice token ID to settle
     */
    function settleInvoice(uint256 _tokenId) external payable onlyRole(ORACLE_ROLE) nonReentrant {
        InvoiceToken.Invoice memory inv = invoiceToken.getInvoice(_tokenId);
        require(inv.state == InvoiceToken.InvoiceState.Funded, "Invoice not in funded state");

        FundingInfo storage info = fundingInfo[_tokenId];
        require(!info.settled, "Already settled");

        // The oracle sends the face value amount with this call
        // This represents the debtor's payment being bridged on-chain
        require(msg.value >= inv.faceValue, "Insufficient settlement amount");

        info.settled = true;
        invoiceToken.updateState(_tokenId, InvoiceToken.InvoiceState.Settled);

        // Distribute face value proportionally to investors (pull pattern)
        address[] memory investors = invoiceInvestors[_tokenId];
        uint256 totalDistributed = 0;

        for (uint256 i = 0; i < investors.length; i++) {
            address investor = investors[i];
            uint256 shares = investorShares[_tokenId][investor];
            // Each share entitles investor to (faceValue / totalShares)
            uint256 payout = (inv.faceValue * shares) / inv.totalShares;
            claimableBalance[investor] += payout;
            totalDistributed += payout;
        }

        // Refund excess
        uint256 excess = msg.value - totalDistributed;
        if (excess > 0) {
            claimableBalance[msg.sender] += excess;
        }

        emit InvoiceSettled(_tokenId, totalDistributed);
    }

    /**
     * @notice Investors withdraw their settled funds (pull pattern).
     */
    function claimFunds() external nonReentrant {
        uint256 amount = claimableBalance[msg.sender];
        require(amount > 0, "No funds to claim");

        claimableBalance[msg.sender] = 0;
        (bool sent, ) = payable(msg.sender).call{value: amount}("");
        require(sent, "Transfer failed");

        emit FundsClaimed(msg.sender, amount);
    }

    /**
     * @notice Mark an invoice as defaulted (past due, no payment).
     */
    function markDefault(uint256 _tokenId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        InvoiceToken.Invoice memory inv = invoiceToken.getInvoice(_tokenId);
        require(inv.state == InvoiceToken.InvoiceState.Funded, "Invoice not funded");
        require(block.timestamp > inv.dueDate, "Not past due date");

        invoiceToken.updateState(_tokenId, InvoiceToken.InvoiceState.Defaulted);
        emit InvoiceDefaulted(_tokenId);
    }

    // View functions
    function getInvestors(uint256 _tokenId) external view returns (address[] memory) {
        return invoiceInvestors[_tokenId];
    }

    function getInvestorInfo(uint256 _tokenId, address _investor)
        external view returns (uint256 staked, uint256 shares)
    {
        return (investorStakes[_tokenId][_investor], investorShares[_tokenId][_investor]);
    }

    receive() external payable {}
}
