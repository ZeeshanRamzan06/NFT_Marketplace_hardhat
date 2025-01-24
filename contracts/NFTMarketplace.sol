// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface INFTMinting {
    function tokenExists(uint256 _tokenId) external view returns (bool);
    function nfts(uint256 _tokenId) external view returns (
        uint256 tokenId,
        string memory name,
        address collection,
        address owner,
        uint256 collectionId,
        uint256 price
    );
    function transferNFT(uint256 _tokenId, address _newOwner) external;
}

contract NFTMarketplace {
    // Events
    event NFTListed(uint256 indexed tokenId, uint256 price, address indexed seller);
    event AuctionCreated(uint256 indexed tokenId, uint256 startingBid, address indexed creator);
    event BidPlaced(uint256 indexed tokenId, uint256 bidAmount, address indexed bidder);
    event NFTSold(uint256 indexed tokenId, uint256 finalPrice, address indexed buyer);
    event AuctionEnded(uint256 indexed tokenId, address indexed endedBy);
    event NFTListingDeleted(uint256 indexed tokenId, address indexed deletedBy);


    struct Listing {
        uint256 tokenId;
        uint256 price;
        address seller;
        bool isActive;
    }

    struct Auction {
        uint256 tokenId;
        uint256 highestBid;
        address highestBidder;
        uint256 endTime;
        address creator;
        bool active;
    }

    mapping(uint256 => Listing) public listings;
    mapping(uint256 => Auction) public auctions;

    INFTMinting public nftMintingContract;
    address public owner;

    constructor(address _nftMintingContract) {
        nftMintingContract = INFTMinting(_nftMintingContract);
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not contract owner");
        _;
    }

    modifier onlyTokenOwner(uint256 _tokenId) {
        (, , , address tokenOwner,, ) = nftMintingContract.nfts(_tokenId);
        require(tokenOwner == msg.sender, "Not token owner");
        _;
    }

    modifier tokenExists(uint256 _tokenId) {
        require(nftMintingContract.tokenExists(_tokenId), "Token does not exist");
        _;
    }

    function listNFT(uint256 _tokenId, uint256 _price) 
        external 
        tokenExists(_tokenId) 
        onlyTokenOwner(_tokenId) 
    {
        (, , , , , uint256 mintPrice) = nftMintingContract.nfts(_tokenId);
        require(_price >= mintPrice, "Price cannot be less than mint price");
        require(_price > 0, "Price must be greater than zero");
        require(listings[_tokenId].price == 0, "NFT already listed");

        listings[_tokenId] = Listing({
            tokenId: _tokenId,
            price: _price,
            seller: msg.sender,
            isActive: true
        });
        emit NFTListed(_tokenId, _price, msg.sender);
    }
    // This function able to delete nft listing
    function cancelListing(uint256 _tokenId) external onlyTokenOwner(_tokenId) {
        require(listings[_tokenId].price > 0, "NFT not listed");
        delete listings[_tokenId];
        emit NFTListingDeleted(_tokenId, msg.sender);
    }

    // This function is for buyer to buy nft
 function buyNFT(uint256 _tokenId) external payable tokenExists(_tokenId) {
    Listing memory listing = listings[_tokenId];
    (, , , , , uint256 mintPrice) = nftMintingContract.nfts(_tokenId);
    require(listing.price >= mintPrice, "Listed price below mint price");
    require(listing.price > 0, "NFT not listed for sale");
    require(msg.value >= listing.price, "Insufficient payment amount");

    // Refund any excess amount first
    if (msg.value > listing.price) {
        uint256 excessAmount = msg.value - listing.price;
        payable(msg.sender).transfer(excessAmount);
    }

    // Transfer payment to seller
    payable(listing.seller).transfer(listing.price);

    // Transfer the NFT to the buyer
    nftMintingContract.transferNFT(_tokenId, msg.sender);

    // Delete the listing after successful transaction
    delete listings[_tokenId];

    emit NFTSold(_tokenId, listing.price, msg.sender);
}



// this function verify who is current owner of nft
    function verifyNFTOwnership(uint256 _tokenId, address _owner) 
    external 
    view 
    tokenExists(_tokenId) 
    returns (bool) 
{
    (, , ,  address tokenOwner, , ) = nftMintingContract.nfts(_tokenId);
    return tokenOwner == _owner;
}
// This function create auction 
    function createAuction(uint256 _tokenId, uint256 _startingBid, uint256 _duration) 
        external 
        tokenExists(_tokenId) 
        onlyTokenOwner(_tokenId) 
    {
        (, , , , , uint256 originalPrice) = nftMintingContract.nfts(_tokenId);
        require(_startingBid >= originalPrice, "Starting bid cannot be less than original price");

        require(_startingBid > 0, "Starting bid must be greater than zero");
        require(_duration > 0, "Duration must be greater than zero");

        auctions[_tokenId] = Auction({
            tokenId: _tokenId,
            highestBid: _startingBid,
            highestBidder: address(0),
            endTime: block.timestamp + _duration,
            creator: msg.sender,
            active: true
        });

        emit AuctionCreated(_tokenId, _startingBid, msg.sender);
    }
// this function for ending auction 
    function endAuction(uint256 _tokenId) external tokenExists(_tokenId) {
        Auction storage auction = auctions[_tokenId];
        require(auction.active, "Auction is not active");
        require(auction.creator == msg.sender, "Not auction creator");

        auction.active = false;

        delete auctions[_tokenId];

        emit AuctionEnded(_tokenId, msg.sender);
    }
// This function is for placing bid
    function placeBid(uint256 _tokenId) external payable tokenExists(_tokenId) {
    Auction storage auction = auctions[_tokenId];
    require(auction.active, "Auction is not active");
    (, , , , , uint256 originalPrice) = nftMintingContract.nfts(_tokenId);
    require(msg.value >= originalPrice, "Bid must be at least the original price");

    if (block.timestamp >= auction.endTime) {
        // Finalize the auction automatically
        auction.active = false;

        if (auction.highestBidder != address(0)) {
            // Transfer funds to the auction creator
            payable(auction.creator).transfer(auction.highestBid);
            // Transfer NFT ownership to the highest bidder
            nftMintingContract.transferNFT(_tokenId, auction.highestBidder);

            emit NFTSold(_tokenId, auction.highestBid, auction.highestBidder);
        } else {
            // If no bids were placed, the auction ends without transferring ownership
            revert("Auction ended without any valid bids");
        }

        return;
    }

    // Handle new bids
    require(msg.value > auction.highestBid, "Bid must be higher than the current highest bid");

    // Refund previous highest bidder
    if (auction.highestBidder != address(0)) {
        payable(auction.highestBidder).transfer(auction.highestBid);
    }
     
    auction.highestBid = msg.value;
    auction.highestBidder = msg.sender;

    emit BidPlaced(_tokenId, msg.value, msg.sender);
}


// Using this function we check status of auction 
function checkAuctionStatus(uint256 _tokenId) public view tokenExists(_tokenId) returns (bool active, uint256 highestBid, address highestBidder, uint256 timeRemaining) {
    Auction memory auction = auctions[_tokenId];
    active = auction.active && block.timestamp < auction.endTime;
    highestBid = auction.highestBid;
    highestBidder = auction.highestBidder;
    timeRemaining = block.timestamp < auction.endTime ? auction.endTime - block.timestamp : 0;
}
// This function we use to finalize the Auction 
    function finalizeAuction(uint256 _tokenId) external tokenExists(_tokenId) {
    Auction storage auction = auctions[_tokenId];
    require(block.timestamp >= auction.endTime, "Auction is still ongoing");
    require(auction.active, "Auction is not active");

    auction.active = false;

    if (auction.highestBidder != address(0)) {
        // Transfer funds to the auction creator
        payable(auction.creator).transfer(auction.highestBid);

        // Transfer NFT ownership
        nftMintingContract.transferNFT(_tokenId, auction.highestBidder);
        
        emit NFTSold(_tokenId, auction.highestBid, auction.highestBidder);
    } else {
        // No bids, auction ends without a sale
        emit AuctionCreated(_tokenId, 0, auction.creator);
    }

    delete auctions[_tokenId];
}

}