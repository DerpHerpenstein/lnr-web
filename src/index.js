import lnrWebAbi from '../abi/lnrWebAbi.json';
//import { createRequire } from "./module";
//const require = createRequire(import.meta.url);
const pako = require("pako");


/**
 * A class to interact with the LNR Web Protocol
 */
class LNR_WEB {

  static get LNR_ZERO_HASH(){
	 return "0x0000000000000000000000000000000000000000000000000000000000000000";
	}

  static get LNR_WEB_ADDRESS() {
    return "0xc72FDddeCf69D37d58518727B70BD616BC795Ca3";//"0x9B1558c57Bf2B2686f2E024252E84BA746eBa665";
  }

  constructor(_ethers, _provider, _signer) {
    this.ethers = _ethers;
    this.signer = _signer;
    this.provider = _provider;
    this.lnrWebAbi = lnrWebAbi;
    this.lnrWebContract = new this.ethers.Contract(LNR_WEB.LNR_WEB_ADDRESS, this.lnrWebAbi, this.signer);
  }

  compressData (uncompressed){
    let tmpUncompressed = new TextEncoder().encode(uncompressed);
    return pako.deflate(tmpUncompressed);
  }

  decompressData (compressed){
    let tmpCompressed = this.ethers.utils.arrayify(compressed);
    let uncompressed = new TextDecoder().decode(pako.inflate(tmpCompressed));
    return uncompressed;
  }

  async getRawDataFromChain(tmpTxHash, tmpDataHash){
    let tx = await this.provider.getTransaction(tmpTxHash);
    let input_data = '0x' + tx.data.slice(10);
    let iface = new this.ethers.utils.Interface(lnrWebAbi);
    let decodedData = iface.parseTransaction({ data: tx.data, value: tx.value });
    let params = decodedData.args;
    return params;
  }

  async getDataFromChain(tmpTxHash, tmpDataHash){
    let params = await this.getRawDataFromChain(tmpTxHash, tmpDataHash)
		let params1 = null;
    if(params[0] === tmpDataHash){
      let finalData = params[5];
			if(params[1] !== LNR_WEB.LNR_ZERO_HASH){
				params1 = (await this.getRawDataFromChain(params[1], tmpDataHash))
				finalData += params1[5].slice(2);
			}

      if(params[5]) // if its zipped, unzip it
        finalData = this.decompressData(finalData);
			//console.log(finalData);

      //finalData = decodeURI(finalData); // makes the files larger
      let computedHash = this.ethers.utils.keccak256(this.ethers.utils.toUtf8Bytes(finalData));
      if(computedHash === params[0])
        return {
          hash: params[0],
          name: params[2],
          type: params[3],
          desc: params[4],
          raw : ((params[1] !== LNR_WEB.LNR_ZERO_HASH)? (params[5] +params1[5].slice(2)) : params[5]),
          data: finalData,
          zip: params[6]
        }
      else{
        throw "Error: Hash Mismatch! Possibly malicious file"
      }
    }

    throw "Error: Unable to locate asset: derp://" + tmpTxHash + "/" + tmpDataHash;
  }

  async uploadNewFile(fileName, fileType, fileDesc, fileData){
    let tmpNewFile = {
      name: fileName,
      type: fileType,
      desc: fileDesc,
      uncompressedData : fileData,
    }
    tmpNewFile.compressedData = this.compressData(tmpNewFile.uncompressedData);
    tmpNewFile.uncompressedKeccak256 = this.ethers.utils.keccak256(this.ethers.utils.toUtf8Bytes(tmpNewFile.uncompressedData));
    //console.log("Upload Asset:");
    //console.log(tmpNewFile);
    if(tmpNewFile.compressedData.length < 127000){
      return this.lnrWebContract.uploadAsset( tmpNewFile.uncompressedKeccak256,
                                              LNR_WEB.LNR_ZERO_HASH,
                                              tmpNewFile.name,
                                              tmpNewFile.type,
                                              tmpNewFile.desc,
                                              tmpNewFile.compressedData,
                                              true ).then(function(result){
                                                  return result;
                                              });
    }
    else if(tmpNewFile.compressedData.length < 254000){
      // 128kb max geth tx size, make sure we fit into two tx's
      const half = Math.ceil(tmpNewFile.compressedData.length / 2);
      let secondHalf = await this.lnrWebContract.uploadAsset(tmpNewFile.uncompressedKeccak256,
                                              LNR_WEB.LNR_ZERO_HASH,
                                              tmpNewFile.name,
                                              tmpNewFile.type,
                                              tmpNewFile.desc,
                                              tmpNewFile.compressedData.slice(half),
                                              true );

      let firstHalf = await this.lnrWebContract.uploadAsset(tmpNewFile.uncompressedKeccak256,
                                              secondHalf.hash,
                                              tmpNewFile.name,
                                              tmpNewFile.type,
                                              tmpNewFile.desc,
                                              tmpNewFile.compressedData.slice(0,half),
                                              true );
      return firstHalf;
    }
    else
      throw "File too large, The current max is 254kb";
    //console.log("Upload Asset Result:")
    //console.log(upload);
    //console.log('txHash', upload.hash);
    //console.log('dataHash', tmpNewFile.uncompressedKeccak256);
  }

  async updateWebsite(domainAsBytes32, siteDescription, siteLinkArray, siteDataHashArray, siteTxHashArray){
    return this.lnrWebContract.updateWebsite( domainAsBytes32,
                                              siteDescription,
                                              siteLinkArray,
                                              siteDataHashArray,
                                              siteTxHashArray
                                            ).then(function(result){
                                                  return result;
                                            });
    //console.log("Update Website Result:");
    //console.log(update);
  }


  async getWebsite(domainAsBytes32){
    let website = await this.lnrWebContract.getWebsite(domainAsBytes32);
    //console.log("Website Data:");
    //console.log(website);
    let pageObject = await this.getDataFromChain(website.pageTxHashArray[0], website.pageHashArray[0]);
    //console.log(pageObject);
    pageObject.finalData = await this.replaceCSS(pageObject.data, true);
    pageObject.finalData = await this.replaceJS(pageObject.finalData, true);
    //console.log(pageObject.data);
    return pageObject;
  }

  async fetchBase64Data(dataUrl){
    if(dataUrl.indexOf("derp://") > -1){
      let splitData = dataUrl.split("/");
      let txHash = splitData[2];
      let dataHash = splitData[3];
      let chainData = await this.getDataFromChain(txHash,dataHash);
      return [true, btoa(chainData.data)];
    }
    else {
      let tmpData = await fetch(dataUrl);
      tmpData = await tmpData.text();
      return [false, btoa(tmpData)]; // base64 encoded string
    }
  }

  async replaceCSS(site, viewIt){
    let regexp = '<link rel="stylesheet" href="([^">]+)">';
    let matches = site.matchAll(regexp);
    for (const match of matches) {
      let tmpData = await this.fetchBase64Data(match[1]);
      if(viewIt || !tmpData[0])
        site = site.replace(match[1], "data:text/css;base64, " + tmpData[1]);
    }
    return site;
  }

  async replaceJS(site, viewIt){
    let regexp = '<script (.*?)src="([^">]+)">[\s\S]*?<\/script>';
    let matches = site.matchAll(regexp);
		// find script tags and inject input into them
    for (const match of matches) {
      let tmpData = await this.fetchBase64Data(match[2]);
      if(viewIt || !tmpData[0])
        site = site.replace(match[2], "data:text/javascript;base64, " + tmpData[1]);
    }
		// find the importmap and inject code into it
		let start = site.indexOf('<script type="importmap">');
		let end = site.indexOf('</script>', start)
		if(start && end){
			let importJSON = JSON.parse(site.slice(start+25, end));
			for(const tmpImport in importJSON.imports){
				let tmpURL = importJSON.imports[tmpImport];
				let tmpData = await this.fetchBase64Data(tmpURL);
				if(viewIt || !tmpData[0])
					site = site.replace(tmpURL, "data:text/javascript;base64, " + tmpData[1]);
			}

		}
    return site;
  }
}

export default LNR_WEB;
