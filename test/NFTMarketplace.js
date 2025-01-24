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

  beforeEach(async function () {
    // Deploy NFT Minting Contract
    NFTMinting = await ethers.getContractFactory("NFTMinting");
    nftMinting = await NFTMinting.deploy();

    // Deploy NFT Marketplace Contract
    NFTMarketplace = await ethers.getContractFactory("NFTMarketplace");
    nftMarketplace = await NFTMarketplace.deploy(nftMinting.target);

    // Get signers
    [owner, seller, buyer] = await ethers.getSigners();

    // Create a collection and mint an NFT for testing
    const collectionTx = await nftMinting.createCollection("Test Collection");
    const collectionReceipt = await collectionTx.wait();
    const collectionId = collectionReceipt.logs[0].args[0];

    await nftMinting.mintNFT(collectionId, "Test NFT", ethers.parseEther("0.1"));
  });

  // Listing NFT Tests
  describe("NFT Listing", function () {
    it("Should list an NFT for sale", async function () {
      const tokenId = 1; // First minted token
      const listPrice = ethers.parseEther("0.2");

      // List the NFT
      await nftMinting.approve(nftMarketplace.target, tokenId);
      const tx = await nftMarketplace.connect(seller).listNFT(tokenId, listPrice);
      const receipt = await tx.wait();

      // Check NFTListed event
      const event = receipt.logs[0];
      expect(event.fragment.name).to.equal("NFTListed");

      // Verify listing details
      const listing = await nftMarketplace.listings(tokenId);
      expect(listing.price).to.equal(listPrice);
      expect(listing.seller).to.equal(seller.address);
      expect(listing.isActive).to.be.true;
    });

    it("Should prevent listing NFT below mint price", async function () {
      const tokenId = 1;
      const lowPrice = ethers.parseEther("0.05");

      await expect(nftMarketplace.connect(seller).listNFT(tokenId, lowPrice))
        .to.be.revertedWith("Price cannot be less than mint price");
    });

    it("Should allow canceling a listing", async function () {
      const tokenId = 1;
      const listPrice = ethers.parseEther("0.2");

      // List the NFT
      await nftMarketplace.connect(seller).listNFT(tokenId, listPrice);

      // Cancel listing
      const tx = await nftMarketplace.connect(seller).cancelListing(tokenId);
      const receipt = await tx.wait();

      // Check NFTListingDeleted event
      const event = receipt.logs[0];
      expect(event.fragment.name).to.equal("NFTListingDeleted");

      // Verify listing is deleted
      const listing = await nftMarketplace.listings(tokenId);
      expect(listing.price).to.equal(0);
    });
  });

  // Buying NFT Tests
  describe("NFT Buying", function () {
    it("Should allow buying a listed NFT", async function () {
      const tokenId = 1;
      const listPrice = ethers.parseEther("0.2");

      // List the NFT
      await nftMarketplace.connect(seller).listNFT(tokenId, listPrice);

      // Buy the NFT
      const tx = await nftMarketplace.connect(buyer).buyNFT(tokenId, { value: listPrice });
      const receipt = await tx.wait();

      // Check NFTSold event
      const event = receipt.logs[0];
      expect(event.fragment.name).to.equal("NFTSold");

      // Verify new ownership
      const nftDetails = await nftMinting.getNFTsByOwner(buyer.address);
      expect(nftDetails[0].tokenId).to.equal(tokenId);
    });

    it("Should prevent buying an unlisted NFT", async function () {
      const tokenId = 1;
      await expect(nftMarketplace.connect(buyer).buyNFT(tokenId, { value: ethers.parseEther("0.2") }))
        .to.be.revertedWith("NFT not listed for sale");
    });
  });

  // Auction Tests
  describe("Auction Functionality", function () {
    it("Should create an auction", async function () {
      const tokenId = 1;
      const startingBid = ethers.parseEther("0.2");
      const duration = 86400; // 24 hours

      const tx = await nftMarketplace.connect(seller).createAuction(tokenId, startingBid, duration);
      const receipt = await tx.wait();

      // Check AuctionCreated event
      const event = receipt.logs[0];
      expect(event.fragment.name).to.equal("AuctionCreated");

      // Verify auction details
      const auction = await nftMarketplace.auctions(tokenId);
      expect(auction.highestBid).to.equal(startingBid);
      expect(auction.creator).to.equal(seller.address);
    });

    it("Should place a bid in an auction", async function () {
      const tokenId = 1;
      const startingBid = ethers.parseEther("0.2");
      const duration = 86400;

      // Create auction
      await nftMarketplace.connect(seller).createAuction(tokenId, startingBid, duration);

      // Place a higher bid
      const bidAmount = ethers.parseEther("0.3");
      const tx = await nftMarketplace.connect(buyer).placeBid(tokenId, { value: bidAmount });
      const receipt = await tx.wait();

      // Check BidPlaced event
      const event = receipt.logs[0];
      expect(event.fragment.name).to.equal("BidPlaced");

      // Verify bid details
      const auction = await nftMarketplace.auctions(tokenId);
      expect(auction.highestBid).to.equal(bidAmount);
      expect(auction.highestBidder).to.equal(buyer.address);
    });

    it("Should finalize auction after end time", async function () {
      const tokenId = 1;
      const startingBid = ethers.parseEther("0.2");
      const duration = 1; // Very short duration for testing

      // Create auction
      await nftMarketplace.connect(seller).createAuction(tokenId, startingBid, duration);

      // Place a bid
      const bidAmount = ethers.parseEther("0.3");
      await nftMarketplace.connect(buyer).placeBid(tokenId, { value: bidAmount });

      // Simulate time passing
      await ethers.provider.send("evm_increaseTime", [2]);
      await ethers.provider.send("evm_mine");

      // Finalize auction
      const tx = await nftMarketplace.connect(seller).finalizeAuction(tokenId);
      const receipt = await tx.wait();

      // Check NFTSold event
      const event = receipt.logs[0];
      expect(event.fragment.name).to.equal("NFTSold");

      // Verify new ownership
      const nftDetails = await nftMinting.getNFTsByOwner(buyer.address);
      expect(nftDetails[0].tokenId).to.equal(tokenId);
    });
  });

  // Ownership Verification
  describe("NFT Ownership Verification", function () {
    it("Should verify NFT ownership correctly", async function () {
      const tokenId = 1;
      const isOwner = await nftMarketplace.verifyNFTOwnership(tokenId, seller.address);
      expect(isOwner).to.be.true;
    });
  });
});