# lnr-web
<p align="center">
  <img src="https://github.com/Linagee-Name-Registrar/Brand-Kit/blob/main/icon/svg/lnr_icon_box.svg" alt="LNR Logo" width=33% height=33%>
</p>
This package simplifies interacting with the LNR Web protocol

To generate the library, run "npx webpack"

# Lets put entire websites on the ethereum blockchain
## Note: for .og domains to be used with lnr-web, they must first be unwrapped

LR-web is a library that connects domain names with decentralized assets stored as calldata on the ethereum blockchain. In practice, this allows us to upload websites onto the ethereum blockchain, and access them by going to [name].og

## How are websites accessed?
We are working on a browser extension, but for now decentralized websites can be accessed by going to https://www.linagee.vision, or by cloning lnr-web-template and running a static local server.  To get a website using lnr-web
```
let pageObject = await lnrWeb.getWebsite(domain)
// returns pageObject, pageObject.finalData contains the entire website bundled into a single HTML file
```

## How are assets stored?
To store a new asset on the ethereum blockchain
```
let uploaded = await uploadNewFile(fileName, fileType, fileDesc, fileData);
// returns ethers tx receipt
```

Assets are stored on the blockchain as gzipped data and accessed by their transaction hash and the keccak256 hash of the uncompressed asset data.  To access the data directly, we use a long web address that looks like this
```
derp://0x.../0x...
```

## Why derp://
derp is an acronym: Decentralized Ethereum Routing Protocol

## How are domains attached to assets?
Owners of .og domains can update routing information to map their domain name to an asset on the ethereum network. 

We use the following command to map test.og to derp://0x.../0x...
```
let update = await updateWebsite(domain, siteDataHash, siteTxHash, uploadData);
// returns ethers tx receipt
```
Additional data can be uploaded with the domain. This allows for templating, wherein the website at derp://siteTxHash/siteDataHash can use uploadData to dynamically generate content. (think linktree or something similar)

Note: ENS domains are also supported, to route an ENS name, use the ENS contract url field to store a derp:// link

## What about dynamic data, wont these websites just be stale webpages?
The websites have access to ethers, so they have whatever data is located on the eth blockchain. To help devs with an easy way to update their websites, we have:
```
let update =  await updateState(domain, version, stateData)
// returns ethers tx receipt
```

This function allows og website owners to attach arbitry data to their website. It is then up to the website owner to get the state data and use it how they wish
```
let getState = await getWebsiteState(domain, sender, version, startBlock, endBlock);
// returns an array of all state updates that meet the query criteria, pass null to sender or version to get all
```

This makes functionality involving user generated content like a blog easy to implememnt.  

## Putting data onto ethereum expensive isn't this doing to be very expensive?
It would be if we didnt reuse code!  Since websites often use the same libraries, we can save alot of data by uploading reusable assets and accessing them.  Essentially we are turning calldata on ethereum into a CDN. 

## But how does that work in practice?  How much does it really cost?
As an example, I wanted to store material-icons on chain.  I'm sure there are more efficient ways to do this, but for simplicity, I used the css file here (https://fonts.googleapis.com/icon?family=Material+Icons) and embedded the .woff2 font as a base64 stream in the src property. The resulting file size was ~172kB. I compressed and uploaded this asset to the ethereum blockchain for 1,065,071 gas. Minting an ERC721 costs about 75kgas, so it costs about 14x an NFT mint to store material icons on the ethereum blockchain forever. The best part is, now anyone else can use this asset at no cost.
Right now, eth is $1500 and gas is 20gwei, it would cost 0.0213 eth ($35) to put this asset on chain right now
When eth was $4000 and gas was 100gwei it would have cost $450

## That doesn't seem very affordable why would anyone do this?
After the library assets are on chain, the websits can actually be quite small.  OGSwap.og is a 100% decentralized trading marketplace that cost less than 85,000 gas to upload, and then another 78,000 to create the route between ogswap.og and the asset.  For < 165,000 gas we now have a decentralized trading marketplace for unwrapped og domains as long as ethereum exists.

Based on the figures above, the cost to deploy that right now is < $10!  Even when eth was 4k and gas was 100, that would still only cost $125

Consider the fact that .og domains have no renewal fees, and that you dont need to pay any monthly server costs!

## Okay that sounds pretty good, how are the assets reused?
Like I said, we are storing assets on eth and accessing them with URLs.  This allows us to do something like this

```
  <head>
  <!-- NOTE: These asset URLs are valid on sepolia testnet -->
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta charset="UTF-8">
    <!-- jquery -->
    <script src="derp://0x90bdba8728333403f049f0ec54eaef43edae122c21dc88b3421140430ac39e65/0x7cec8efcc600aaa53decab9106bd97fcdec817a42fd0650c2f74531e5698153a"></script>
    <!-- bulma -->
    <link rel="stylesheet" href="derp://0xa725844db15f47cfb979c3d71071b9bc58c8534289c391a89a7eb8787a5bec02/0xaed9ac8797981170d20879074b6b58c63d12092ad41f47eabd39896814de5197">
    <!-- Material Icons-->
    <link rel="stylesheet" href="derp://0x669231f5909de3c83d88b16a2ba4951cbd3cf677ac3b5c81286213fe64dd3190/0x37589b02a0a8baecdf3115c0324eafc284d4e7f04be56f4d359d398a47208e46">

    <script type="importmap">
      {
        "imports": {
          "three": "derp://0xe90391a3ac35264a6ff9eec29049a6ee8341f6316487682b24c732a59dd6c84c/0x79db9d483a6155104d35f9871a2ad4fc322115a42ee09dea85fc3e2ed75660cf"
        }
      }
    </script>

  </head>
```

In this example, we are using jquery, bulma css, material icons and three.js. We only need to store a few hundred bytes on chain to access all of these libraries. (Because they have already been uploaded for you to use *Thanks derp!*)

When lnr-web fetches your asset (single html file) it will go through and find the script/css tags the locate the assets on the blockchain, verify their integrity, and then import them, just like using a CDN.

To get stated building, check out the LNR-web-template for vanilla JS, or LNR-web-template-solidjs for a SolidJS implementation








