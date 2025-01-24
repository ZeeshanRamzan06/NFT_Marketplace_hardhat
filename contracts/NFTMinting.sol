    // SPDX-License-Identifier: MIT
    pragma solidity ^0.8.0;
    contract NFTMinting {

        struct NFT {
            uint256 tokenId;
            string name;
            address collection;
            address owner;
            uint256 collectionId;
            uint256 price; 
        }
        
        struct Collection {
            uint256 collectionId;
            string name;
            address creator;
            bool exists;
        }
        
        struct NFTDetails {
            uint256 tokenId;
            string name;
            address owner;
            uint256 collectionId;
            string collectionName;
            uint256 price; 
        }
        
    // Events
        event CollectionCreated(uint256 indexed collectionId,string name,address indexed creator);
        event NFTMinted(uint256 indexed tokenId,string name,uint256 indexed collectionId,address indexed owner);
        event NFTTransferred(uint256 indexed tokenId, address indexed from, address indexed to);

    // Mappings
        mapping(string => uint256) private collectionNameToId;
        mapping(uint256 => NFT) public nfts;
        mapping(uint256 => Collection) private  collections;
        mapping(address => uint256[]) public userNFTs;
        mapping(address => uint256[]) public creatorCollections;
        mapping(address => uint256[]) public collectionNFTs;
        mapping(uint256 => bool) private  usedTokenIds;
        mapping(uint256 => bool) private  usedCollectionIds;
        mapping(address => bool) public authorizedContracts;

        uint256 private tokenCounter;
        uint256 private constant MAX_NAME_LENGTH = 100;
        address public owner;
        
        constructor() {
            owner = msg.sender;
            tokenCounter = 1;
        }

        modifier onlyOwner() {
            require(msg.sender == owner, "Not the contract owner");
            _;
        }

       

        function generateRandomCollectionId(address sender) private view returns (uint256) {
            return uint256(
                keccak256(
                    abi.encodePacked(
                        block.timestamp,
                        block.prevrandao, 
                        sender,
                        block.number
                    )
                )
            ) % 10000000 + 1;
        }
        
        function generateRandomTokenId(address sender) private view returns (uint256) {
            return uint256(
                keccak256(
                    abi.encodePacked(
                        block.timestamp,
                        block.prevrandao,
                        sender,
                        tokenCounter
                    )
                )
            ) % 100000000000000;
        }
        
        function createCollection(string calldata _name) public returns (uint256) {
            require(bytes(_name).length > 0, "Name cannot be empty");
            require(bytes(_name).length <= MAX_NAME_LENGTH, "Name is too long");
            require(collectionNameToId[_name] == 0, "Collection already exists");
            
            uint256 collectionId;
            bool unique = false;
            uint256 attempts = 0;
            uint256 maxAttempts = 10;
            
            while (!unique && attempts < maxAttempts) {
                collectionId = generateRandomCollectionId(msg.sender);
                if (!usedCollectionIds[collectionId]) {
                    unique = true;
                    usedCollectionIds[collectionId] = true;
                }
                attempts++;
            }   
            
            require(unique, "Failed to generate unique collection ID");
            
            collections[collectionId] = Collection({
                collectionId: collectionId,
                name: _name,
                creator: msg.sender,
                exists: true
            });
            
            collectionNameToId[_name] = collectionId;
            creatorCollections[msg.sender].push(collectionId);
            
            emit CollectionCreated(collectionId, _name, msg.sender);
            return collectionId;
        }


        function getCreatorCollections(address _creator) public view returns (Collection[] memory) {
            uint256[] memory collectionIds = creatorCollections[_creator];
            Collection[] memory result = new Collection[](collectionIds.length);
            
            for (uint256 i = 0; i < collectionIds.length; i++) {
                result[i] = collections[collectionIds[i]];
            }
            
            return result;
        }

        function mintNFT(uint256 _collectionId, string calldata _name ,uint256 _price) public returns (uint256) {
            require(collections[_collectionId].exists, "Invalid collection ID");
            require(bytes(_name).length > 0, "Name cannot be empty");
            require(bytes(_name).length <= MAX_NAME_LENGTH, "Name is too long");
            require(_price > 0, "Price must be greater than 0");

            uint256 newTokenId;
            bool unique = false;
            uint256 attempts = 0;
            uint256 maxAttempts = 10;
            
            while (!unique && attempts < maxAttempts) {
                newTokenId = generateRandomTokenId(msg.sender);
                if (!usedTokenIds[newTokenId]) {
                    unique = true;
                    usedTokenIds[newTokenId] = true;
                }
                attempts++;
            }
            
            require(unique, "Failed to generate unique token ID");
            
            nfts[newTokenId] = NFT({
                tokenId: newTokenId,
                name: _name,
                collection: collections[_collectionId].creator,
                owner: msg.sender,
                collectionId: _collectionId,
                price: _price 
            });
            
            userNFTs[msg.sender].push(newTokenId);
            collectionNFTs[collections[_collectionId].creator].push(newTokenId);
            tokenCounter++;
            
            emit NFTMinted(newTokenId, _name, _collectionId, msg.sender);
            return newTokenId;
        }
        
        function getNFTsByOwner(address _owner) public view returns (NFTDetails[] memory) {
            uint256[] memory tokenIds = userNFTs[_owner];
            NFTDetails[] memory details = new NFTDetails[](tokenIds.length);
            
            for (uint256 i = 0; i < tokenIds.length; i++) {
                NFT memory nft = nfts[tokenIds[i]];
                Collection memory collection = collections[nft.collectionId];
                
                details[i] = NFTDetails({
                    tokenId: nft.tokenId,
                    name: nft.name,
                    owner: nft.owner,
                    collectionId: nft.collectionId,
                    collectionName: collection.name,
                    price: nft.price 
                });
            }
            
            return details;
        }
        
        function getNFTsByCollection(address _collection) public view returns (NFTDetails[] memory) {
            uint256[] memory tokenIds = collectionNFTs[_collection];
            NFTDetails[] memory details = new NFTDetails[](tokenIds.length);
            
            for (uint256 i = 0; i < tokenIds.length; i++) {
                NFT memory nft = nfts[tokenIds[i]];
                Collection memory collection = collections[nft.collectionId];
                
                details[i] = NFTDetails({
                    tokenId: nft.tokenId,
                    name: nft.name,
                    owner: nft.owner,
                    collectionId: nft.collectionId,
                    collectionName: collection.name,
                    price: nft.price 
                });
            }
            
            return details;
        }

       
    
        function transferNFT(uint256 _tokenId, address _newOwner) external  {
            NFT storage nft = nfts[_tokenId];
            address previousOwner = nft.owner;
            nft.owner = _newOwner;

            uint256[] storage ownerTokens = userNFTs[previousOwner];
            for (uint256 i = 0; i < ownerTokens.length; i++) {
                if (ownerTokens[i] == _tokenId) {
                    ownerTokens[i] = ownerTokens[ownerTokens.length - 1];
                    ownerTokens.pop();
                    break;
                }
            }
            userNFTs[_newOwner].push(_tokenId);

            emit NFTTransferred(_tokenId, previousOwner, _newOwner);
        }

        function tokenExists(uint256 _tokenId) public view returns (bool) {
            return nfts[_tokenId].tokenId != 0;
        }
    }




