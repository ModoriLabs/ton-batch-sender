import { toNano } from '@ton/core';
import { BatchSender } from '../wrappers/BatchSender';
import { deployments } from '../utils/deployments';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const sender = provider.sender().address;
    if (!sender) {
        throw new Error('Admin address is not specified');
    }

    const batchSender = provider.open(
        BatchSender.createFromConfig(
            {
                oneTimeFee: toNano(1),
                perUserFee: toNano(1),
                maxFreeUserCount: 10,
                adminAddress: sender,
                feeReceiverAddress: sender,
            },
            await compile('BatchSender'),
        ),
    );

    await batchSender.sendDeploy(provider.sender(), toNano('0.5'));

    await provider.waitForDeploy(batchSender.address);

    await deployments.save({
        ...batchSender,
        name: 'BatchSender',
        contract: 'BatchSender',
        deployer: sender,
        network: provider.network(),
    });
}
