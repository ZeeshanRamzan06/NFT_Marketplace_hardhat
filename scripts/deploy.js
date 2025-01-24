const hre = require("hardhat");

async function main() {
  // Deploy NFTMinting contract
  console.log("Deploying NFTMinting contract...");
  const NFTMinting = await hre.ethers.getContractFactory("NFTMinting");
  const nftMinting = await NFTMinting.deploy();
  await nftMinting.waitForDeployment();
  console.log("NFTMinting deployed at:", await nftMinting.getAddress());

  // Deploy NFTMarketplace contract
  console.log("Deploying NFTMarketplace contract...");
  const NFTMarketplace = await hre.ethers.getContractFactory("NFTMarketplace");
  const nftMarketplace = await NFTMarketplace.deploy(await nftMinting.getAddress());
  await nftMarketplace.waitForDeployment();
  console.log("NFTMarketplace deployed at:", await nftMarketplace.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });