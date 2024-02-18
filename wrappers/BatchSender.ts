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
    oneTimeFee: bigint,
    perUserFee: bigint,
    maxFreeUserCount: number,
};

export function senderConfigToCell(config: BatchSenderConfig): Cell {
    return beginCell()
        .storeCoins(config.oneTimeFee)
        .storeCoins(config.perUserFee)
        .storeUint(config.maxFreeUserCount, 256)
        .endCell();
}

export const SenderOpCodes = {
    sendTon: crc32('send_ton'),
    send: crc32('send'),
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
            .endCell();
    }

    async getCost(provider: ContractProvider, len: number, type: number) {
        let res = await provider.get('get_cost', [
            {
                type: 'int', value: BigInt(len)
            },
            { 
                type: 'int', value: BigInt(type)
            }
        ]);
        return res.stack.readBigNumber();
    }

}
