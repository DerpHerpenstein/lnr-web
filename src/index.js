import lnrWebAbi from '../abi/lnrWebAbi.json';
const pako = require("pako");


/**
 * A class to interact with the LNR Web Protocol
 */
class LNR_WEB {

  static get LNR_ZERO_HASH(){
	 return "0x0000000000000000000000000000000000000000000000000000000000000000";
	}

  static get LNR_WEB_ADDRESS() {
    return "0xfeae5e7264A193B56A1d351052C0515eabe6a455";
  }

  constructor(_lnr, _provider) {
    this.lnr = _lnr;
    this.ethers = _lnr.ethers;
    this.signer = _lnr.signer;
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
    try{
      let tx = await this.provider.getTransaction(tmpTxHash);
      let input_data = '0x' + tx.data.slice(10);
      let iface = new this.ethers.utils.Interface(lnrWebAbi);
      let decodedData = iface.parseTransaction({ data: tx.data, value: tx.value });
      let params = decodedData.args;
      return params;
    }
    catch(e){
      throw "Error loading asset at derp://" + tmpTxHash + "/" + tmpDataHash;
    }
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

      if(params[5])
        finalData = this.decompressData(finalData);

      let computedHash = this.ethers.utils.keccak256(this.ethers.utils.toUtf8Bytes(finalData));
      if(computedHash === params[0])
        return {
          hash: params[0],
          name: params[2],
          headers: params[3],
          desc: params[4],
          raw : ((params[1] !== LNR_WEB.LNR_ZERO_HASH)? (params[5] +params1[5].slice(2)) : params[5]),
          data: finalData
        }
      else{
        throw "Error: Hash Mismatch! Possibly malicious file"
      }
    }
    throw "Error: Unable to locate asset: derp://" + tmpTxHash + "/" + tmpDataHash;
  }

  async uploadNewFile(fileName, fileHeaders, fileDesc, fileData){
    let tmpNewFile = {
      name: fileName,
      headers: fileHeaders,
      desc: fileDesc,
      uncompressedData : fileData,
    }
    tmpNewFile.compressedData = this.compressData(tmpNewFile.uncompressedData);
    tmpNewFile.uncompressedKeccak256 = this.ethers.utils.keccak256(this.ethers.utils.toUtf8Bytes(tmpNewFile.uncompressedData));

    if(tmpNewFile.compressedData.length < 127000){
      return this.lnrWebContract.uploadAsset( tmpNewFile.uncompressedKeccak256,
                                              LNR_WEB.LNR_ZERO_HASH,
                                              tmpNewFile.name,
                                              tmpNewFile.headers,
                                              tmpNewFile.desc,
                                              tmpNewFile.compressedData).then(function(result){
                                                  return result;
                                              });
    }
    else if(tmpNewFile.compressedData.length < 254000){
      // 128kb max geth tx size, make sure we fit into two tx's
      const half = Math.ceil(tmpNewFile.compressedData.length / 2);
      let secondHalf = await this.lnrWebContract.uploadAsset(tmpNewFile.uncompressedKeccak256,
                                              LNR_WEB.LNR_ZERO_HASH,
                                              tmpNewFile.name,
                                              tmpNewFile.headers,
                                              tmpNewFile.desc,
                                              tmpNewFile.compressedData.slice(half));

      let firstHalf = await this.lnrWebContract.uploadAsset(tmpNewFile.uncompressedKeccak256,
                                              secondHalf.hash,
                                              tmpNewFile.name,
                                              tmpNewFile.headers,
                                              tmpNewFile.desc,
                                              tmpNewFile.compressedData.slice(0,half));
      return firstHalf;
    }
    else
      throw "File too large, The current max is 254kb";
  }

  async updateState(domain, version, stateData){
    if(domain.endsWith(".og")){
      let domainAsBytes32 = this.lnr.domainToBytes32(domain);
      return this.lnrWebContract.updateState( domainAsBytes32,
                                                version,
                                                this.compressData(stateData)
                                              ).then(function(result){
                                                    return result;
                                              });
    }
    throw "Updating state is only currently available for .og domains";
  }

  async updateWebsite(domain, siteDataHash, siteTxHash, uploadData){
    if(domain.endsWith(".og")){
      let domainAsBytes32 = this.lnr.domainToBytes32(domain);
      return this.lnrWebContract.updateWebsite( domainAsBytes32,
                                              siteDataHash,
                                              siteTxHash,
                                              this.compressData(uploadData)
                                            ).then(function(result){
                                                  return result;
                                            });
    }
    else if(domain.endsWith(".eth")){
      throw "To update your ENS website, update your \"url\" text record to the derp:// asset address of your website\n\
             To learn more: https://docs.ens.domains/ens-improvement-proposals/ensip-5-text-records";
    }
    else
      throw "Unsupported Top Level Domain!"
  }

  async getWebsiteState(domain, sender, version, startBlock, endBlock){
    try{
      let domainAsBytes32 = this.lnr.domainToBytes32(domain);
      let filter = this.lnrWebContract.filters.NewState(domainAsBytes32, sender);
      let rawResults = await og.lnrWeb.lnrWebContract.queryFilter(filter, startBlock, endBlock);
      let results = [];
      for(let i=0; i<rawResults.length; i++){
        if(version == null || rawResults[i].args.version == version)
          results.push({blockNumber: rawResults[i].blockNumber, args: rawResults[i].args, data: this.decompressData(rawResults[i].args.state)});
      }
      return results;
    }
    catch(e){
      throw e.message;
    }
  }

  async getWebsite(domain){
    let website = {};
    if(domain.endsWith(".og")){
      let domainAsBytes32 = this.lnr.domainToBytes32(domain);
      website = await this.lnrWebContract.getWebsite(domainAsBytes32);
    }
    else if(domain.endsWith(".eth")){
      try{
        const resolver = await og.provider.getResolver(domain);
        const urlText = await resolver.getText("url");
        if(urlText.endsWith(".og")){
          let domainAsBytes32 = this.lnr.domainToBytes32(urlText);
          website = await this.lnrWebContract.getWebsite(domainAsBytes32);
        }
        else if(urlText.indexOf("derp://") > -1){
          let splitData = urlText.split("/");
          website = {
            pageTxHash: splitData[2],
            pageHash: splitData[3]
          }
        }
        else
          throw 'Error loading asset: "' + urlText +'"';
      }
      catch(e){
        throw 'Error loading ' + domain + "\n" + e.toString();
      }
    }
    else if(domain.indexOf("derp://") > -1){
      let splitData = domain.split("/");
      website = {
        pageTxHash: splitData[2],
        pageHash: splitData[3]
      }
    }
    else
      throw "Unsupported Top Level Domain!";
    
    let pageObject = await this.getDataFromChain(website.pageTxHash, website.pageHash);
    pageObject.finalData = await this.replaceCSS(pageObject.data, true, "");
    pageObject.finalData = await this.replaceJS(pageObject.finalData, true, "");
    pageObject.domain = domain;
    return pageObject;
  }

  async fetchBase64Data(directory, dataUrl){
    if(dataUrl.indexOf("derp://") > -1){
      let splitData = dataUrl.split("/");
      let txHash = splitData[2];
      let dataHash = splitData[3];
      let chainData = await this.getDataFromChain(txHash,dataHash);
      return [true, btoa(chainData.data)];
    }
    else {
      let tmpData = await fetch(directory + dataUrl);
      tmpData = await tmpData.text();
      return [false, btoa(tmpData)]; // base64 encoded string
    }
  }

  async replaceCSS(site, viewIt, directory){
    let regexp = '<link rel="stylesheet" href="([^">]+)">';
    let matches = site.matchAll(regexp);
    for (const match of matches) {
      let tmpData = await this.fetchBase64Data(directory, match[1]);
      if(viewIt || !tmpData[0])
        site = site.replace(match[1], "data:text/css;base64, " + tmpData[1]);
    }
    return site;
  }

  async replaceJS(site, viewIt, directory){
    let regexp = '<script (.*?)src="([^">]+)">[\s\S]*?<\/script>';
    let matches = site.matchAll(regexp);
		// find script tags and inject input into them
    for (const match of matches) {
      let tmpData = await this.fetchBase64Data(directory, match[2]);
      if(viewIt || !tmpData[0])
        site = site.replace(match[2], "data:text/javascript;base64, " + tmpData[1]);
    }
		// find the importmap and inject code into it
		let start = site.indexOf('<script type="importmap">');
		let end = site.indexOf('</script>', start)
		if(start >=0 && end >=0){
			let importJSON = JSON.parse(site.slice(start+25, end));
			for(const tmpImport in importJSON.imports){
				let tmpURL = importJSON.imports[tmpImport];
				let tmpData = await this.fetchBase64Data(directory, tmpURL);
				if(viewIt || !tmpData[0])
					site = site.replace(tmpURL, "data:text/javascript;base64, " + tmpData[1]);
			}
		}
    return site;
  }
}

export default LNR_WEB;
