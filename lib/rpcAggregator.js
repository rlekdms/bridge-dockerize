const Britto = require("./britto");

Britto.setAdd0x();
Britto.setRemove0x();

class RPCAggregator {
  chainId;
  chainName;
  pool = [];

  constructor(_chainName, _chainId) {
    this.chainName = _chainName;
    this.chainId = _chainId;
  }

  addRpc(url, {
    name = "mainnet",
    address,
    abi,
    multisig,
    onconnect,
  } = {}) {
    if(this.isExist(url)) return;

    const node = Britto.getNodeConfigBase(name);
    node.rpc = url;
    node.address = address;
    node.abi = abi;
    global.monitor.setNodeConnectStatus(`${this.chainName}_${this.pool.length}`, node.rpc, "connecting");
    if (onconnect) {
      node.onconnect = onconnect;
    }
    new Britto(node, `${this.chainName}_${this.pool.length}`).connectWeb3();
    if (multisig) {
      node.multisig.wallet = multisig.address;
      node.multisig.abi = multisig.abi;
      node.multisig.contract = new node.web3.eth.Contract(node.multisig.abi, node.multisig.wallet);
    }
    this.pool.push(node);
  }

  async addRpcWithBritto(node) {
    if(this.isExist(node.rpc)) return;
    this.pool.push(node);
    let block = await node.web3.eth.getBlock("latest").catch(e => {console.log(e)});
    return !block ? false : true;
  }

  length() {
    return this.pool.length;
  }

  async select() {
    let bn = 0;
    let electedIndex;

    for(let i=0; i<this.pool.length; i++) {
      const node = this.pool[i];
      if (!node.isConnected) {
        continue;
      }

      const curBlockNumber = await node.web3.eth.getBlockNumber().catch( e => {
        logger.error(`[RPC_AGGREGATOR] getBlockNumber:${e}`);
      });
      if(!curBlockNumber || parseInt(curBlockNumber) < bn) {
        continue;
      }

      bn = parseInt(curBlockNumber);
      electedIndex = i;
    }
    const elected = this.pool[electedIndex];
    if (elected) {
      global.monitor.setNodeElectionStatus(elected.peggingType, elected.rpc, bn);
    }

    return elected;
  }

  async getNodes() {
    let arr = [...this.pool];
    for (let i = arr.length - 1; i > 0; i--) {
      let j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  async majorityCheckForDatasInRpcs(func) {
    const nodes = await this.getNodes();
    const requireCnt = parseInt(nodes.length/2) + 1;
    let resMap = {};
    for (const node of nodes) {
      let res = await func(node);
      if (!res) {
        continue;
      }
      res = JSON.stringify(res);
      if (!resMap[res]) {
        resMap[res] = 1;
      } else {
        resMap[res] += 1;
      }
      if (resMap[res] >= requireCnt) {
        return JSON.parse(res);
      }
    }
  }

  isExist(rpc) {
    const nodes = this.pool;
    return nodes.find(node => { return node.rpc.toLowerCase() === rpc.toLowerCase() });
  }
}

module.exports = RPCAggregator;
