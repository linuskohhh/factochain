// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title InvoiceToken
 * @notice ERC-1155 multi-token contract for fractional invoice tokenization.
 *         Each invoice is assigned a unique token ID with a configurable supply
 *         of fungible shares, enabling fractional investor participation.
 * @dev Metadata URIs point to IPFS-hosted JSON containing invoice details and document CIDs.
 */
contract InvoiceToken is ERC1155, AccessControl, ReentrancyGuard {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    enum InvoiceState { Open, Funded, Settled, Defaulted, Cancelled }

    struct Invoice {
        uint256 tokenId;
        address issuer;          // SME address
        uint256 faceValue;       // Invoice face value in wei
        uint256 totalShares;     // Total number of fractional shares
        uint256 sharePrice;      // Price per share in wei (faceValue / totalShares * discount)
        uint256 dueDate;         // Unix timestamp
        uint256 createdAt;       // Unix timestamp
        string metadataURI;      // IPFS URI for invoice metadata + document CID
        InvoiceState state;
    }

    uint256 private _nextTokenId = 1;
    mapping(uint256 => Invoice) public invoices;
    uint256[] public allInvoiceIds;

    // Events
    event InvoiceCreated(
        uint256 indexed tokenId,
        address indexed issuer,
        uint256 faceValue,
        uint256 totalShares,
        uint256 sharePrice,
        uint256 dueDate,
        string metadataURI
    );
    event InvoiceStateChanged(uint256 indexed tokenId, InvoiceState newState);

    constructor() ERC1155("") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
    }

    /**
     * @notice Mint a new invoice token with fractional shares.
     * @param _faceValue Total invoice value in wei
     * @param _totalShares Number of fractional shares to create
     * @param _discountBps Discount rate in basis points (e.g., 200 = 2% discount)
     * @param _dueDate Invoice due date as Unix timestamp
     * @param _metadataURI IPFS URI for invoice metadata (includes document CID)
     */
    function mintInvoice(
        uint256 _faceValue,
        uint256 _totalShares,
        uint256 _discountBps,
        uint256 _dueDate,
        string calldata _metadataURI
    ) external onlyRole(MINTER_ROLE) nonReentrant returns (uint256) {
        require(_faceValue > 0, "Face value must be positive");
        require(_totalShares > 0, "Must have at least 1 share");
        require(_dueDate > block.timestamp, "Due date must be in the future");
        require(bytes(_metadataURI).length > 0, "Metadata URI required");
        require(_discountBps <= 5000, "Discount cannot exceed 50%");

        uint256 tokenId = _nextTokenId++;

        // Share price = (faceValue * (10000 - discountBps)) / (totalShares * 10000)
        // This gives investors a discount, providing their yield
        uint256 sharePrice = (_faceValue * (10000 - _discountBps)) / (_totalShares * 10000);
        require(sharePrice > 0, "Share price must be positive");

        invoices[tokenId] = Invoice({
            tokenId: tokenId,
            issuer: msg.sender,
            faceValue: _faceValue,
            totalShares: _totalShares,
            sharePrice: sharePrice,
            dueDate: _dueDate,
            createdAt: block.timestamp,
            metadataURI: _metadataURI,
            state: InvoiceState.Open
        });

        allInvoiceIds.push(tokenId);

        // Mint all shares to the FundingPool (to be distributed on funding)
        // Shares are held by the contract until investors purchase them
        _mint(address(this), tokenId, _totalShares, "");

        emit InvoiceCreated(
            tokenId, msg.sender, _faceValue, _totalShares, sharePrice, _dueDate, _metadataURI
        );

        return tokenId;
    }

    /**
     * @notice Update invoice state. Called by FundingPool or admin.
     */
    function updateState(uint256 _tokenId, InvoiceState _newState) external {
        require(
            hasRole(ADMIN_ROLE, msg.sender) || hasRole(MINTER_ROLE, msg.sender),
            "Unauthorized"
        );
        require(invoices[_tokenId].tokenId != 0, "Invoice does not exist");
        invoices[_tokenId].state = _newState;
        emit InvoiceStateChanged(_tokenId, _newState);
    }

    /**
     * @notice Cancel an invoice (only before funding).
     */
    function cancelInvoice(uint256 _tokenId) external {
        Invoice storage inv = invoices[_tokenId];
        require(inv.tokenId != 0, "Invoice does not exist");
        require(inv.state == InvoiceState.Open, "Can only cancel open invoices");
        require(
            inv.issuer == msg.sender || hasRole(ADMIN_ROLE, msg.sender),
            "Only issuer or admin"
        );
        inv.state = InvoiceState.Cancelled;
        emit InvoiceStateChanged(_tokenId, InvoiceState.Cancelled);
    }

    /**
     * @notice Transfer shares from contract to investor (called by FundingPool).
     */
    function transferShares(address _to, uint256 _tokenId, uint256 _amount) external {
        require(hasRole(ADMIN_ROLE, msg.sender), "Only admin/FundingPool");
        _safeTransferFrom(address(this), _to, _tokenId, _amount, "");
    }

    // View functions
    function getInvoice(uint256 _tokenId) external view returns (Invoice memory) {
        require(invoices[_tokenId].tokenId != 0, "Invoice does not exist");
        return invoices[_tokenId];
    }

    function getInvoiceCount() external view returns (uint256) {
        return allInvoiceIds.length;
    }

    function getAllInvoiceIds() external view returns (uint256[] memory) {
        return allInvoiceIds;
    }

    function uri(uint256 _tokenId) public view override returns (string memory) {
        require(invoices[_tokenId].tokenId != 0, "Invoice does not exist");
        return invoices[_tokenId].metadataURI;
    }

    // Required overrides
    function supportsInterface(bytes4 interfaceId)
        public view override(ERC1155, AccessControl) returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function onERC1155Received(address, address, uint256, uint256, bytes memory)
        public pure returns (bytes4)
    {
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address, address, uint256[] memory, uint256[] memory, bytes memory)
        public pure returns (bytes4)
    {
        return this.onERC1155BatchReceived.selector;
    }
}
