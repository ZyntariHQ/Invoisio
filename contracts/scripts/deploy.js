import hre from "hardhat";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  console.log("🚀 Starting deployment...");

  // Connect to Sepolia network
  const connection = await hre.network.connect({ network: "sepolia" });

  // Get Viem instance
  const { viem } = connection;

  // Get deployer wallet
  const [walletClient] = await viem.getWalletClients();
  const deployerAddress = walletClient.account.address;
  console.log("👤 Deployer address:", deployerAddress);

  // Owner (can be different)
  const OWNER_ADDRESS = process.env.INITIAL_OWNER || deployerAddress;
  console.log("👑 Setting contract owner to:", OWNER_ADDRESS);

  // Deploy contract
  const deployment = await viem.deployContract("PaymentRouter", [OWNER_ADDRESS]);

  // Depending on Viem version, either `deployment.contractAddress` or `deployment.address`
  // Often you can read the actual address from the contract object returned:
  const contractAddress = deployment.address || deployment.contractAddress;

  console.log("✅ PaymentRouter deployed to:", contractAddress);
  console.log("👑 Owner set to:", OWNER_ADDRESS);
}

main().catch((err) => {
  console.error("❌ Deployment failed:", err);
  process.exit(1);
});


