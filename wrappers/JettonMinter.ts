// https://github.com/EmelyanenkoK/modern_jetton/blob/master/wrappers/JettonMinter.ts

import {
    Address,
    Cell,
    beginCell,
    Contract,
    contractAddress,
    ContractProvider,
    Sender,
    SendMode,
    toNano,
} from '@ton/core';

export type JettonMinterContent = {
    type: 0 | 1;
    uri: string;
};
export type JettonMinterConfig = { admin: Address; content: Cell; walletCode: Cell };

export function jettonMinterConfigToCell(config: JettonMinterConfig): Cell {
    return beginCell()
        .storeCoins(0)
        .storeAddress(config.admin)
        .storeRef(config.content)
        .storeRef(config.walletCode)
        .endCell();
}

export function jettonContentToCell(content: JettonMinterContent) {
    return beginCell()
        .storeUint(content.type, 8)
        .storeStringTail(content.uri) //Snake logic under the hood
        .endCell();
}

export class JettonMinter implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new JettonMinter(address);
    }

    static createFromConfig(config: JettonMinterConfig, code: Cell, workchain = 0) {
        const data = jettonMinterConfigToCell(config);
        const init = { code, data };
        return new JettonMinter(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    static mintMessage(to: Address, jettonAmount: bigint, forwardTonAmount: bigint, totalTonAmount: bigint) {
        return beginCell()
            .storeUint(0x1674b0a0, 32)
            .storeUint(0, 64) // op, queryId
            .storeAddress(to)
            .storeCoins(jettonAmount)
            .storeCoins(forwardTonAmount)
            .storeCoins(totalTonAmount)
            .endCell();
    }

    async sendMint(
        provider: ContractProvider,
        via: Sender,
        params: {
            to: Address;
            jettonAmount: bigint;
            forwardTonAmount: bigint;
            totalTonAmount: bigint;
        },
    ) {
        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: JettonMinter.mintMessage(
                params.to,
                params.jettonAmount,
                params.forwardTonAmount,
                params.totalTonAmount,
            ),
            value: params.totalTonAmount + toNano('0.05'),
        });
    }

    /* provide_wallet_address#2c76b973 query_id:uint64 ownerAddress:MsgAddress include_address:Bool = InternalMsgBody;
     */
    static discoveryMessage(owner: Address, includeAddress: boolean) {
        return beginCell()
            .storeUint(0x2c76b973, 32)
            .storeUint(0, 64) // op, queryId
            .storeAddress(owner)
            .storeBit(includeAddress)
            .endCell();
    }

    async sendDiscovery(
        provider: ContractProvider,
        via: Sender,
        owner: Address,
        includeAddress: boolean,
        value: bigint = toNano('0.1'),
    ) {
        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: JettonMinter.discoveryMessage(owner, includeAddress),
            value: value,
        });
    }

    static changeAdminMessage(newOwner: Address) {
        return beginCell()
            .storeUint(0x4840664f, 32)
            .storeUint(0, 64) // op, queryId
            .storeAddress(newOwner)
            .endCell();
    }

    async sendChangeAdmin(provider: ContractProvider, via: Sender, newOwner: Address) {
        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: JettonMinter.changeAdminMessage(newOwner),
            value: toNano('0.1'),
        });
    }
    static changeContentMessage(content: Cell) {
        return beginCell()
            .storeUint(0x5773d1f5, 32)
            .storeUint(0, 64) // op, queryId
            .storeRef(content)
            .endCell();
    }

    async sendChangeContent(provider: ContractProvider, via: Sender, content: Cell) {
        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: JettonMinter.changeContentMessage(content),
            value: toNano('0.1'),
        });
    }
    async getWalletAddress(provider: ContractProvider, owner: Address): Promise<Address> {
        const res = await provider.get('get_wallet_address', [
            { type: 'slice', cell: beginCell().storeAddress(owner).endCell() },
        ]);
        return res.stack.readAddress();
    }

    async getJettonData(provider: ContractProvider) {
        let res = await provider.get('get_jetton_data', []);
        let totalSupply = res.stack.readBigNumber();
        let mintable = res.stack.readBoolean();
        let adminAddress = res.stack.readAddress();
        let content = res.stack.readCell();
        let walletCode = res.stack.readCell();
        return {
            totalSupply,
            mintable,
            adminAddress,
            content,
            walletCode,
        };
    }

    async getTotalSupply(provider: ContractProvider) {
        let res = await this.getJettonData(provider);
        return res.totalSupply;
    }
    async getAdminAddress(provider: ContractProvider) {
        let res = await this.getJettonData(provider);
        return res.adminAddress;
    }
    async getContent(provider: ContractProvider) {
        let res = await this.getJettonData(provider);
        return res.content;
    }
}
