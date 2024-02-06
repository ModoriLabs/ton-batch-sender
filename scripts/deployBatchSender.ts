import { toNano } from '@ton/core';
import { BatchSender } from '../wrappers/BatchSender';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const batchSender = provider.open(BatchSender.createFromConfig({}, await compile('OneClickSender')));

    await batchSender.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(batchSender.address);

    // run methods on `oneClickSender`
}
