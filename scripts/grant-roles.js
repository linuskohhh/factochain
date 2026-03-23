const hre = require("hardhat");
require("dotenv").config();

async function main() {
  // Use the deployer (Admin) to grant the role
  const [deployer] = await hre.ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  console.log("Using Admin account:", deployerAddress);

  // Get the InvoiceToken contract using the address from your .env
  const invoiceTokenAddress = process.env.INVOICE_TOKEN_ADDRESS;
  if (!invoiceTokenAddress) {
    throw new Error("INVOICE_TOKEN_ADDRESS is missing from your .env file!");
  }

  const invoiceToken = await hre.ethers.getContractAt("InvoiceToken", invoiceTokenAddress);

  // Define the role and the SME address
  const MINTER_ROLE = await invoiceToken.MINTER_ROLE();
  
  // PASTE YOUR SME WALLET ADDRESS HERE
  const smeAddress = "0xed9d42c9F710e544EeFEF05a6B1efA0fa482C686"; 

  console.log("Granting MINTER_ROLE to SME...");
  const tx = await invoiceToken.grantRole(MINTER_ROLE, smeAddress);
  
  // Wait for the blockchain to confirm
  await tx.wait();
  
  console.log("Successfully granted MINTER_ROLE to SME:", smeAddress);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });