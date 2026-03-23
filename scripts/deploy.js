const hre = require("hardhat");
const fs = require("fs");

async function main() {
  // 1. Get the signer
  const [deployer] = await hre.ethers.getSigners();
  
  // FIXED: Using getAddress() to avoid the "undefined" error
  const deployerAddress = await deployer.getAddress(); 
  console.log("Deploying contracts with account:", deployerAddress);
  
  const balance = await hre.ethers.provider.getBalance(deployerAddress);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH");

  // 2. Deploy InvoiceToken (ERC-1155)
  console.log("\n--- Deploying InvoiceToken ---");
  const InvoiceToken = await hre.ethers.getContractFactory("InvoiceToken");
  const invoiceToken = await InvoiceToken.deploy();
  await invoiceToken.waitForDeployment();
  const invoiceTokenAddress = await invoiceToken.getAddress();
  console.log("InvoiceToken deployed to:", invoiceTokenAddress);

  // 3. Deploy FundingPool
  console.log("\n--- Deploying FundingPool ---");
  const FundingPool = await hre.ethers.getContractFactory("FundingPool");
  const fundingPool = await FundingPool.deploy(invoiceTokenAddress);
  await fundingPool.waitForDeployment();
  const fundingPoolAddress = await fundingPool.getAddress();
  console.log("FundingPool deployed to:", fundingPoolAddress);

  // 4. Deploy OracleGateway
  console.log("\n--- Deploying OracleGateway ---");
  const OracleGateway = await hre.ethers.getContractFactory("OracleGateway");
  const oracleGateway = await OracleGateway.deploy(fundingPoolAddress);
  await oracleGateway.waitForDeployment();
  const oracleGatewayAddress = await oracleGateway.getAddress();
  console.log("OracleGateway deployed to:", oracleGatewayAddress);

  // 5. Configure roles
  console.log("\n--- Configuring Roles ---");
  const ADMIN_ROLE = await invoiceToken.ADMIN_ROLE();
  const tx1 = await invoiceToken.grantRole(ADMIN_ROLE, fundingPoolAddress);
  await tx1.wait(); 
  console.log("Granted ADMIN_ROLE to FundingPool on InvoiceToken");

  const ORACLE_ROLE = await fundingPool.ORACLE_ROLE();
  const tx2 = await fundingPool.grantRole(ORACLE_ROLE, oracleGatewayAddress);
  await tx2.wait(); 
  console.log("Granted ORACLE_ROLE to OracleGateway on FundingPool");

  // Summary
  console.log("\n========== DEPLOYMENT SUMMARY ==========");
  console.log("InvoiceToken:", invoiceTokenAddress);
  console.log("FundingPool: ", fundingPoolAddress);
  console.log("OracleGateway:", oracleGatewayAddress);
  console.log("=========================================");

  // Save info for backend
  const deploymentInfo = {
    network: hre.network.name,
    deployer: deployerAddress,
    timestamp: new Date().toISOString(),
    contracts: {
      InvoiceToken: invoiceTokenAddress,
      FundingPool: fundingPoolAddress,
      OracleGateway: oracleGatewayAddress,
    },
  };

  fs.writeFileSync("./deployment.json", JSON.stringify(deploymentInfo, null, 2));
  console.log("\nDeployment info saved to deployment.json");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });