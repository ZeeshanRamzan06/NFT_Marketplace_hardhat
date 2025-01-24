const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NFTMarketplace Contract", function () {
  let NFTMinting;
  let NFTMarketplace;
  let nftMinting;
  let nftMarketplace;
  let owner;
  let seller;
  let buyer;
  let anotherUser;

  beforeEach(async function () {
    // Deploy NFTMinting contract
    NFTMinting = await ethers.getContractFactory("NFTMinting");
    NFTMarketplace = await ethers.getContractFactory("NFTMarketplace");

    // Get signers
    [owner, seller, buyer, anotherUser] = await ethers.getSigners();

    // Deploy NFTMinting contract
    nftMinting = await NFTMinting.deploy();
    
    // Deploy NFTMarketplace contract with NFTMinting contract address
    nftMarketplace = await NFTMarketplace.deploy(await nftMinting.getAddress());
  });

  // Helper function to create and mint an NFT
  async function createAndMintNFT(creator, collectionName, nftName, price) {
    // Create collection
    const collectionTx = await nftMinting.connect(creator).createCollection(collectionName);
    const collectionReceipt = await collectionTx.wait();
    const collectionId = collectionReceipt.logs[0].args[0];

    // Mint NFT
    const mintTx = await nftMinting.connect(creator).mintNFT(collectionId, nftName, price);
    const mintReceipt = await mintTx.wait();
    const tokenId = mintReceipt.logs[0].args[0];

    return { collectionId, tokenId };
  }

  describe("Listing NFTs", function () {
    let tokenId;
    let nftPrice;

    beforeEach(async function () {
      nftPrice = ethers.parseEther("0.1");
      const nftDetails = await createAndMintNFT(seller, "Test Collection", "Test NFT", nftPrice);
      tokenId = nftDetails.tokenId;
    });

    it("Should list an NFT successfully", async function () {
      const listingPrice = ethers.parseEther("0.2");
      
      await expect(nftMarketplace.connect(seller).listNFT(tokenId, listingPrice))
        .to.emit(nftMarketplace, "NFTListed")
        .withArgs(tokenId, listingPrice, seller.address);

      const listing = await nftMarketplace.listings(tokenId);
      expect(listing.price).to.equal(listingPrice);
      expect(listing.seller).to.equal(seller.address);
      expect(listing.isActive).to.be.true;
    });

    it("Should prevent listing an NFT by non-owner", async function () {
      const listingPrice = ethers.parseEther("0.2");
      
      await expect(nftMarketplace.connect(buyer).listNFT(tokenId, listingPrice))
        .to.be.revertedWith("Not token owner");
    });

    it("Should prevent listing an NFT below mint price", async function () {
      const lowPrice = ethers.parseEther("0.05");
      
      await expect(nftMarketplace.connect(seller).listNFT(tokenId, lowPrice))
        .to.be.revertedWith("Price cannot be less than mint price");
    });
  });

  describe("Buying NFTs", function () {
    let tokenId;
    let nftPrice;
    let listingPrice;

    beforeEach(async function () {
      nftPrice = ethers.parseEther("0.1");
      const nftDetails = await createAndMintNFT(seller, "Test Collection", "Test NFT", nftPrice);
      tokenId = nftDetails.tokenId;
      
      listingPrice = ethers.parseEther("0.2");
      await nftMarketplace.connect(seller).listNFT(tokenId, listingPrice);
    });

    it("Should buy an NFT successfully", async function () {
      const initialSellerBalance = await ethers.provider.getBalance(seller.address);
      
      await expect(nftMarketplace.connect(buyer).buyNFT(tokenId, { value: listingPrice }))
        .to.emit(nftMarketplace, "NFTSold")
        .withArgs(tokenId, listingPrice, buyer.address);

      // Verify NFT ownership transfer
      const nftDetails = await nftMinting.nfts(tokenId);
      expect(nftDetails.owner).to.equal(buyer.address);

      // Verify seller received correct payment
      const finalSellerBalance = await ethers.provider.getBalance(seller.address);
      expect(finalSellerBalance).to.be.gt(initialSellerBalance);
    });

    it("Should prevent buying an unlisted NFT", async function () {
      // Cancel the listing first
      await nftMarketplace.connect(seller).cancelListing(tokenId);

      await expect(nftMarketplace.connect(buyer).buyNFT(tokenId, { value: listingPrice }))
        .to.be.revertedWith("NFT not listed for sale");
    });
  });

  describe("Auction Functionality", function () {
    let tokenId;
    let nftPrice;
    let startingBid;

    beforeEach(async function () {
      nftPrice = ethers.parseEther("0.1");
      const nftDetails = await createAndMintNFT(seller, "Test Collection", "Test NFT", nftPrice);
      tokenId = nftDetails.tokenId;
      
      startingBid = ethers.parseEther("0.2");
    });

    it("Should create an auction successfully", async function () {
      const auctionDuration = 24 * 60 * 60; // 24 hours
      
      await expect(nftMarketplace.connect(seller).createAuction(tokenId, startingBid, auctionDuration))
        .to.emit(nftMarketplace, "AuctionCreated")
        .withArgs(tokenId, startingBid, seller.address);

      const auctionStatus = await nftMarketplace.checkAuctionStatus(tokenId);
      expect(auctionStatus.active).to.be.true;
      expect(auctionStatus.highestBid).to.equal(startingBid);
    });

    it("Should place a bid successfully", async function () {
      const auctionDuration = 24 * 60 * 60; // 24 hours
      await nftMarketplace.connect(seller).createAuction(tokenId, startingBid, auctionDuration);

      const higherBid = ethers.parseEther("0.3");
      
      await expect(nftMarketplace.connect(buyer).placeBid(tokenId, { value: higherBid }))
        .to.emit(nftMarketplace, "BidPlaced")
        .withArgs(tokenId, higherBid, buyer.address);

      const auctionStatus = await nftMarketplace.checkAuctionStatus(tokenId);
      expect(auctionStatus.highestBid).to.equal(higherBid);
      expect(auctionStatus.highestBidder).to.equal(buyer.address);
    });

    it("Should finalize auction successfully", async function () {
      const auctionDuration = 1; // Very short duration for testing
      await nftMarketplace.connect(seller).createAuction(tokenId, startingBid, auctionDuration);

      const higherBid = ethers.parseEther("0.3");
      await nftMarketplace.connect(buyer).placeBid(tokenId, { value: higherBid });

      // Simulate time passing
      await ethers.provider.send("evm_increaseTime", [2]);
      await ethers.provider.send("evm_mine");

      // Ensure the finalization emits the correct event
  const finalizeTransaction = await nftMarketplace.connect(seller).finalizeAuction(tokenId);
    await expect(finalizeTransaction)
    .to.emit(nftMarketplace, "NFTSold")
    .withArgs(tokenId, higherBid, buyer.address);

      // Verify NFT ownership transfer
      const nftDetails = await nftMinting.nfts(tokenId);
      expect(nftDetails.owner).to.equal(buyer.address);
    });
  });

  describe("Ownership and Verification", function () {
    let tokenId;

    beforeEach(async function () {
      const nftPrice = ethers.parseEther("0.1");
      const nftDetails = await createAndMintNFT(seller, "Test Collection", "Test NFT", nftPrice);
      tokenId = nftDetails.tokenId;
    });

    it("Should verify NFT ownership correctly", async function () {
      const isOwner = await nftMarketplace.verifyNFTOwnership(tokenId, seller.address);
      expect(isOwner).to.be.true;

      const isNotOwner = await nftMarketplace.verifyNFTOwnership(tokenId, buyer.address);
      expect(isNotOwner).to.be.false;
    });
  });
});