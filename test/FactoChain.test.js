const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FactoChain", function () {
  let invoiceToken, fundingPool, oracleGateway;
  let owner, sme, investor1, investor2, oracle;

  const FACE_VALUE = ethers.parseEther("10"); // 10 ETH
  const TOTAL_SHARES = 10n;
  const DISCOUNT_BPS = 200n; // 2% discount
  const METADATA_URI = "ipfs://QmExampleCID123/metadata.json";

  beforeEach(async function () {
    [owner, sme, investor1, investor2, oracle] = await ethers.getSigners();

    // Deploy InvoiceToken
    const InvoiceToken = await ethers.getContractFactory("InvoiceToken");
    invoiceToken = await InvoiceToken.deploy();
    await invoiceToken.waitForDeployment();

    // Deploy FundingPool
    const FundingPool = await ethers.getContractFactory("FundingPool");
    fundingPool = await FundingPool.deploy(await invoiceToken.getAddress());
    await fundingPool.waitForDeployment();

    // Deploy OracleGateway
    const OracleGateway = await ethers.getContractFactory("OracleGateway");
    oracleGateway = await OracleGateway.deploy(await fundingPool.getAddress());
    await oracleGateway.waitForDeployment();

    // Configure roles
    const ADMIN_ROLE = await invoiceToken.ADMIN_ROLE();
    const MINTER_ROLE = await invoiceToken.MINTER_ROLE();
    const ORACLE_ROLE = await fundingPool.ORACLE_ROLE();

    await invoiceToken.grantRole(MINTER_ROLE, sme.address);
    await invoiceToken.grantRole(ADMIN_ROLE, await fundingPool.getAddress());
    await fundingPool.grantRole(ORACLE_ROLE, await oracleGateway.getAddress());
    await fundingPool.grantRole(ORACLE_ROLE, oracle.address);
    await oracleGateway.grantRole(await oracleGateway.ORACLE_ROLE(), oracle.address);
  });

  describe("InvoiceToken", function () {
    it("should mint invoice with correct parameters", async function () {
      const futureDate = Math.floor(Date.now() / 1000) + 86400 * 30;

      const tx = await invoiceToken.connect(sme).mintInvoice(
        FACE_VALUE, TOTAL_SHARES, DISCOUNT_BPS, futureDate, METADATA_URI
      );
      await tx.wait();

      const invoice = await invoiceToken.getInvoice(1);
      expect(invoice.issuer).to.equal(sme.address);
      expect(invoice.faceValue).to.equal(FACE_VALUE);
      expect(invoice.totalShares).to.equal(TOTAL_SHARES);
      expect(invoice.state).to.equal(0); // Open
    });

    it("should calculate correct share price with discount", async function () {
      const futureDate = Math.floor(Date.now() / 1000) + 86400 * 30;
      await invoiceToken.connect(sme).mintInvoice(
        FACE_VALUE, TOTAL_SHARES, DISCOUNT_BPS, futureDate, METADATA_URI
      );

      const invoice = await invoiceToken.getInvoice(1);
      // sharePrice = (10 ETH * (10000 - 200)) / (10 * 10000) = 0.98 ETH
      const expectedSharePrice = (FACE_VALUE * (10000n - DISCOUNT_BPS)) / (TOTAL_SHARES * 10000n);
      expect(invoice.sharePrice).to.equal(expectedSharePrice);
    });

    it("should reject minting from unauthorized address", async function () {
      const futureDate = Math.floor(Date.now() / 1000) + 86400 * 30;
      await expect(
        invoiceToken.connect(investor1).mintInvoice(
          FACE_VALUE, TOTAL_SHARES, DISCOUNT_BPS, futureDate, METADATA_URI
        )
      ).to.be.reverted;
    });

    it("should reject zero face value", async function () {
      const futureDate = Math.floor(Date.now() / 1000) + 86400 * 30;
      await expect(
        invoiceToken.connect(sme).mintInvoice(0, TOTAL_SHARES, DISCOUNT_BPS, futureDate, METADATA_URI)
      ).to.be.revertedWith("Face value must be positive");
    });

    it("should reject past due date", async function () {
      const pastDate = Math.floor(Date.now() / 1000) - 86400;
      await expect(
        invoiceToken.connect(sme).mintInvoice(FACE_VALUE, TOTAL_SHARES, DISCOUNT_BPS, pastDate, METADATA_URI)
      ).to.be.revertedWith("Due date must be in the future");
    });

    it("should cancel an open invoice", async function () {
      const futureDate = Math.floor(Date.now() / 1000) + 86400 * 30;
      await invoiceToken.connect(sme).mintInvoice(
        FACE_VALUE, TOTAL_SHARES, DISCOUNT_BPS, futureDate, METADATA_URI
      );

      await invoiceToken.connect(sme).cancelInvoice(1);
      const invoice = await invoiceToken.getInvoice(1);
      expect(invoice.state).to.equal(4); // Cancelled
    });

    it("should return correct metadata URI", async function () {
      const futureDate = Math.floor(Date.now() / 1000) + 86400 * 30;
      await invoiceToken.connect(sme).mintInvoice(
        FACE_VALUE, TOTAL_SHARES, DISCOUNT_BPS, futureDate, METADATA_URI
      );

      expect(await invoiceToken.uri(1)).to.equal(METADATA_URI);
    });

    it("should track all invoice IDs", async function () {
      const futureDate = Math.floor(Date.now() / 1000) + 86400 * 30;
      await invoiceToken.connect(sme).mintInvoice(FACE_VALUE, TOTAL_SHARES, DISCOUNT_BPS, futureDate, METADATA_URI);
      await invoiceToken.connect(sme).mintInvoice(FACE_VALUE, 5n, 100n, futureDate, "ipfs://Qm2");

      const ids = await invoiceToken.getAllInvoiceIds();
      expect(ids.length).to.equal(2);
    });
  });

  describe("FundingPool", function () {
    let sharePrice;
    const futureDate = () => Math.floor(Date.now() / 1000) + 86400 * 30;

    beforeEach(async function () {
      await invoiceToken.connect(sme).mintInvoice(
        FACE_VALUE, TOTAL_SHARES, DISCOUNT_BPS, futureDate(), METADATA_URI
      );
      const invoice = await invoiceToken.getInvoice(1);
      sharePrice = invoice.sharePrice;
    });

    it("should allow investor to fund an invoice", async function () {
      await fundingPool.connect(investor1).fundInvoice(1, { value: sharePrice * 3n });

      const info = await fundingPool.fundingInfo(1);
      expect(info.totalFunded).to.equal(sharePrice * 3n);
      expect(info.investorCount).to.equal(1);
    });

    it("should allow multiple investors", async function () {
      await fundingPool.connect(investor1).fundInvoice(1, { value: sharePrice * 5n });
      await fundingPool.connect(investor2).fundInvoice(1, { value: sharePrice * 5n });

      const info = await fundingPool.fundingInfo(1);
      expect(info.investorCount).to.equal(2);
    });

    it("should transition to Funded when fully funded", async function () {
      await fundingPool.connect(investor1).fundInvoice(1, { value: sharePrice * 10n });

      const invoice = await invoiceToken.getInvoice(1);
      expect(invoice.state).to.equal(1); // Funded
    });

    it("should pay SME when fully funded", async function () {
      const smeBefore = await ethers.provider.getBalance(sme.address);
      await fundingPool.connect(investor1).fundInvoice(1, { value: sharePrice * 10n });
      const smeAfter = await ethers.provider.getBalance(sme.address);

      // SME gets total - 1% platform fee
      const expectedPayment = (sharePrice * 10n * 99n) / 100n;
      expect(smeAfter - smeBefore).to.equal(expectedPayment);
    });

    it("should reject overfunding", async function () {
      await fundingPool.connect(investor1).fundInvoice(1, { value: sharePrice * 8n });
      await expect(
        fundingPool.connect(investor2).fundInvoice(1, { value: sharePrice * 5n })
      ).to.be.revertedWith("Not enough shares available");
    });

    it("should reject funding with zero ETH", async function () {
      await expect(
        fundingPool.connect(investor1).fundInvoice(1, { value: 0 })
      ).to.be.revertedWith("Must send ETH");
    });

    it("should refund excess ETH", async function () {
      const beforeBalance = await ethers.provider.getBalance(investor1.address);
      // Send 1.5x share price (should buy 1 share, refund 0.5x)
      const tx = await fundingPool.connect(investor1).fundInvoice(1, {
        value: sharePrice + sharePrice / 2n,
      });
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      const afterBalance = await ethers.provider.getBalance(investor1.address);

      // Should only have spent 1 share price + gas
      expect(beforeBalance - afterBalance - gasUsed).to.equal(sharePrice);
    });
  });

  describe("OracleGateway", function () {
    const futureDate = () => Math.floor(Date.now() / 1000) + 86400 * 30;

    beforeEach(async function () {
      // Mint and fully fund an invoice
      await invoiceToken.connect(sme).mintInvoice(
        FACE_VALUE, TOTAL_SHARES, DISCOUNT_BPS, futureDate(), METADATA_URI
      );
      const invoice = await invoiceToken.getInvoice(1);
      await fundingPool.connect(investor1).fundInvoice(1, {
        value: invoice.sharePrice * TOTAL_SHARES,
      });
    });

    it("should create oracle request", async function () {
      const tx = await oracleGateway.connect(oracle).requestPaymentConfirmation(1);
      const receipt = await tx.wait();

      expect(receipt.logs.length).to.be.greaterThan(0);
    });

    it("should fulfill payment confirmation", async function () {
      const tx = await oracleGateway.connect(oracle).requestPaymentConfirmation(1);
      const receipt = await tx.wait();

      // Get requestId from event
      const event = receipt.logs.find(
        (log) => log.fragment && log.fragment.name === "OracleRequestCreated"
      );
      const requestId = event.args[0];
      const proofHash = ethers.keccak256(ethers.toUtf8Bytes("payment_proof_123"));

      await oracleGateway.connect(oracle).fulfillPaymentConfirmation(requestId, proofHash);

      expect(await oracleGateway.isPaymentConfirmed(1)).to.be.true;
    });

    it("should reject duplicate fulfillment", async function () {
      const tx = await oracleGateway.connect(oracle).requestPaymentConfirmation(1);
      const receipt = await tx.wait();
      const event = receipt.logs.find(
        (log) => log.fragment && log.fragment.name === "OracleRequestCreated"
      );
      const requestId = event.args[0];
      const proofHash = ethers.keccak256(ethers.toUtf8Bytes("proof"));

      await oracleGateway.connect(oracle).fulfillPaymentConfirmation(requestId, proofHash);
      await expect(
        oracleGateway.connect(oracle).fulfillPaymentConfirmation(requestId, proofHash)
      ).to.be.revertedWith("Request already fulfilled");
    });

    it("should trigger settlement and allow investor claim", async function () {
      // Request and confirm payment
      const tx = await oracleGateway.connect(oracle).requestPaymentConfirmation(1);
      const receipt = await tx.wait();
      const event = receipt.logs.find(
        (log) => log.fragment && log.fragment.name === "OracleRequestCreated"
      );
      const requestId = event.args[0];
      const proofHash = ethers.keccak256(ethers.toUtf8Bytes("proof"));
      await oracleGateway.connect(oracle).fulfillPaymentConfirmation(requestId, proofHash);

      // Trigger settlement with face value ETH
      await oracleGateway.connect(oracle).triggerSettlement(1, { value: FACE_VALUE });

      // Check invoice state is Settled
      const invoice = await invoiceToken.getInvoice(1);
      expect(invoice.state).to.equal(2); // Settled

      // Investor should have claimable balance
      const claimable = await fundingPool.claimableBalance(investor1.address);
      expect(claimable).to.equal(FACE_VALUE);

      // Claim funds
      const beforeBalance = await ethers.provider.getBalance(investor1.address);
      const claimTx = await fundingPool.connect(investor1).claimFunds();
      const claimReceipt = await claimTx.wait();
      const gasUsed = claimReceipt.gasUsed * claimReceipt.gasPrice;
      const afterBalance = await ethers.provider.getBalance(investor1.address);

      expect(afterBalance - beforeBalance + gasUsed).to.equal(FACE_VALUE);
    });

    it("should reject settlement from unauthorized address", async function () {
      await expect(
        oracleGateway.connect(investor1).requestPaymentConfirmation(1)
      ).to.be.reverted;
    });
  });

  describe("End-to-End Flow", function () {
    it("should complete full invoice lifecycle", async function () {
      const futureDate = Math.floor(Date.now() / 1000) + 86400 * 30;

      // 1. SME mints invoice
      await invoiceToken.connect(sme).mintInvoice(
        FACE_VALUE, TOTAL_SHARES, DISCOUNT_BPS, futureDate, METADATA_URI
      );
      let invoice = await invoiceToken.getInvoice(1);
      expect(invoice.state).to.equal(0); // Open

      // 2. Multiple investors fund
      await fundingPool.connect(investor1).fundInvoice(1, { value: invoice.sharePrice * 6n });
      await fundingPool.connect(investor2).fundInvoice(1, { value: invoice.sharePrice * 4n });

      invoice = await invoiceToken.getInvoice(1);
      expect(invoice.state).to.equal(1); // Funded

      // 3. Oracle confirms payment
      const tx = await oracleGateway.connect(oracle).requestPaymentConfirmation(1);
      const receipt = await tx.wait();
      const event = receipt.logs.find(
        (log) => log.fragment && log.fragment.name === "OracleRequestCreated"
      );
      const requestId = event.args[0];
      const proofHash = ethers.keccak256(ethers.toUtf8Bytes("bank_confirmation_abc"));
      await oracleGateway.connect(oracle).fulfillPaymentConfirmation(requestId, proofHash);

      // 4. Settlement
      await oracleGateway.connect(oracle).triggerSettlement(1, { value: FACE_VALUE });

      invoice = await invoiceToken.getInvoice(1);
      expect(invoice.state).to.equal(2); // Settled

      // 5. Investors claim proportional returns
      const claimable1 = await fundingPool.claimableBalance(investor1.address);
      const claimable2 = await fundingPool.claimableBalance(investor2.address);

      // investor1: 6/10 of face value, investor2: 4/10 of face value
      expect(claimable1).to.equal((FACE_VALUE * 6n) / 10n);
      expect(claimable2).to.equal((FACE_VALUE * 4n) / 10n);
    });
  });
});
