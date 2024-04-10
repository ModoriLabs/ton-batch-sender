import {
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Dictionary,
    DictionaryValue,
    Sender,
    SendMode,
} from '@ton/core';
import { crc32 } from '../utils/crc32';

export type BatchSenderConfig = {
    oneTimeFee: bigint;
    perUserFee: bigint;
    maxFreeUserCount: number;
    adminAddress: Address;
    feeReceiverAddress: Address;
};

export function senderConfigToCell(config: BatchSenderConfig): Cell {
    return beginCell()
        .storeCoins(config.oneTimeFee)
        .storeCoins(config.perUserFee)
        .storeUint(config.maxFreeUserCount, 256)
        .storeAddress(config.adminAddress)
        .storeAddress(config.feeReceiverAddress)
        .endCell();
}

export const SenderOpCodes = {
    sendTon: crc32('send_ton'),
    send: crc32('send'),
    setOneTimeFee: crc32('set_one_time_fee'),
    setPerUserFee: crc32('set_per_user_fee'),
    setFeeReceiverAddress: crc32('set_fee_receiver_address')
};

export function createMessageValues(): DictionaryValue<{ to: Address; amount: bigint }> {
    return {
        serialize: (src, buidler) => {
            buidler.storeAddress(src.to).storeCoins(src.amount);
        },
        parse: (src) => {
            return { to: src.loadAddress(), amount: src.loadCoins() };
        },
    };
}

export class BatchSender implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new BatchSender(address);
    }

    static createFromConfig(config: BatchSenderConfig, code: Cell, workchain = 0) {
        const data = senderConfigToCell(config);
        const init = { code, data };
        return new BatchSender(contractAddress(workchain, init), init);
    }

    async getBalance(provider: ContractProvider) {
        const res = await provider.getState();
        return res.balance;
    }

    async getStorage(provider: ContractProvider) {   
        const res = await provider.get('get_storage', []);

        return {
            oneTimeFee: res.stack.readBigNumber(),
            perUserFee: res.stack.readBigNumber(),
            maxFreeUserCount: res.stack.readBigNumber(),
            adminAddress: res.stack.readAddress(),
            feeReceiverAddress: res.stack.readAddress(),
        }
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    static buildSendPayload(messages: { to: Address; amount: bigint }[]) {
        const messagesDict = Dictionary.empty(Dictionary.Keys.Uint(64), createMessageValues());

        messages.forEach((message, index) => {
            messagesDict.set(index, message);
        });

        return beginCell()
            .storeUint(SenderOpCodes.send, 32) // OpCode
            .storeUint(0, 64) // QueryId
            .storeDict(messagesDict)
            .storeUint(0, 32) // fee_type
            .endCell();
    }

    async getCost(provider: ContractProvider, len: number, type: number) {
        let res = await provider.get('get_cost', [
            {
                type: 'int',
                value: BigInt(len),
            },
            {
                type: 'int',
                value: BigInt(type),
            },
        ]);
        return res.stack.readBigNumber();
    }

    async sendSetOneTimeFee(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        oneTimeFee: bigint,
    ){
        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(SenderOpCodes.setOneTimeFee, 32)
                .storeUint(0n, 64) // query_id
                .storeCoins(oneTimeFee)
                .endCell(),
            value: value,
        });
    }

    async sendSetPerUserFee(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        perUserFee: bigint,
    ){
        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(SenderOpCodes.setPerUserFee, 32)
                .storeUint(0n, 64) // query_id
                .storeCoins(perUserFee)
                .endCell(),
            value: value,
        });
    }

    async sendSetFeeReceiverAddress(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        feeReceiverAddress: Address,
    ){
        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(SenderOpCodes.setFeeReceiverAddress, 32)
                .storeUint(0n, 64) // query_id
                .storeAddress(feeReceiverAddress)
                .endCell(),
            value: value,
        });
    }
}
