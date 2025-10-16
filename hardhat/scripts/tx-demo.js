// Send a demo payment to the deployed PaymentRouter on Base Sepolia
// Usage:
//   npx hardhat run scripts/tx-demo.js --network baseSepolia
// Env required in hardhat/.env (or process env):
//   PRIVATE_KEY=0x...
//   ROUTER_ADDRESS=0x...
//   MERCHANT_ADDRESS=0x...
//   INVOICE_ID=0x... (32-byte hex, or will be derived)

const { ethers } = require("hardhat");

function toInvoiceId(str) {
  // derive a bytes32 from a string
  return ethers.id(str);
}

async function main() {
  const routerAddr = process.env.ROUTER_ADDRESS || process.env.EVM_ROUTER_ADDRESS;
  const merchant = process.env.MERCHANT_ADDRESS || process.env.EVM_MERCHANT_ADDRESS;
  let invoiceId = process.env.INVOICE_ID;
  if (!routerAddr || !merchant) {
    throw new Error("ROUTER_ADDRESS and MERCHANT_ADDRESS must be set in env");
  }

  const [signer] = await ethers.getSigners();
  console.log(`Demo payer: ${signer.address}`);
  console.log(`Router: ${routerAddr}`);
  console.log(`Merchant: ${merchant}`);

  const Router = await ethers.getContractFactory("PaymentRouter");
  const router = Router.attach(routerAddr);

  if (!invoiceId) {
    invoiceId = toInvoiceId(`demo-${Date.now()}`);
    console.log(`Derived invoiceId: ${invoiceId}`);
  }

  // Send a small ETH payment (adjust as needed)
  const amountEth = "0.0001";
  const tx = await router.payETH(merchant, invoiceId, { value: ethers.parseEther(amountEth) });
  console.log(`Submitted tx: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`Mined in block ${receipt.blockNumber}`);
  console.log("Proof:");
  console.log(`  Base Sepolia tx: https://sepolia.basescan.org/tx/${tx.hash}`);
  console.log("Next: include this link in your submission and backend logs.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});