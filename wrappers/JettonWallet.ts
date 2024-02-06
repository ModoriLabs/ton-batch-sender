// https://github.com/EmelyanenkoK/modern_jetton/blob/master/wrappers/JettonWallet.ts
// https://github.com/Gusarich/fundraiser/blob/master/wrappers/JettonWallet.ts
import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export const JettonOpCodes = {
    transfer: 0xf8a7ea5,
    transferNotification: 0x7362d09c,
    internalTransfer: 0x178d4519,
    excesses: 0xd53276db,
    burn: 0x595f07bc,
    burnNotification: 0x7bdd97de,
    mint: 21,
};

export type JettonWalletConfig = {
    owner: Address;
    minter: Address;
    walletCode: Cell;
};

// https://github.com/ton-blockchain/token-contract/blob/main/ft/jetton-wallet.fc#L34-L36
export function jettonWalletConfigToCell(config: JettonWalletConfig): Cell {
    return beginCell()
        .storeCoins(0) // balance
        .storeAddress(config.owner) // ownerAddress
        .storeAddress(config.minter) // jetton_master_address
        .storeRef(config.walletCode) // jetton_wallet_code
        .endCell();
}

export class JettonWallet implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new JettonWallet(address);
    }

    static createFromConfig(config: JettonWalletConfig, code: Cell, workchain = 0) {
        const data = jettonWalletConfigToCell(config);
        const init = { code, data };
        return new JettonWallet(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async getJettonBalance(provider: ContractProvider) {
        let state = await provider.getState();
        if (state.state.type !== 'active') {
            return 0n;
        }
        let res = await provider.get('get_wallet_data', []);
        return res.stack.readBigNumber();
    }

    static transferMessage(
        jettonAmount: bigint,
        to: Address,
        responseAddress: Address,
        customPayload: Cell,
        forwardTonAmount: bigint,
        forwardPayload: Cell,
    ) {
        return beginCell()
            .storeUint(JettonOpCodes.transfer, 32)
            .storeUint(0, 64)
            .storeCoins(jettonAmount)
            .storeAddress(to)
            .storeAddress(responseAddress)
            .storeMaybeRef(customPayload)
            .storeCoins(forwardTonAmount)
            .storeMaybeRef(forwardPayload)
            .endCell();
    }

    async sendTransfer(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        params: {
            jettonAmount: bigint;
            to: Address;
            responseAddress: Address;
            customPayload: Cell;
            forwardTonAmount: bigint;
            forwardPayload: Cell;
        },
    ) {
        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: JettonWallet.transferMessage(
                params.jettonAmount,
                params.to,
                params.responseAddress,
                params.customPayload,
                params.forwardTonAmount,
                params.forwardPayload,
            ),
            value: value,
        });
    }

    static burnMessage(jettonAmount: bigint, responseAddress: Address, customPayload: Cell) {
        return beginCell()
            .storeUint(JettonOpCodes.burn, 32)
            .storeUint(0, 64) // op, queryId
            .storeCoins(jettonAmount)
            .storeAddress(responseAddress)
            .storeMaybeRef(customPayload)
            .endCell();
    }

    async sendBurn(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        jettonAmount: bigint,
        responseAddress: Address,
        customPayload: Cell,
    ) {
        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: JettonWallet.burnMessage(jettonAmount, responseAddress, customPayload),
            value: value,
        });
    }
}
