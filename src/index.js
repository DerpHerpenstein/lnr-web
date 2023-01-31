import lnrWebAbi from '../abi/lnrWebAbi.json';
//import { createRequire } from "./module";
//const require = createRequire(import.meta.url);
const pako = require("pako");


/**
 * A class to interact with the LNR Web Protocol
 */
class LNR_WEB {

  static get LNR_WEB_ADDRESS() {
    return "0x9B1558c57Bf2B2686f2E024252E84BA746eBa665";
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

  async getDataFromChain(tmpTxHash, tmpDataHash){
    let tx = await this.provider.getTransaction(tmpTxHash);
    let input_data = '0x' + tx.data.slice(10);
    let iface = new this.ethers.utils.Interface(lnrWebAbi);
    let decodedData = iface.parseTransaction({ data: tx.data, value: tx.value });
    let params = decodedData.args;
    for(let i=0; i< params[0].length; i++){
      if(params[0][i] === tmpDataHash){
        let finalData = params[4][i];
        if(params[5][i]) // if its zipped, unzip it
          finalData = this.decompressData(params[4][i]);

        //finalData = decodeURI(finalData); // makes the files larger
        let computedHash = this.ethers.utils.keccak256(this.ethers.utils.toUtf8Bytes(finalData));
        if(computedHash === params[0][i])
          return {
            hash: params[0][i],
            name: params[1][i],
            type: params[2][i],
            desc: params[3][i],
            raw : params[4][i],
            data: finalData,
            zip: params[5][i]
          }
        else{
          throw "Error: Hash Mismatch! Possibly malicious file"
        }
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

    return this.lnrWebContract.uploadAssets(  [tmpNewFile.uncompressedKeccak256],
                                              [tmpNewFile.name],
                                              [tmpNewFile.type],
                                              [tmpNewFile.desc],
                                              [tmpNewFile.compressedData],
                                              [true] ).then(function(result){
                                                  return result;
                                              });

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
    for (const match of matches) {
      let tmpData = await this.fetchBase64Data(match[2]);
      if(viewIt || !tmpData[0])
        site = site.replace(match[2], "data:text/javascript;base64, " + tmpData[1]);
    }
    return site;
  }
}

export default LNR_WEB;
