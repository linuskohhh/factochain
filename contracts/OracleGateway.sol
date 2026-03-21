// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./FundingPool.sol";

/**
 * @title OracleGateway
 * @notice Chainlink-compatible oracle interface for payment confirmation.
 *         Accepts payment verification from whitelisted oracle addresses and
 *         triggers settlement in FundingPool.
 * @dev In POC mode, the backend service acts as the oracle operator following
 *      the same request/fulfillment pattern that Chainlink uses. Production
 *      deployment would use ChainlinkClient with decentralized node operators.
 */
contract OracleGateway is AccessControl, ReentrancyGuard {
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    FundingPool public fundingPool;

    struct OracleRequest {
        uint256 tokenId;
        bytes32 proofHash;       // Cryptographic hash of payment proof
        uint256 timestamp;
        address confirmedBy;
        bool fulfilled;
    }

    // requestId => OracleRequest
    mapping(bytes32 => OracleRequest) public oracleRequests;

    // tokenId => latest requestId
    mapping(uint256 => bytes32) public invoiceRequests;

    // Nonce for generating unique request IDs
    uint256 private _nonce;

    // Events
    event OracleRequestCreated(bytes32 indexed requestId, uint256 indexed tokenId);
    event PaymentConfirmed(bytes32 indexed requestId, uint256 indexed tokenId, bytes32 proofHash);
    event SettlementTriggered(uint256 indexed tokenId);

    constructor(address _fundingPoolAddress) {
        fundingPool = FundingPool(payable(_fundingPoolAddress));
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ORACLE_ROLE, msg.sender);
    }

    /**
     * @notice Request payment confirmation for an invoice (simulates Chainlink request).
     * @param _tokenId The invoice token ID to verify payment for
     * @return requestId Unique identifier for this oracle request
     */
    function requestPaymentConfirmation(uint256 _tokenId)
        external onlyRole(ORACLE_ROLE) returns (bytes32)
    {
        bytes32 requestId = keccak256(abi.encodePacked(_tokenId, block.timestamp, _nonce++));

        oracleRequests[requestId] = OracleRequest({
            tokenId: _tokenId,
            proofHash: bytes32(0),
            timestamp: block.timestamp,
            confirmedBy: address(0),
            fulfilled: false
        });

        invoiceRequests[_tokenId] = requestId;

        emit OracleRequestCreated(requestId, _tokenId);
        return requestId;
    }

    /**
     * @notice Fulfill payment confirmation (simulates Chainlink fulfillment callback).
     *         On production, this would be called by Chainlink node operators.
     * @param _requestId The oracle request to fulfill
     * @param _proofHash Cryptographic hash of payment evidence (e.g., DocuSign envelope hash)
     */
    function fulfillPaymentConfirmation(
        bytes32 _requestId,
        bytes32 _proofHash
    ) external onlyRole(ORACLE_ROLE) nonReentrant {
        OracleRequest storage request = oracleRequests[_requestId];
        require(request.timestamp != 0, "Request does not exist");
        require(!request.fulfilled, "Request already fulfilled");
        require(_proofHash != bytes32(0), "Invalid proof hash");

        // Mark as fulfilled
        request.proofHash = _proofHash;
        request.confirmedBy = msg.sender;
        request.fulfilled = true;

        emit PaymentConfirmed(_requestId, request.tokenId, _proofHash);
    }

    /**
     * @notice Trigger settlement after payment is confirmed.
     *         Sends face value ETH to FundingPool for investor distribution.
     * @param _tokenId The invoice to settle
     */
    function triggerSettlement(uint256 _tokenId)
        external payable onlyRole(ORACLE_ROLE) nonReentrant
    {
        bytes32 requestId = invoiceRequests[_tokenId];
        require(requestId != bytes32(0), "No oracle request for this invoice");

        OracleRequest storage request = oracleRequests[requestId];
        require(request.fulfilled, "Payment not yet confirmed");

        // Forward the settlement ETH to FundingPool
        fundingPool.settleInvoice{value: msg.value}(_tokenId);

        emit SettlementTriggered(_tokenId);
    }

    /**
     * @notice Check if payment has been confirmed for an invoice.
     */
    function isPaymentConfirmed(uint256 _tokenId) external view returns (bool) {
        bytes32 requestId = invoiceRequests[_tokenId];
        if (requestId == bytes32(0)) return false;
        return oracleRequests[requestId].fulfilled;
    }

    /**
     * @notice Get oracle request details.
     */
    function getRequest(bytes32 _requestId) external view returns (OracleRequest memory) {
        return oracleRequests[_requestId];
    }

    receive() external payable {}
}
