const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NFTMinting Contract", function () {
  let NFTMinting;
  let nftMinting;
  let owner;
  let addr1;
  let addr2;

  beforeEach(async function () {
    // Deploy the contract before each test
    NFTMinting = await ethers.getContractFactory("NFTMinting");
    [owner, addr1, addr2] = await ethers.getSigners();
    nftMinting = await NFTMinting.deploy();
  });

  // Test Collection Creation
  describe("Collection Creation", function () {
    it("Should create a collection successfully", async function () {
      const collectionName = "Test Collection";
      const tx = await nftMinting.createCollection(collectionName);
      const receipt = await tx.wait();

      // Check CollectionCreated event
      const event = receipt.logs[0];
      expect(event.fragment.name).to.equal("CollectionCreated");

      // Get creator's collections
      const creatorCollections = await nftMinting.getCreatorCollections(owner.address);
      expect(creatorCollections.length).to.equal(1);
      expect(creatorCollections[0].name).to.equal(collectionName);
    });

    it("Should prevent creating a collection with empty name", async function () {
      await expect(nftMinting.createCollection(""))
        .to.be.revertedWith("Name cannot be empty");
    });

    it("Should prevent creating a collection with name longer than max length", async function () {
      const longName = "A".repeat(101);
      await expect(nftMinting.createCollection(longName))
        .to.be.revertedWith("Name is too long");
    });

    it("Should prevent creating duplicate collection names", async function () {
      const collectionName = "Unique Collection";
      await nftMinting.createCollection(collectionName);
      
      await expect(nftMinting.createCollection(collectionName))
        .to.be.revertedWith("Collection already exists");
    });
  });

  // Test NFT Minting
  describe("NFT Minting", function () {
    let collectionId;

    beforeEach(async function () {
      // Create a collection before each NFT minting test
      const tx = await nftMinting.createCollection("Test Collection");
      const receipt = await tx.wait();
      collectionId = receipt.logs[0].args[0];
    });

    it("Should mint an NFT successfully", async function () {
      const nftName = "Test NFT";
      const price = ethers.parseEther("0.1");

      const tx = await nftMinting.mintNFT(collectionId, nftName, price);
      const receipt = await tx.wait();

      // Check NFTMinted event
      const event = receipt.logs[0];
      expect(event.fragment.name).to.equal("NFTMinted");

      // Verify NFT details
      const ownerNFTs = await nftMinting.getNFTsByOwner(owner.address);
      expect(ownerNFTs.length).to.equal(1);
      expect(ownerNFTs[0].name).to.equal(nftName);
      expect(ownerNFTs[0].price).to.equal(price);
    });

    it("Should prevent minting NFT with invalid collection", async function () {
      const invalidCollectionId = 9999;
      await expect(nftMinting.mintNFT(invalidCollectionId, "Test NFT", ethers.parseEther("0.1")))
        .to.be.revertedWith("Invalid collection ID");
    });

    it("Should prevent minting NFT with empty name", async function () {
      await expect(nftMinting.mintNFT(collectionId, "", ethers.parseEther("0.1")))
        .to.be.revertedWith("Name cannot be empty");
    });

    it("Should prevent minting NFT with price zero", async function () {
      await expect(nftMinting.mintNFT(collectionId, "Test NFT", 0))
        .to.be.revertedWith("Price must be greater than 0");
    });
  });

  // Test NFT Transfer
  describe("NFT Transfer", function () {
    let tokenId;
    let collectionId;

    beforeEach(async function () {
      // Create collection and mint NFT
      const collectionTx = await nftMinting.createCollection("Transfer Collection");
      const collectionReceipt = await collectionTx.wait();
      collectionId = collectionReceipt.logs[0].args[0];

      const mintTx = await nftMinting.mintNFT(collectionId, "Transfer NFT", ethers.parseEther("0.1"));
      const mintReceipt = await mintTx.wait();
      tokenId = mintReceipt.logs[0].args[0];
    });

    it("Should transfer NFT successfully", async function () {
      const tx = await nftMinting.transferNFT(tokenId, addr1.address);
      const receipt = await tx.wait();

      // Check NFTTransferred event
      const event = receipt.logs[0];
      expect(event.fragment.name).to.equal("NFTTransferred");

      // Verify new owner
      const ownerNFTs = await nftMinting.getNFTsByOwner(addr1.address);
      expect(ownerNFTs.length).to.equal(1);
      expect(ownerNFTs[0].tokenId).to.equal(tokenId);
    });
  });

  // Test Retrieval Functions
  describe("Retrieval Functions", function () {
    let collectionId;
    let tokenId;

    beforeEach(async function () {
      // Create collection and mint NFT
      const collectionTx = await nftMinting.createCollection("Retrieval Collection");
      const collectionReceipt = await collectionTx.wait();
      collectionId = collectionReceipt.logs[0].args[0];

      const mintTx = await nftMinting.mintNFT(collectionId, "Retrieval NFT", ethers.parseEther("0.1"));
      const mintReceipt = await mintTx.wait();
      tokenId = mintReceipt.logs[0].args[0];
    });

    it("Should retrieve creator's collections", async function () {
      const collections = await nftMinting.getCreatorCollections(owner.address);
      expect(collections.length).to.be.greaterThan(0);
      expect(collections[collections.length - 1].name).to.equal("Retrieval Collection");
    });

    it("Should retrieve NFTs by owner", async function () {
      const ownerNFTs = await nftMinting.getNFTsByOwner(owner.address);
      expect(ownerNFTs.length).to.be.greaterThan(0);
      expect(ownerNFTs[ownerNFTs.length - 1].name).to.equal("Retrieval NFT");
    });

    it("Should retrieve NFTs by collection", async function () {
      const collectionNFTs = await nftMinting.getNFTsByCollection(owner.address);
      expect(collectionNFTs.length).to.be.greaterThan(0);
      expect(collectionNFTs[collectionNFTs.length - 1].name).to.equal("Retrieval NFT");
    });

    it("Should check token existence", async function () {
      const exists = await nftMinting.tokenExists(tokenId);
      expect(exists).to.be.true;

      const nonExistentTokenId = 99999;
      const notExists = await nftMinting.tokenExists(nonExistentTokenId);
      expect(notExists).to.be.false;
    });
  });
});