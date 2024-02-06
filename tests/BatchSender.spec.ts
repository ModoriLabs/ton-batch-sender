import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, beginCell, toNano } from '@ton/core';
import { BatchSender } from '../wrappers/BatchSender';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { JettonWallet } from '../wrappers/JettonWallet';
import jettonFixture, { JettonFixture } from './fixtures/jetton';

describe('Sender', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('BatchSender');
    });

    let blockchain: Blockchain;
    let alice: SandboxContract<TreasuryContract>,
        bob: SandboxContract<TreasuryContract>,
        carlie: SandboxContract<TreasuryContract>;
    let batchSender: SandboxContract<BatchSender>;
    let jetton: SandboxContract<JettonFixture>;
    let senderJettonWallet: SandboxContract<JettonWallet>;
    let aliceJettonWallet: SandboxContract<JettonWallet>;
    let bobJettonWallet: SandboxContract<JettonWallet>;
    let carlieJettonWallet: SandboxContract<JettonWallet>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        batchSender = blockchain.openContract(BatchSender.createFromConfig({}, code));
        alice = await blockchain.treasury('alice');
        bob = await blockchain.treasury('bob');
        carlie = await blockchain.treasury('carlie');

        await batchSender.sendDeploy(alice.getSender(), toNano('0.05'));

        jetton = jettonFixture(blockchain, {
            deployer: alice,
            content: beginCell().storeUint(1, 8).endCell(),
        });
        await jetton.jettonMinter.sendDeploy(alice.getSender(), toNano('1'));

        [senderJettonWallet, aliceJettonWallet, bobJettonWallet, carlieJettonWallet] = await Promise.all(
            [batchSender, alice, bob, carlie].map(async (contract) => {
                const wallet = await jetton.userWallet(contract.address);

                await wallet.sendDeploy(alice.getSender(), toNano('1'));

                return wallet;
            }),
        );

        await jetton.jettonMinter.sendMint(alice.getSender(), {
            to: alice.address,
            jettonAmount: toNano('100000'),
            forwardTonAmount: toNano('0.05'),
            totalTonAmount: toNano('1'),
        });
    });

    it('test_send_2', async () => {
        const aliceBalance = await aliceJettonWallet.getJettonBalance();
        const bobAmount = toNano(1);
        const carlieAmount = toNano(0.1);
        const aliceTonBalance = await alice.getBalance();
        const totalTonAmount = toNano(4);

        const tx = await aliceJettonWallet.sendTransfer(alice.getSender(), totalTonAmount, {
            jettonAmount: bobAmount + carlieAmount,
            to: batchSender.address,
            responseAddress: alice.address,
            customPayload: Cell.EMPTY,
            forwardTonAmount: totalTonAmount - toNano('1'),
            forwardPayload: BatchSender.buildSendPayload([
                {
                    to: bob.address,
                    amount: bobAmount,
                },
                {
                    to: carlie.address,
                    amount: carlieAmount,
                },
            ]),
        });

        expect(tx.transactions).toHaveTransaction({
            from: alice.address,
            to: aliceJettonWallet.address,
            success: true,
        });

        // Jetton Transfer (Alice => BatchSender)
        expect(tx.transactions).toHaveTransaction({
            from: aliceJettonWallet.address,
            to: senderJettonWallet.address,
            success: true,
        });

        // Jetton Transfer Notification
        expect(tx.transactions).toHaveTransaction({
            from: senderJettonWallet.address,
            to: batchSender.address,
            success: true,
        });

        // Jetton Transfer
        expect(tx.transactions).toHaveTransaction({
            from: batchSender.address,
            to: senderJettonWallet.address,
            success: true,
        });

        expect(tx.transactions).toHaveTransaction({
            from: senderJettonWallet.address,
            to: bobJettonWallet.address,
            success: true,
        });

        expect(tx.transactions).toHaveTransaction({
            from: senderJettonWallet.address,
            to: carlieJettonWallet.address,
            success: true,
        });

        // Gas refund
        expect(tx.transactions).toHaveTransaction({
            from: batchSender.address,
            to: alice.address,
            success: true,
        });

        expect(await senderJettonWallet.getJettonBalance()).toEqual(0n);
        expect(await aliceJettonWallet.getJettonBalance()).toEqual(aliceBalance - bobAmount - carlieAmount);
        expect(await bobJettonWallet.getJettonBalance()).toEqual(bobAmount);
        expect(await carlieJettonWallet.getJettonBalance()).toEqual(carlieAmount);

        const afterAliceTonBalance = await alice.getBalance();
        expect(aliceTonBalance - afterAliceTonBalance).toBeLessThan(totalTonAmount);
    });

    it('test_send_random', async () => {});
});
