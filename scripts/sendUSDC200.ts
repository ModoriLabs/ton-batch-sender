import { NetworkProvider } from '@ton/blueprint';
import { deployments } from '../utils/deployments';
import { JettonMinter } from '../wrappers/JettonMinter';
import { JettonWallet } from '../wrappers/JettonWallet';
import { Cell, toNano } from '@ton/core';
import { BatchSender } from '../wrappers/BatchSender';
import _ from 'lodash';

export async function run(provider: NetworkProvider) {
    const user = provider.sender();

    if (!user.address) {
        return;
    }

    const batchSenderDeployments = await deployments.read('BatchSender', provider.network());
    const usdcDeployments = await deployments.read('USDC', provider.network());
    const usdcContract = provider.open(JettonMinter.createFromAddress(usdcDeployments.address));

    const jettoWalletAddress = await usdcContract.getWalletAddress(user.address);
    const jettonWallet = provider.open(JettonWallet.createFromAddress(jettoWalletAddress));

    const messages = _.times(200, () => {
        return {
            to: user.address!,
            amount: toNano(_.random(0.1, 2)),
        };
    });

    const expectedRequiredGas = toNano(0.05) * BigInt(messages.length);
    const expectedServiceFee = toNano(1);

    const tx = await jettonWallet.sendTransfer(user, toNano(2) + expectedRequiredGas + expectedServiceFee, {
        jettonAmount: messages.reduce((acc, m) => acc + m.amount, 0n),
        to: batchSenderDeployments.address,
        responseAddress: user.address,
        customPayload: Cell.EMPTY,
        forwardTonAmount: toNano(1) + expectedRequiredGas + expectedServiceFee,
        forwardPayload: BatchSender.buildSendPayload(messages),
    });
}
