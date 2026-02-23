const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer: ${deployer.address}`);

  const Router = await ethers.getContractFactory("PaymentRouter");
  const router = await Router.deploy();
  await router.waitForDeployment();
  const address = await router.getAddress();

  console.log(`PaymentRouter deployed at: ${address}`);
  console.log("Next: set backend .env EVM_ROUTER_ADDRESS=", address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});