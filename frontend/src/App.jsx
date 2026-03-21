import React, { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import {
  connectWallet, getContracts, fetchAllInvoices, uploadToIPFS, pinMetadata,
  INVOICE_STATES, STATE_COLORS
} from "./utils/contracts.js";

/* ── Styles ── */
const styles = {
  container: { maxWidth: 1200, margin: "0 auto", padding: "20px 24px" },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "16px 24px", background: "#1e293b", borderBottom: "1px solid #334155",
    marginBottom: 24,
  },
  logo: { fontSize: 24, fontWeight: 700, color: "#38bdf8" },
  btn: {
    padding: "10px 20px", borderRadius: 8, border: "none", cursor: "pointer",
    fontWeight: 600, fontSize: 14, transition: "all 0.2s",
  },
  btnPrimary: { background: "#3b82f6", color: "#fff" },
  btnSuccess: { background: "#22c55e", color: "#fff" },
  btnSecondary: { background: "#475569", color: "#e2e8f0" },
  card: {
    background: "#1e293b", borderRadius: 12, padding: 24,
    border: "1px solid #334155", marginBottom: 16,
  },
  input: {
    width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #475569",
    background: "#0f172a", color: "#e2e8f0", fontSize: 14, marginTop: 6,
  },
  label: { display: "block", marginBottom: 16, color: "#94a3b8", fontSize: 13, fontWeight: 500 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 },
  tabs: { display: "flex", gap: 8, marginBottom: 24 },
  tab: { padding: "10px 20px", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 14, border: "none" },
  badge: { display: "inline-block", padding: "4px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600 },
  stat: { textAlign: "center", padding: 16 },
  statValue: { fontSize: 28, fontWeight: 700, color: "#38bdf8" },
  statLabel: { fontSize: 12, color: "#94a3b8", marginTop: 4 },
};

/* ── App ── */
export default function App() {
  const [wallet, setWallet] = useState(null);
  const [contracts, setContracts] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [activeTab, setActiveTab] = useState("marketplace");
  const [loading, setLoading] = useState(false);
  const [txStatus, setTxStatus] = useState("");

  // Connect wallet
  const handleConnect = async () => {
    try {
      const w = await connectWallet();
      setWallet(w);
      const c = getContracts(w.signer);
      setContracts(c);
      setTxStatus(`Connected: ${w.address.slice(0, 6)}...${w.address.slice(-4)}`);
    } catch (err) {
      setTxStatus(`Error: ${err.message}`);
    }
  };

  // Refresh invoices
  const refreshInvoices = useCallback(async () => {
    if (!contracts) return;
    try {
      const data = await fetchAllInvoices(contracts);
      setInvoices(data);
    } catch (err) {
      console.error("Failed to fetch invoices:", err);
    }
  }, [contracts]);

  useEffect(() => { refreshInvoices(); }, [refreshInvoices]);

  return (
    <div>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.logo}>⛓ FactoChain</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {txStatus && <span style={{ fontSize: 13, color: "#94a3b8" }}>{txStatus}</span>}
          {wallet ? (
            <span style={{ ...styles.btn, ...styles.btnSuccess, cursor: "default" }}>
              {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
            </span>
          ) : (
            <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={handleConnect}>
              Connect Wallet
            </button>
          )}
        </div>
      </div>

      <div style={styles.container}>
        {/* Stats */}
        <div style={{ ...styles.card, display: "flex", justifyContent: "space-around", marginBottom: 24 }}>
          <div style={styles.stat}>
            <div style={styles.statValue}>{invoices.length}</div>
            <div style={styles.statLabel}>Total Invoices</div>
          </div>
          <div style={styles.stat}>
            <div style={styles.statValue}>{invoices.filter(i => i.state === 0).length}</div>
            <div style={styles.statLabel}>Open for Funding</div>
          </div>
          <div style={styles.stat}>
            <div style={styles.statValue}>{invoices.filter(i => i.state === 2).length}</div>
            <div style={styles.statLabel}>Settled</div>
          </div>
          <div style={styles.stat}>
            <div style={styles.statValue}>
              {ethers.formatEther(invoices.reduce((sum, i) => sum + i.faceValue, 0n))} ETH
            </div>
            <div style={styles.statLabel}>Total Value Tokenized</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={styles.tabs}>
          {["marketplace", "create", "portfolio"].map(tab => (
            <button
              key={tab}
              style={{
                ...styles.tab,
                background: activeTab === tab ? "#3b82f6" : "#334155",
                color: activeTab === tab ? "#fff" : "#94a3b8",
              }}
              onClick={() => setActiveTab(tab)}
            >
              {tab === "marketplace" ? "🏪 Marketplace" : tab === "create" ? "📄 Create Invoice" : "💼 My Portfolio"}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === "marketplace" && (
          <Marketplace invoices={invoices} contracts={contracts} wallet={wallet}
            onRefresh={refreshInvoices} setTxStatus={setTxStatus} />
        )}
        {activeTab === "create" && (
          <CreateInvoice contracts={contracts} wallet={wallet}
            onRefresh={refreshInvoices} setTxStatus={setTxStatus} />
        )}
        {activeTab === "portfolio" && (
          <Portfolio invoices={invoices} contracts={contracts} wallet={wallet}
            onRefresh={refreshInvoices} setTxStatus={setTxStatus} />
        )}
      </div>
    </div>
  );
}

/* ── Marketplace ── */
function Marketplace({ invoices, contracts, wallet, onRefresh, setTxStatus }) {
  const [fundAmounts, setFundAmounts] = useState({});

  const handleFund = async (invoice) => {
    if (!contracts || !wallet) return setTxStatus("Connect wallet first");
    const shares = parseInt(fundAmounts[invoice.tokenId] || "1");
    if (shares <= 0) return setTxStatus("Enter valid share count");

    try {
      setTxStatus("Submitting funding transaction...");
      const value = invoice.sharePrice * BigInt(shares);
      const tx = await contracts.fundingPool.fundInvoice(invoice.tokenId, { value });
      setTxStatus("Transaction submitted, waiting for confirmation...");
      await tx.wait();
      setTxStatus(`Successfully funded ${shares} share(s)!`);
      onRefresh();
    } catch (err) {
      setTxStatus(`Error: ${err.reason || err.message}`);
    }
  };

  const openInvoices = invoices.filter(i => i.state === 0);

  return (
    <div>
      <h2 style={{ marginBottom: 16, fontSize: 20 }}>Available Invoices</h2>
      {openInvoices.length === 0 ? (
        <div style={styles.card}><p style={{ color: "#94a3b8" }}>No invoices available for funding.</p></div>
      ) : (
        <div style={styles.grid}>
          {openInvoices.map(inv => {
            const funded = inv.targetAmount > 0n ? Number((inv.totalFunded * 100n) / inv.targetAmount) : 0;
            const sharesRemaining = inv.totalShares - Number(inv.totalFunded / inv.sharePrice);

            return (
              <div key={inv.tokenId} style={styles.card}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                  <span style={{ fontWeight: 700, fontSize: 16 }}>Invoice #{inv.tokenId}</span>
                  <span style={{ ...styles.badge, background: STATE_COLORS[inv.state] + "22", color: STATE_COLORS[inv.state] }}>
                    {INVOICE_STATES[inv.state]}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 12 }}>
                  <div>Face Value: <strong style={{ color: "#e2e8f0" }}>{ethers.formatEther(inv.faceValue)} ETH</strong></div>
                  <div>Share Price: <strong style={{ color: "#e2e8f0" }}>{ethers.formatEther(inv.sharePrice)} ETH</strong></div>
                  <div>Shares: {inv.totalShares} total, {sharesRemaining} remaining</div>
                  <div>Due: {inv.dueDate.toLocaleDateString()}</div>
                  <div>Investors: {inv.investorCount}</div>
                </div>
                {/* Progress bar */}
                <div style={{ background: "#0f172a", borderRadius: 6, height: 8, marginBottom: 12 }}>
                  <div style={{ background: "#3b82f6", borderRadius: 6, height: 8, width: `${funded}%`, transition: "width 0.3s" }} />
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12 }}>{funded}% funded</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="number" min="1" max={sharesRemaining} placeholder="Shares"
                    value={fundAmounts[inv.tokenId] || ""}
                    onChange={e => setFundAmounts({ ...fundAmounts, [inv.tokenId]: e.target.value })}
                    style={{ ...styles.input, width: 100, marginTop: 0 }}
                  />
                  <button style={{ ...styles.btn, ...styles.btnPrimary, flex: 1 }} onClick={() => handleFund(inv)}>
                    Fund
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Create Invoice ── */
function CreateInvoice({ contracts, wallet, onRefresh, setTxStatus }) {
  const [form, setForm] = useState({
    faceValue: "", totalShares: "10", discountBps: "200", dueDate: "", description: "",
  });
  const [file, setFile] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!contracts || !wallet) return setTxStatus("Connect wallet first");

    try {
      setTxStatus("Uploading document to IPFS...");

      // Upload file to IPFS
      let documentCID = "";
      if (file) {
        const uploadResult = await uploadToIPFS(file);
        documentCID = uploadResult.cid;
      }

      // Create metadata JSON and pin to IPFS
      const metadata = {
        name: `FactoChain Invoice`,
        description: form.description || "Tokenized invoice",
        faceValue: form.faceValue,
        totalShares: form.totalShares,
        discountBps: form.discountBps,
        dueDate: form.dueDate,
        issuer: wallet.address,
        documentCID,
        createdAt: new Date().toISOString(),
      };

      const metaResult = await pinMetadata(metadata);
      const metadataURI = `ipfs://${metaResult.cid}`;

      setTxStatus("Submitting mint transaction...");

      const faceValueWei = ethers.parseEther(form.faceValue);
      const dueTimestamp = Math.floor(new Date(form.dueDate).getTime() / 1000);

      const tx = await contracts.invoiceToken.mintInvoice(
        faceValueWei,
        BigInt(form.totalShares),
        BigInt(form.discountBps),
        dueTimestamp,
        metadataURI
      );

      setTxStatus("Transaction submitted, waiting for confirmation...");
      await tx.wait();
      setTxStatus("Invoice created and tokenized successfully!");
      onRefresh();
      setForm({ faceValue: "", totalShares: "10", discountBps: "200", dueDate: "", description: "" });
      setFile(null);
    } catch (err) {
      setTxStatus(`Error: ${err.reason || err.message}`);
    }
  };

  return (
    <div style={{ ...styles.card, maxWidth: 600 }}>
      <h2 style={{ marginBottom: 20, fontSize: 20 }}>Create Invoice Token</h2>
      <form onSubmit={handleSubmit}>
        <label style={styles.label}>
          Face Value (ETH)
          <input style={styles.input} type="number" step="0.01" required
            value={form.faceValue} onChange={e => setForm({ ...form, faceValue: e.target.value })} />
        </label>
        <label style={styles.label}>
          Number of Shares
          <input style={styles.input} type="number" min="1" required
            value={form.totalShares} onChange={e => setForm({ ...form, totalShares: e.target.value })} />
        </label>
        <label style={styles.label}>
          Discount Rate (basis points, e.g., 200 = 2%)
          <input style={styles.input} type="number" min="0" max="5000" required
            value={form.discountBps} onChange={e => setForm({ ...form, discountBps: e.target.value })} />
        </label>
        <label style={styles.label}>
          Due Date
          <input style={styles.input} type="date" required
            value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} />
        </label>
        <label style={styles.label}>
          Description
          <input style={styles.input} type="text" placeholder="Brief description of the invoice"
            value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
        </label>
        <label style={styles.label}>
          Invoice Document (PDF)
          <input style={{ ...styles.input, padding: 8 }} type="file" accept=".pdf,.png,.jpg"
            onChange={e => setFile(e.target.files[0])} />
        </label>
        <button type="submit" style={{ ...styles.btn, ...styles.btnPrimary, width: "100%", marginTop: 8 }}>
          Mint Invoice Token
        </button>
      </form>
    </div>
  );
}

/* ── Portfolio ── */
function Portfolio({ invoices, contracts, wallet, onRefresh, setTxStatus }) {
  const [claimable, setClaimable] = useState(0n);

  useEffect(() => {
    if (!contracts || !wallet) return;
    contracts.fundingPool.claimableBalance(wallet.address).then(setClaimable).catch(console.error);
  }, [contracts, wallet, invoices]);

  const handleClaim = async () => {
    if (!contracts) return;
    try {
      setTxStatus("Claiming funds...");
      const tx = await contracts.fundingPool.claimFunds();
      await tx.wait();
      setTxStatus("Funds claimed successfully!");
      onRefresh();
    } catch (err) {
      setTxStatus(`Error: ${err.reason || err.message}`);
    }
  };

  const myIssued = invoices.filter(i => wallet && i.issuer.toLowerCase() === wallet.address.toLowerCase());

  return (
    <div>
      {/* Claimable */}
      <div style={{ ...styles.card, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 13, color: "#94a3b8" }}>Claimable Balance</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#22c55e" }}>
            {ethers.formatEther(claimable)} ETH
          </div>
        </div>
        <button
          style={{ ...styles.btn, ...(claimable > 0n ? styles.btnSuccess : styles.btnSecondary) }}
          onClick={handleClaim} disabled={claimable === 0n}
        >
          Claim Funds
        </button>
      </div>

      {/* My Issued Invoices */}
      <h3 style={{ marginTop: 24, marginBottom: 12, fontSize: 18 }}>My Issued Invoices</h3>
      {myIssued.length === 0 ? (
        <div style={styles.card}><p style={{ color: "#94a3b8" }}>No invoices issued from this address.</p></div>
      ) : (
        <div style={styles.grid}>
          {myIssued.map(inv => (
            <div key={inv.tokenId} style={styles.card}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontWeight: 700 }}>Invoice #{inv.tokenId}</span>
                <span style={{ ...styles.badge, background: STATE_COLORS[inv.state] + "22", color: STATE_COLORS[inv.state] }}>
                  {INVOICE_STATES[inv.state]}
                </span>
              </div>
              <div style={{ fontSize: 13, color: "#94a3b8" }}>
                <div>Face Value: {ethers.formatEther(inv.faceValue)} ETH</div>
                <div>Shares: {inv.totalShares}</div>
                <div>Due: {inv.dueDate.toLocaleDateString()}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
