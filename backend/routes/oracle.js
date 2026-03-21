const express = require("express");
const { ethers } = require("ethers");

const router = express.Router();

// Contract ABIs (minimal - key oracle functions)
const OracleGatewayABI = [
  "function requestPaymentConfirmation(uint256 _tokenId) external returns (bytes32)",
  "function fulfillPaymentConfirmation(bytes32 _requestId, bytes32 _proofHash) external",
  "function triggerSettlement(uint256 _tokenId) external payable",
  "function isPaymentConfirmed(uint256 _tokenId) external view returns (bool)",
  "function invoiceRequests(uint256) external view returns (bytes32)",
  "event OracleRequestCreated(bytes32 indexed requestId, uint256 indexed tokenId)",
];

const InvoiceTokenABI = [
  "function getInvoice(uint256 _tokenId) external view returns (tuple(uint256 tokenId, address issuer, uint256 faceValue, uint256 totalShares, uint256 sharePrice, uint256 dueDate, uint256 createdAt, string metadataURI, uint8 state))",
];

// Initialize provider and signer
function getOracleSetup() {
  const rpcUrl = process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org";
  const oracleKey = process.env.ORACLE_PRIVATE_KEY;
  if (!oracleKey) throw new Error("ORACLE_PRIVATE_KEY not configured in .env");

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(oracleKey, provider);

  const oracleGateway = new ethers.Contract(
    process.env.ORACLE_GATEWAY_ADDRESS,
    OracleGatewayABI,
    signer
  );

  const invoiceToken = new ethers.Contract(
    process.env.INVOICE_TOKEN_ADDRESS,
    InvoiceTokenABI,
    provider
  );

  return { provider, signer, oracleGateway, invoiceToken };
}

/**
 * POST /api/oracle/confirm-payment
 * Simulates Chainlink oracle flow:
 * 1. Creates an oracle request for the invoice
 * 2. Fulfills the request with a payment proof hash
 *
 * In production, steps 1-2 would be handled by Chainlink nodes
 * executing a custom external adapter that verifies payment
 * against banking/DocuSign APIs.
 *
 * Body: { tokenId: number, paymentRef: string }
 */
router.post("/confirm-payment", async (req, res) => {
  try {
    const { tokenId, paymentRef } = req.body;
    if (!tokenId || !paymentRef) {
      return res.status(400).json({ error: "tokenId and paymentRef required" });
    }

    const { oracleGateway } = getOracleSetup();

    // Step 1: Create oracle request (simulates Chainlink request)
    console.log(`[Oracle] Creating payment confirmation request for invoice #${tokenId}`);
    const requestTx = await oracleGateway.requestPaymentConfirmation(tokenId);
    const requestReceipt = await requestTx.wait();

    // Extract requestId from event
    const requestEvent = requestReceipt.logs.find(
      (log) => {
        try {
          const parsed = oracleGateway.interface.parseLog(log);
          return parsed && parsed.name === "OracleRequestCreated";
        } catch { return false; }
      }
    );

    if (!requestEvent) throw new Error("OracleRequestCreated event not found");
    const parsed = oracleGateway.interface.parseLog(requestEvent);
    const requestId = parsed.args[0];

    console.log(`[Oracle] Request created: ${requestId}`);

    // Step 2: Fulfill with proof hash (simulates Chainlink fulfillment)
    // In production, the Chainlink external adapter would:
    //   - Query DocuSign API for signed invoice status
    //   - Query banking API for payment confirmation
    //   - Construct proof hash from verified payment data
    const proofHash = ethers.keccak256(
      ethers.toUtf8Bytes(`payment_confirmed:${tokenId}:${paymentRef}:${Date.now()}`)
    );

    console.log(`[Oracle] Fulfilling request with proof: ${proofHash}`);
    const fulfillTx = await oracleGateway.fulfillPaymentConfirmation(requestId, proofHash);
    await fulfillTx.wait();

    console.log(`[Oracle] Payment confirmed for invoice #${tokenId}`);

    res.json({
      success: true,
      tokenId,
      requestId,
      proofHash,
      message: `Payment confirmed for invoice #${tokenId}`,
    });
  } catch (err) {
    console.error("[Oracle] Confirm payment error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/oracle/trigger-settlement
 * Triggers settlement after payment confirmation.
 * Sends face value ETH to FundingPool for investor distribution.
 *
 * Body: { tokenId: number }
 */
router.post("/trigger-settlement", async (req, res) => {
  try {
    const { tokenId } = req.body;
    if (!tokenId) return res.status(400).json({ error: "tokenId required" });

    const { oracleGateway, invoiceToken } = getOracleSetup();

    // Verify payment was confirmed
    const confirmed = await oracleGateway.isPaymentConfirmed(tokenId);
    if (!confirmed) {
      return res.status(400).json({ error: "Payment not yet confirmed for this invoice" });
    }

    // Get invoice face value for settlement amount
    const invoice = await invoiceToken.getInvoice(tokenId);
    const faceValue = invoice.faceValue;

    console.log(`[Oracle] Triggering settlement for invoice #${tokenId}, amount: ${ethers.formatEther(faceValue)} ETH`);

    // Send face value ETH with settlement call
    // In production, this ETH would come from the debtor's on-chain payment
    // or a bridge from traditional payment rails
    const tx = await oracleGateway.triggerSettlement(tokenId, { value: faceValue });
    const receipt = await tx.wait();

    console.log(`[Oracle] Settlement triggered. Tx: ${receipt.hash}`);

    res.json({
      success: true,
      tokenId,
      settlementAmount: ethers.formatEther(faceValue),
      txHash: receipt.hash,
      message: `Settlement triggered for invoice #${tokenId}`,
    });
  } catch (err) {
    console.error("[Oracle] Settlement error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/oracle/status/:tokenId
 * Check oracle confirmation status for an invoice.
 */
router.get("/status/:tokenId", async (req, res) => {
  try {
    const { oracleGateway } = getOracleSetup();
    const tokenId = parseInt(req.params.tokenId);
    const confirmed = await oracleGateway.isPaymentConfirmed(tokenId);

    res.json({ tokenId, paymentConfirmed: confirmed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
