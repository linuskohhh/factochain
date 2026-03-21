const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());

  // 1. Deploy InvoiceToken (ERC-1155)
  console.log("\n--- Deploying InvoiceToken ---");
  const InvoiceToken = await hre.ethers.getContractFactory("InvoiceToken");
  const invoiceToken = await InvoiceToken.deploy();
  await invoiceToken.waitForDeployment();
  const invoiceTokenAddress = await invoiceToken.getAddress();
  console.log("InvoiceToken deployed to:", invoiceTokenAddress);

  // 2. Deploy FundingPool
  console.log("\n--- Deploying FundingPool ---");
  const FundingPool = await hre.ethers.getContractFactory("FundingPool");
  const fundingPool = await FundingPool.deploy(invoiceTokenAddress);
  await fundingPool.waitForDeployment();
  const fundingPoolAddress = await fundingPool.getAddress();
  console.log("FundingPool deployed to:", fundingPoolAddress);

  // 3. Deploy OracleGateway
  console.log("\n--- Deploying OracleGateway ---");
  const OracleGateway = await hre.ethers.getContractFactory("OracleGateway");
  const oracleGateway = await OracleGateway.deploy(fundingPoolAddress);
  await oracleGateway.waitForDeployment();
  const oracleGatewayAddress = await oracleGateway.getAddress();
  console.log("OracleGateway deployed to:", oracleGatewayAddress);

  // 4. Configure roles
  console.log("\n--- Configuring Roles ---");

  // Grant ADMIN_ROLE to FundingPool on InvoiceToken (so it can update states)
  const ADMIN_ROLE = await invoiceToken.ADMIN_ROLE();
  await invoiceToken.grantRole(ADMIN_ROLE, fundingPoolAddress);
  console.log("Granted ADMIN_ROLE to FundingPool on InvoiceToken");

  // Grant ORACLE_ROLE to OracleGateway on FundingPool (so it can trigger settlement)
  const ORACLE_ROLE = await fundingPool.ORACLE_ROLE();
  await fundingPool.grantRole(ORACLE_ROLE, oracleGatewayAddress);
  console.log("Granted ORACLE_ROLE to OracleGateway on FundingPool");

  // Summary
  console.log("\n========== DEPLOYMENT SUMMARY ==========");
  console.log("InvoiceToken (ERC-1155):", invoiceTokenAddress);
  console.log("FundingPool:           ", fundingPoolAddress);
  console.log("OracleGateway:         ", oracleGatewayAddress);
  console.log("=========================================");

  // Save deployment addresses for frontend/backend
  const fs = require("fs");
  const deploymentInfo = {
    network: hre.network.name,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      InvoiceToken: invoiceTokenAddress,
      FundingPool: fundingPoolAddress,
      OracleGateway: oracleGatewayAddress,
    },
  };

  fs.writeFileSync(
    "./deployment.json",
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log("\nDeployment info saved to deployment.json");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
