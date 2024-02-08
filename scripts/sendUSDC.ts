import { NetworkProvider } from '@ton/blueprint';
import { deployments } from '../utils/deployments';
import { JettonMinter } from '../wrappers/JettonMinter';
import { JettonWallet } from '../wrappers/JettonWallet';
import { Address, Cell, toNano } from '@ton/core';
import { BatchSender } from '../wrappers/BatchSender';

export async function run(provider: NetworkProvider) {
    const user = provider.sender();

    if (!user.address) {
        throw new Error('User address is not specified');
    }

    const batchSenderDeployments = await deployments.read('BatchSender', provider.network());
    const usdcDeployments = await deployments.read('USDC', provider.network());
    const usdcContract = provider.open(JettonMinter.createFromAddress(usdcDeployments.address));

    const jettoWalletAddress = await usdcContract.getWalletAddress(user.address);
    const jettonWallet = provider.open(JettonWallet.createFromAddress(jettoWalletAddress));

    const tx = await jettonWallet.sendTransfer(user, toNano(3), {
        jettonAmount: toNano(2),
        to: batchSenderDeployments.address,
        responseAddress: user.address,
        customPayload: Cell.EMPTY,
        forwardTonAmount: toNano(2),
        forwardPayload: BatchSender.buildSendPayload([
            {
                to: Address.parse('0QC_j7TGLvUuMES-UDWltWvuXzMLAptpbuasLEFnA4n0oQSS'),
                amount: toNano(1),
            },
            {
                to: Address.parse('0QDgBPs0Cal8hCoLCEbQ0Gncl_p0N5O_hfLO2oNTUBYVzwyq'),
                amount: toNano(1),
            },
        ]),
    });
}
