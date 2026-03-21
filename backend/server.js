require("dotenv").config({ path: "../.env" });
const express = require("express");
const cors = require("cors");

const ipfsRoutes = require("./routes/ipfs");
const oracleRoutes = require("./routes/oracle");

const app = express();
const PORT = process.env.BACKEND_PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/ipfs", ipfsRoutes);
app.use("/api/oracle", oracleRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`FactoChain Backend running on port ${PORT}`);
  console.log(`IPFS endpoints:  POST /api/ipfs/upload, POST /api/ipfs/metadata`);
  console.log(`Oracle endpoints: POST /api/oracle/confirm-payment, POST /api/oracle/trigger-settlement`);
});
