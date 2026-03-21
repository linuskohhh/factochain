const express = require("express");
const multer = require("multer");
const { PinataSDK } = require("pinata-web3");
const fs = require("fs");
const path = require("path");

const router = express.Router();
const upload = multer({ dest: "uploads/" });

// Initialize Pinata client
function getPinata() {
  const jwt = process.env.PINATA_JWT;
  const gateway = process.env.PINATA_GATEWAY || "gateway.pinata.cloud";
  if (!jwt) throw new Error("PINATA_JWT not configured in .env");
  return new PinataSDK({ pinataJwt: jwt, pinataGateway: gateway });
}

/**
 * POST /api/ipfs/upload
 * Upload a file (invoice PDF, image) to IPFS via Pinata.
 * Returns the CID and gateway URL.
 */
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file provided" });

    const pinata = getPinata();
    const fileStream = fs.readFileSync(req.file.path);

    // Create a Blob-like object for Pinata SDK
    const blob = new Blob([fileStream], { type: req.file.mimetype });
    const file = new File([blob], req.file.originalname, { type: req.file.mimetype });

    const result = await pinata.upload.file(file).addMetadata({
      name: `factochain-doc-${Date.now()}`,
      keyValues: {
        app: "factochain",
        type: "invoice-document",
      },
    });

    // Clean up temp file
    fs.unlinkSync(req.file.path);

    res.json({
      cid: result.IpfsHash,
      url: `https://${process.env.PINATA_GATEWAY || "gateway.pinata.cloud"}/ipfs/${result.IpfsHash}`,
      size: result.PinSize,
      timestamp: result.Timestamp,
    });
  } catch (err) {
    console.error("IPFS upload error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/ipfs/metadata
 * Pin a JSON metadata object to IPFS via Pinata.
 * Used for ERC-1155 token metadata URIs.
 */
router.post("/metadata", async (req, res) => {
  try {
    const metadata = req.body;
    if (!metadata || Object.keys(metadata).length === 0) {
      return res.status(400).json({ error: "Empty metadata" });
    }

    const pinata = getPinata();

    const result = await pinata.upload.json(metadata).addMetadata({
      name: `factochain-metadata-${Date.now()}`,
      keyValues: {
        app: "factochain",
        type: "token-metadata",
      },
    });

    res.json({
      cid: result.IpfsHash,
      url: `https://${process.env.PINATA_GATEWAY || "gateway.pinata.cloud"}/ipfs/${result.IpfsHash}`,
    });
  } catch (err) {
    console.error("Metadata pin error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/ipfs/:cid
 * Retrieve metadata from IPFS by CID (proxy through gateway).
 */
router.get("/:cid", async (req, res) => {
  try {
    const gateway = process.env.PINATA_GATEWAY || "gateway.pinata.cloud";
    const url = `https://${gateway}/ipfs/${req.params.cid}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Gateway returned ${response.status}`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("IPFS fetch error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
