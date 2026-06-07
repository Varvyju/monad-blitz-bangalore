const hre = require("hardhat");

async function main() {
  console.log("🚀 Deploying GigProof to Monad Testnet...");

  const [deployer] = await hre.ethers.getSigners();
  console.log("📍 Deploying from:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("💰 Balance:", hre.ethers.formatEther(balance), "MON");

  const GigProof = await hre.ethers.getContractFactory("GigProof");
  const gigProof = await GigProof.deploy();
  await gigProof.waitForDeployment();

  const address = await gigProof.getAddress();

  console.log("✅ GigProof deployed to:", address);
  console.log("🔍 Monadscan:", `https://testnet.monadscan.com/address/${address}`);
  console.log("\n📋 COPY THIS INTO frontend/.env.local:");
  console.log(`NEXT_PUBLIC_CONTRACT_ADDRESS=${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});