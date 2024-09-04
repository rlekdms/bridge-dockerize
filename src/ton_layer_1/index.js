global.logger.ton_layer_1 = require('./logger');

const config = require(ROOT + '/config');

const Britto = require(ROOT + '/lib/britto');
const txSender = require(ROOT + '/lib/txsender');
const api = require(ROOT + '/lib/api');

const BridgeUtils = require(ROOT + '/lib/bridgeutils');
const bridgeUtils = new BridgeUtils();

const packer = require("./utils/packer");
const Ton = require("./utils/ton.api");

const FIX_GAS = 99999999;

const UINT64_MAX = "18446744073709551616";
const NumberFormat = /^[0-9]+$/;

const { Cell, Slice } = require("ton");

class TONLayer1Validator {
    static makeSigs(validator, signature) {
        let va = bridgeUtils.padLeft(validator, 64);
        let v = bridgeUtils.padLeft(parseInt(signature.v).toString(16), 64);

        let sigs = [
            va,
            v,
            signature.r,
            signature.s
        ]

        return sigs;
    }

    static makeSigsWithED(validator, sigEC, sigED) {
        let va = bridgeUtils.padLeft(validator, 64);
        let ecV = bridgeUtils.padLeft(parseInt(sigEC.v).toString(16), 64);

        let sigs = [
            va,
            ecV,
            sigEC.r,
            sigEC.s,
            sigED.r,
            sigED.s,
        ]

        return sigs;
    }

    constructor(chain, _account) {
        this.chainIds = config.chainIds;

        if(chain.toLowerCase() !== "ton_layer_1")
            throw 'Invalid chain symbol';

        if (!_account || !_account.address || !_account.pk)
            throw 'Invalid Ethereum Wallet Account';
        this.account = _account;

        this.lastBlockNum = {
            tonAddressBook: null,
        };

        const chainName = this.chainName = chain.toUpperCase();
        this.chainLower = chain.toLowerCase();

        const govInfo = this.govInfo = config.governance;
        if(!govInfo || !govInfo.chain || !govInfo.address || !govInfo.bytes || !govInfo.id)
            throw 'Empty Governance Info';

        this.orbitHub = config.orbitHub.address
        const info = config.info[this.chainLower];
        this.tonMultisig = info.CONTRACT_ADDRESS.multisig

        const ton = this.ton = new Ton(info.ENDPOINT);
        if(!ton) throw 'Invalid Ton Endpoint';

        const addressBook = this.addressBook = Britto.getNodeConfigBase('tonAddressBook');
        addressBook.rpc = config.endpoints.silicon.rpc;
        addressBook.address = config.settings.silicon.addressbook;
        addressBook.abi = Britto.getJSONInterface({filename: 'AddressBook'});

        addressBook.onconnect = async () => {
            if(monitor.address[chainName]) return;
            monitor.address[chainName] = await this.ton.getTonAccount(this.account.pk);
        };
        new Britto(addressBook, chainName).connectWeb3();

        this.multisigABI = Britto.getJSONInterface({filename: 'multisig/Ed25519'});
        this.depositTokenABI = {"event":"DepositToken","data":[[{"name":"opCode","type":"uint32","value":"hex"}],[{"name":"fromAddr","type":"uint256","value":"hex"},{"name":"jettonHash","type":"uint256","value":"hex"}],[{"name":"toChain","type":"uint256","value":"hex"},{"name":"toAddr","type":"uint160","value":"hex"},{"name":"amount","type":"uint256","value":"uint32"},{"name":"token","type":"uint160","value":"hex"},{"name":"decimal","type":"uint8","value":"uint32"},{"name":"depositId","type":"uint64","value":"uint32"}]]};

        addressBook.multisig.wallet = config.settings.silicon.multisig;
        addressBook.multisig.abi = this.multisigABI;
        addressBook.multisig.contract = new addressBook.web3.eth.Contract(addressBook.multisig.abi, addressBook.multisig.wallet);

        this.workerStarted = false;
        this.intervals = {
            getLockRelay: {
                handler: this.getLockRelay.bind(this),
                timeout: 1000 * 10,
                interval: null,
            },
            getTagRelay: {
                handler: this.getTagRelay.bind(this),
                timeout: 1000 * 10,
                interval: null,
            },
        };

        this.hashMap = new Map();
        this.flushHashMap();
        
        this.startIntervalWorker();
    }

    startIntervalWorker() {
        if (this.workerStarted) {
            return;
        }
        this.workerStarted = true;

        this.getLockRelay();
        this.getTagRelay();
    }

    intervalSet(obj) {
        if (obj.interval) return;
        obj.interval = setInterval(obj.handler.bind(this), obj.timeout);
    }

    intervalClear(obj) {
        clearInterval(obj.interval);
        obj.interval = null;
    }

    flushHashMap() {
        setTimeout(this.flushHashMap.bind(this), 1000 * 60 * 5);

        const now = parseInt(Date.now() / 1000);
        for (let [hash, obj] of this.hashMap.entries()) {
            if (obj.timestamp + 60 * 10 < now) {
                this.hashMap.delete(hash);
            }
        }
    }

    async getLockRelay() {
        this.intervalClear(this.intervals.getLockRelay);

        try {
            const response = await api.bible.get("/v1/api/ton/lock-relay");
            if (response.success !== "success") {
                logger.ton_layer_1.error(`lock-relay api error: ${response}`);
                return;
            }
            let info = response.info;
            if (!Array.isArray(info)) {
                logger.ton_layer_1.error('Received data is not array.');
                return;
            }
            info = info.filter(i => parseInt(i.type) === 0);

            logger.ton_layer_1.info(`LockRelay list ${info.length === 0 ? 'is empty.' : 'length: ' + info.length.toString()}`);

            for (let result of info) {
                let data = {
                    fromChain: this.chainName.toUpperCase(),
                    toChain: result.toChain,
                    fromAddr: result.fromAddr,
                    toAddr: result.toAddr,
                    token: result.token,
                    bytes32s: [this.govInfo.id, result.fromThash],
                    uints: [result.amount, result.decimals, result.lt],
                    data: result.data
                };

                const ton = this.ton;
                const govInfo = this.govInfo;

                let txHash = data.bytes32s[1];
                txHash = Buffer.from(txHash.replace("0x",""), 'hex').toString('base64');
                let lt = data.uints[2];

                let tx = await ton.getTransaction(govInfo.address, txHash, lt);
                if(!tx){
                    logger.ton_layer_1.error(`Skip relay ${data.bytes32s[1]}:${data.uints[2]}`);
                    continue;
                }

                if(!bridgeUtils.isValidAddress(data.toChain, data.toAddr)){
                    logger.ton_layer_1.error(`Invalid toAddress ( ${data.toChain}, ${data.toAddr} )`);
                    continue;
                }

                if(data.data && !bridgeUtils.isValidData(data.toChain, data.data)){
                    logger.ton_layer_1.error(`Invalid data ( ${data.toChain}, ${data.data} )`);
                    continue;
                }

                await this.validateRelayedData(data);
            }
        } catch (e) {
            logger.ton_layer_1.error(`lock-relay api error: ${e.message}`);
        } finally {
            this.intervalSet(this.intervals.getLockRelay);
        }
    }

    async validateRelayedData(data) {
        const chainIds = this.chainIds;
        const ton = this.ton;
        const addressBook = this.addressBook;
        const chainName = this.chainName;
        const govInfo = this.govInfo;
        const DEPOSIT_TOKEN = this.depositTokenABI;

        if(data.fromChain !== chainName){
            logger.ton_layer_1.error(`Invalid request. ${data.fromChain}`);
            return;
        }

        let vault = govInfo.address;
        let txHash = data.bytes32s[1];
        txHash = Buffer.from(txHash.replace("0x",""), 'hex').toString('base64');

        let lt = data.uints[2];
        if(lt.dcomp(UINT64_MAX) !== -1){
            logger.ton_layer_1.error(`Invalid logical time: ${lt}`);
            return;
        }

        let tx = await ton.getTransaction(vault, txHash, lt);
        if(!tx || !tx.data || !tx.transaction_id) {
            logger.ton_layer_1.error(`getTransaction error: ${txHash}, ${lt}`);
            return;
        }

        lt = tx.transaction_id.lt;
        if(!lt || lt.dcomp(UINT64_MAX) !== -1) {
            logger.ton_layer_1.error(`Invalid logical time from return value: ${lt}`);
            return;
        }

        let { description, inMessage } = await ton.parseTransaction(tx.data);
        if(!description || !description.computePhase || !description.actionPhase){
            logger.ton_layer_1.error(`Invalid description: ${txHash}, ${lt}`);
            return;
        }

        let computePhase = description.computePhase;
        if(!computePhase.success || parseInt(computePhase.exitCode) !== 0){
            logger.ton_layer_1.error(`ComputePhase fail: ${txHash}, ${lt}`);
            return;
        }

        let actionPhase = description.actionPhase;
        if(!actionPhase.success){
            logger.ton_layer_1.error(`ActionPhase fail: ${txHash}, ${lt}`);
            return;
        }

        if(!inMessage || !inMessage.body){
            logger.ton_layer_1.error(`parse inMessage error`);
            return;
        }

        let opCode;
        try {
            let msgBody = inMessage.body.beginParse();
            opCode = msgBody.readUint(32);
            opCode = `0x${opCode.toString('hex').padStart(8,"0")}`.toLowerCase();
        } catch (e) {}
        if(!opCode){
            logger.ton_layer_1.error(`parse opCode error`);
            return;
        }

        let out_msgs = tx.out_msgs;

        let toChain;
        let fromAddr;
        let toAddr;
        let token;
        let amount;
        let transfortData;
        let decimal;
        if(opCode === "0x00000000"){
            if(out_msgs && out_msgs.length !== 0){
                logger.ton_layer_1.error(`Invalid transaction. OutMessage exist: ${txHash}, ${lt}`);
                return;
            }

            let in_msg = tx.in_msg;
            if(!in_msg || in_msg.source === vault || in_msg.destination !== vault || in_msg['@type'] !== 'raw.message'){
                logger.ton_layer_1.error(`Invalid in_msg data. ${txHash}, ${lt}`);
                return;
            }

            let msg_data = in_msg.msg_data;
            if(msg_data['@type'] !== 'msg.dataText'){
                logger.ton_layer_1.error(`Invalid msg_data type. ${txHash}, ${lt}`);
                return;
            }

            fromAddr = await ton.getHashPart(in_msg.source);
            if(!fromAddr || fromAddr.length !== 66){
                logger.ton_layer_1.error(`Invalid from address. ${txHash}, ${lt}`);
                return;
            }

            let fee = tx.fee;
            if(isNaN(parseInt(fee)) || parseInt(fee) === 0){
                logger.ton_layer_1.error(`parse message fee error`);
                return;
            }

            amount = in_msg.value;
            if(!amount || amount === '0' || isNaN(parseInt(amount)) || amount.dcomp(fee) !== 1){
                logger.ton_layer_1.error(`Invalid amount ${amount} : ${fee}. ${txHash}, ${lt}`);
                return;
            }
            amount = amount.dsub(fee);

            let tag = in_msg.message;
            if(!tag){
                logger.ton_layer_1.error(`Null tag. ${txHash}, ${lt}`);
                return;
            }

            tag = tag.trim();
            if(!NumberFormat.test(tag) || isNaN(parseInt(tag)) || parseInt(tag) <= 100000000){
                logger.ton_layer_1.error(`Invalid tag. ${txHash}, ${lt}, ${tag}`);
                return;
            }

            let addrData = await addressBook.contract.methods.getTag(tag).call().catch(e => {return;});
            if(!addrData){
                logger.ton_layer_1.error(`Invalid tag. ${txHash}, ${lt}`);
                return;
            }

            toChain = addrData[0];
            toAddr = addrData[1];
            token = "0x0000000000000000000000000000000000000000";
            transfortData = addrData[2] || '0x';
            decimal = "9";
            if (!toAddr || toAddr.length === 0 || !toChain || toChain.length === 0) {
                logger.ton_layer_1.error(`toAddr or toChain is not defined. ${txHash}, ${lt}`);
                return;
            }

            const vaultInfo = await ton.getMultisigData(vault);
            if(!vaultInfo || !vaultInfo.pubkeys || !vaultInfo.required){
                logger.ton_layer_1.error(`getVaultInfo error. ${txHash}, ${lt}`);
                return;
            }
            const publicKeys = vaultInfo.pubkeys;
            const required = vaultInfo.required;

            let version = await addressBook.contract.methods.versionCount().call().catch(e => {});
            if(!version){
                logger.ton_layer_1.error(`getAddressBookVersionCount error.`);
                return;
            }

            const tagHash = Britto.sha256sol(packer.packTagHash({
                version,
                toChain,
                toAddress: toAddr,
                transfortData
            })).toString('hex').add0x();

            const validators = await addressBook.multisig.contract.methods.getHashValidators(tagHash).call();
            let confirmed = 0; // check validator address and public key
            for(let i = 0; i < validators.length; i++){
                let va = validators[i]
                const v = await addressBook.multisig.contract.methods.vSigs(tagHash, i).call().catch(e => logger.ton_layer_1.info(`validateSwap call mig fail. ${e}`));
                const r = await addressBook.multisig.contract.methods.rSigs(tagHash, i).call().catch(e => logger.ton_layer_1.info(`validateSwap call mig fail. ${e}`));
                const s = await addressBook.multisig.contract.methods.sSigs(tagHash, i).call().catch(e => logger.ton_layer_1.info(`validateSwap call mig fail. ${e}`));

                let recoveredAddr = Britto.ecrecoverHash(tagHash, v, r, s)
                let pubkey = await addressBook.multisig.contract.methods.publicKeys(recoveredAddr).call().catch(e => logger.ton_layer_1.info(`validateSwap call mig fail. ${e}`));
                if(va.toLowerCase() == recoveredAddr.toLowerCase() && publicKeys.includes(pubkey)) {
                    confirmed = confirmed + 1;
                }
            }
            if(confirmed < parseInt(required)) {
                logger.ton_layer_1.error(`validated address not matched in vault signer addresses. ${txHash}, ${lt}, ${tag}`);
                return;
            }
        }
        else if(opCode === "0x7362d09c"){
            if(!out_msgs || out_msgs.length === 0){
                logger.ton_layer_1.error(`Invalid transaction. empty out_msgs: ${txHash}, ${lt}`);
                return;
            }

            let res;
            for(let event of out_msgs){
                if(event.destination !== '') continue;
                if(!event.source || event.source !== vault) continue;
                if(!event.value || event.value !== '0') continue;
                if(!event.msg_data || !event.msg_data.body || event.msg_data['@type'] !== 'msg.dataRaw') continue;

                const slice = Slice.fromCell(Cell.fromBoc(Buffer.from(event.msg_data.body, 'base64'))[0]);
                let opCode = null
                try {
                    opCode = "0x"+slice.readUint(32).toString('hex'); // BN return
                } catch (e) {}
                if(!opCode || opCode !== "0x7362d09c") continue;

                let obj = {};
                for (let i=1; i< DEPOSIT_TOKEN.data.length;i++) {
                    let list = DEPOSIT_TOKEN.data[i];
                    let child = slice.readRef();
                    for (let o of list) {
                        let value;
                        if (o.type === "address") {
                            value = child.readAddress()?.toFriendly();
                        } else {
                            value = child.readUint(Number(o.type.split('uint')[1]));
                        }

                        switch (o.value) {
                            case 'string':
                                value = Buffer.from(value.toString(16), 'hex').toString()
                                break;
                            case 'hex':
                                let length = parseInt(parseInt(o.type.replace("uint","")) / 4);
                                value = "0x"+value.toString(16).padStart(length, 0);
                                break;
                            case 'uint32':
                                value = value.toString()
                                break;
                            case 'number':
                                value = Number(value.toNumber())
                                break;
                        }

                        if (o.name.endsWith('[]')) {
                            let n = o.name.split('[]')[0]
                            if (!obj[n])
                                obj[n] = []
                            obj[n].push(value)
                        } else if (o.name.endsWith('{}')) {
                            let n = o.name.split('{}}')[0]
                            obj[n] = value
                        } else {
                            obj[o.name] = value;
                        }
                    }
                }

                if(lt.dcomp(obj.depositId) !== 0) continue;
                res = obj;
            }
            if(!res) {
                logger.ton_layer_1.error(`Invalid Transaction : ${txHash}, ${lt}`);
                return;
            }

            for(let chain in chainIds){
                if(chainIds[chain] !== res.toChain) continue;
                toChain = chain;
                break;
            }
            if(!toChain){
                logger.ton_layer_1.error(`Invalid toChainId in event: ${txHash}, ${lt}, ${res.toChain}`);
                return;
            }

            toAddr = res.toAddr;
            if(!toAddr){
                logger.ton_layer_1.error(`Invalid toAddr in event: ${txHash}, ${lt}, ${res.toAddr}`);
                return;
            }

            fromAddr = res.fromAddr;
            if(!fromAddr || fromAddr.length !== 66){
                logger.ton_layer_1.error(`Invalid fromAddr in event: ${txHash}, ${lt}, ${res.fromAddr}`);
                return;
            }

            token = res.token;
            if(!token || token.length !== 42){
                logger.ton_layer_1.error(`Invalid token in event: ${txHash}, ${lt}, ${res.token}`);
                return;
            }

            amount = res.amount;
            if(!amount || parseInt(amount) == 0){
                logger.ton_layer_1.error(`Invalid amount in event: ${txHash}, ${lt}, ${res.amount}`);
                return;
            }

            decimal = res.decimal;
            if(!decimal){
                logger.ton_layer_1.error(`Invalid decimal: ${txHash}, ${lt}, ${decimal}`);
                return;
            }

            transfortData = "0x";
        }
        else{
            logger.ton_layer_1.error(`Invalid op code : ${opCode}`);
            return;
        }

        let currentBlock = await ton.getCurrentBlock().catch(e => {});
        if (!currentBlock){
            logger.ton_layer_1.error('getBlockNumber() execute error');
            return;
        }

        let txBlock = await ton.getTransactionBlock(vault, lt).catch(e => {});
        if (!txBlock){
            logger.ton_layer_1.error('getTransactionBlock() execute error');
            return;
        }

        let isConfirmed = parseInt(currentBlock) - parseInt(txBlock) >= config.system.tonConfirmCount;
        if(!isConfirmed){
            logger.ton_layer_1.error(`depositId(${data.uints[2]}) is invalid. isConfirmed: ${isConfirmed}`);
            return;
        }

        let params = {
            fromChain: chainName,
            toChain: toChain,
            fromAddr: fromAddr,
            toAddr: toAddr,
            token: token,
            bytes32s: [govInfo.id, data.bytes32s[1]],
            uints: [amount, decimal, lt],
            data: transfortData
        };

        const toInstance = instances[params.toChain.toLowerCase()];
        if(!toInstance) {
            logger.ton_layer_1.error(`${params.toChain} instance is not exist`);
            return;
        }
        await toInstance.validateSwap(data, params);
    }

    async validateSwap(_, params){
        const validator = {address: this.account.address, pk: this.account.pk};

        const chainIds = this.chainIds;
        const chainName = this.chainName;
        const govInfo = this.govInfo;
        const hashMap = this.hashMap;
        const multisigABI = this.multisigABI;

        if(chainName !== params.toChain){
            logger.ton_layer_1.error(`Invalid toChain. ${chainName} : ${params.toChain}`);
            return;
        }

        if(!this.isValidAddress(params.toAddr)){
            logger.ton_layer_1.error(`Invalid toAddr. ${params.toAddr}`);
            return;
        }

        if(params.token === "0x0000000000000000000000000000000000000000" && !this.isValidData(params.data)){
            logger.ton_layer_1.error(`Invalid data. ${params.data}`);
            return;
        }

        await valid(params, chainIds, this.orbitHub);

        async function valid(data, chainIds, orbitHubAddress) {
            let fromChainId = chainIds[data.fromChain];
            let toChainId = chainIds[data.toChain];
            if(!fromChainId || !toChainId){
                logger.ton_layer_1.error(`Cannot get chainId. ${data.fromChain}, ${data.toChain}`);
                return;
            }

            let swapData = {
                hubContract: orbitHubAddress,
                fromChainId: fromChainId,
                toChainId: toChainId,
                fromAddr: data.fromAddr,
                toAddr: data.toAddr,
                token: data.token,
                bytes32s: data.bytes32s,
                uints: data.uints,
                data: data.data,
            }

            let hashA = Britto.sha256sol(packer.packSwapDataA(swapData)).toString('hex').add0x();
            let hashB = Britto.sha256sol(packer.packSwapDataB(swapData)).toString('hex').add0x();
            let hashC = Britto.sha256sol(packer.packSwapDataC(swapData)).toString('hex').add0x();
            let hashD = Britto.sha256sol(packer.packSwapDataD(swapData)).toString('hex').add0x();

            let hash1 = Britto.sha256sol(packer.packSigHash({hash1: hashA, hash2: hashB}));
            let hash2 = Britto.sha256sol(packer.packSigHash({hash1: hashC, hash2: hashD}));

            let hash = Britto.sha256sol(packer.packSigHash({hash1, hash2}));
            if(hashMap.has(hash.toString('hex').add0x())){
                logger.ton_layer_1.error(`Already signed. validated swapHash: ${hash.toString('hex').add0x()}`);
                return;
            }

            let res = await api.orbit.get(`/info/hash-info`, {whash: hash.toString('hex').add0x()});
            if(res.status === "success") {
                if(res.data.validators) {
                    for(var i = 0; i < res.data.validators.length; i++){
                        if(res.data.validators[i].toLowerCase() === validator.address.toLowerCase()){
                            logger.ton_layer_1.error(`Already signed. validated swapHash: ${hash}`);
                            return;
                        }
                    }
                }

                let ecSig = Britto.signMessage(hash, validator.pk);
                let edSig = Britto.signEd25519(hash, validator.pk);
                let sigs = TONLayer1Validator.makeSigsWithED(validator.address, ecSig, edSig);
                sigs[1] = parseInt(sigs[1],16)
    
                await api.validator.post(`/governance/validate`, {
                    from_chain: data.fromChain,
                    to_chain: data.toChain,
                    from_chain_id: fromChainId,
                    to_chain_id: toChainId,
                    from_addr: data.fromAddr,
                    to_addr: data.toAddr,
                    token: data.token,
                    bytes32s: data.bytes32s,
                    uints: data.uints,
                    data: data.data,
                    hash,
                    v: sigs[1],
                    r: sigs[2],
                    s: sigs[3],
                    ed_r: sigs[4],
                    ed_s: sigs[5]
                });
    
                hashMap.set(hash.toString('hex').add0x(), {
                    txHash: hash,
                    timestamp: parseInt(Date.now() / 1000),
                })
            }
        }
    }

    isValidAddress(toAddr) {
        return toAddr.slice(0,2) === "0x" && toAddr.length == 66;
    }

    isValidData(data) {
        return Buffer.from(data.replace("0x",""),'hex').length < 124;
    }

    async getTagRelay() {
        this.intervalClear(this.intervals.getTagRelay);

        try {
            const response = await api.bible.get("/v1/api/ton/tag-relay");
            if (response.result !== "success") {
                logger.ton_layer_1.error(`tag-relay api error: ${response}`);
                return;
            }
            let info = response.info;
            if (!Array.isArray(info)) {
                logger.ton_layer_1.error('Received data is not array.');
                return;
            }

            logger.ton_layer_1.info(`TagRelay list ${info.length === 0 ? 'is empty.' : 'length: ' + info.length.toString()}`);

            for (let result of info) {
                let data = {
                    toChain: result.to_chain,
                    toAddr: result.to_address,
                    data: result.data
                };

                if(!bridgeUtils.isValidAddress(data.toChain, data.toAddr)){
                    logger.ton_layer_1.error(`Invalid toAddress ( ${data.toChain}, ${data.toAddr} )`);
                    continue;
                }

                if(data.data && !bridgeUtils.isValidData(data.toChain, data.data)){
                    logger.ton_layer_1.error(`Invalid data ( ${data.toChain}, ${data.data} )`);
                    continue;
                }

                await this.validateTagRequest(data);
            }
        } catch (e) {
            logger.ton_layer_1.error(`tag-relay api error: ${e.message}`);
        } finally {
            this.intervalSet(this.intervals.getTagRelay);
        }
    }

    async validateTagRequest(data) {

        const addressBook = this.addressBook;
        const chainName = this.chainName;


        let toChain = data.toChain;
        if(!toChain || toChain.length === 0 || toChain.toLowerCase() === chainName.toLowerCase()) {
            logger.ton_layer_1.error(`validateTagRequest error: invalid toChain ${toChain}`);
            return;
        }

        let toAddress = data.toAddr;
        if (!toAddress || toAddress.length === 0) {
            logger.ton_layer_1.error(`validateTagRequest error: toAddr or toChain is not defined.`);
            return;
        }

        if(!instances[toChain.toLowerCase()] || !instances[toChain.toLowerCase()].isValidAddress(toAddress)){
            logger.ton_layer_1.error(`Invalid toAddress ( ${toChain}, ${toAddress} )`);
            return;
        }

        let transfortData = data.data || '0x';

        let version = await addressBook.contract.methods.versionCount().call().catch(e => {});
        if(!version){
            logger.ton_layer_1.error(`getAddressBookVersionCount error.`);
            return;
        }

        let packerData = {
            version,
            toChain,
            toAddress,
            transfortData
        };

        let tagHash = Britto.sha256sol(packer.packTagHash(packerData));
 
        const validator = {address: this.account.address, pk: this.account.pk};
        let validators = await api.orbit.get(`/info/tag-signatures`, {
            version,
            chain: "TON",
            to_chain: toChain,
            to_address: toAddress
        });
        
        for(let v of validators.data) {
            if(v.validator.toLowerCase() === validator.address.toLowerCase()) {
                logger.ton_layer_1.error(`Already signed. validated tagHash: ${tagHash}`);
                return;
            }
        }

        let signature = Britto.signMessage(tagHash, validator.pk);
        signature.v = parseInt(signature.v, 16)

        await api.validator.post(`/governance/validate-tag`, {
            version,
            chain: "TON",
            to_chain: packerData.toChain,
            to_addr: packerData.toAddress,
            data: packerData.transfortData,
            validator: validator.address,
            hash: tagHash,
            v: signature.v,
            r: signature.r,
            s: signature.s
        });
    }

    ///////////////////////////////////////////////////////////////
    ///////// Governance Function
    async getTransaction(transactionId, decoder) {
        const ton = this.ton;
        const govInfo = this.govInfo;
        const info = config.info[this.chainLower];
        const chainName = this.chainName;

        let transactionAddress = await ton.getTransactionAddress(this.tonMultisig, transactionId);
        if(!transactionAddress) return "GetTransactionContract Error";

        let transaction = await ton.getTransactionData(transactionAddress);
        if(!transaction) return "GetTransactionData Error";

        let knownContract = info.CONTRACT_ADDRESS;

        let destinationContract = "Unknown Contract";
        for (var key in knownContract){
            let addr = knownContract[key];
            if(!addr) continue;

            if(addr.toLowerCase() === transaction.destination.toLowerCase()){
                destinationContract = key;
                break;
            }
        }
        if(chainName === govInfo.chain && transaction.destination.toLowerCase() === govInfo.address.toLowerCase()){
            destinationContract = `${govInfo.chain} Vault`;
        }
        transaction.destinationContract = destinationContract;

        return transaction;
    }

    async confirmTransaction(transactionId, gasPrice, chainId) {
        const ton = this.ton;
        const chainName = this.chainName;
        const account = this.account;
        const address = monitor.address[chainName].address;

        let transactionAddress = await ton.getTransactionAddress(this.tonMultisig, transactionId);
        if(!transactionAddress) return "GetTransactionContract Error";

        let transactionConfig = await ton.getTransactionConfig(transactionAddress);
        if(!transactionConfig) return "GetTransactionConfig Error";

        let { required, confirmation, confirmedValidators } = transactionConfig;

        let myConfirmation = !!(confirmedValidators.find(va => va.toLowerCase() === address.toLowerCase()));
        if(myConfirmation || parseInt(required) === parseInt(confirmedValidators.length)) return "Already Confirmed"

        let seq;
        try {
            seq = await ton.confirmTransaction(account.pk, this.tonMultisig, parseInt(transactionId));
        } catch(e) {
            return "SendTransaction Error";
        }
        if(isNaN(parseInt(seq))) return "SendTransaction Error";

        return `Confirm transactionId ${transactionId} seq : ${seq}`;
    }
    ///////////////////////////////////////////////////////////////
}

module.exports = TONLayer1Validator;
