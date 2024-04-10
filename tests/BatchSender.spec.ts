import { Blockchain, SandboxContract, TreasuryContract, printTransactionFees } from '@ton/sandbox';
import { Cell, beginCell, toNano } from '@ton/core';
import { BatchSender } from '../wrappers/BatchSender';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { JettonWallet } from '../wrappers/JettonWallet';
import jettonFixture, { JettonFixture } from './fixtures/jetton';
import _ from 'lodash';

describe('Sender', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('BatchSender');
    });

    let blockchain: Blockchain;
    let alice: SandboxContract<TreasuryContract>,
        bob: SandboxContract<TreasuryContract>,
        carlie: SandboxContract<TreasuryContract>,
        feeReceiver: SandboxContract<TreasuryContract>;
    let batchSender: SandboxContract<BatchSender>;
    let jetton: SandboxContract<JettonFixture>;
    let senderJettonWallet: SandboxContract<JettonWallet>;
    let aliceJettonWallet: SandboxContract<JettonWallet>;
    let bobJettonWallet: SandboxContract<JettonWallet>;
    let carlieJettonWallet: SandboxContract<JettonWallet>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        alice = await blockchain.treasury('alice');
        bob = await blockchain.treasury('bob');
        carlie = await blockchain.treasury('carlie');
        feeReceiver = await blockchain.treasury('feeReceiver');

        batchSender = blockchain.openContract(
            BatchSender.createFromConfig(
                {
                    oneTimeFee: toNano('10'),
                    perUserFee: toNano('10'),
                    maxFreeUserCount: 10,
                    adminAddress: alice.address,
                    feeReceiverAddress: feeReceiver.address,
                },
                code,
            ),
        );

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

    it('test_refund_case_when_msg_value_is_lower_than_required', async () => {
        const aliceBalance = await aliceJettonWallet.getJettonBalance();
        const aliceTonBalance = await alice.getBalance();
        const bobBalance = await bobJettonWallet.getJettonBalance();
        const carlieBalance = await carlieJettonWallet.getJettonBalance();

        const tx = await aliceJettonWallet.sendTransfer(alice.getSender(), toNano(1), {
            jettonAmount: toNano(1.1),
            to: batchSender.address,
            responseAddress: alice.address,
            customPayload: Cell.EMPTY,
            forwardTonAmount: toNano(0.05), // required = 0.05 * 2 + 0(service fee)
            forwardPayload: BatchSender.buildSendPayload([
                {
                    to: bob.address,
                    amount: toNano(1),
                },
                {
                    to: carlie.address,
                    amount: toNano(0.1),
                },
            ]),
        });

        expect(tx.transactions).toHaveTransaction({
            from: alice.address,
            to: aliceJettonWallet.address,
            success: true,
        });

        expect(tx.transactions).toHaveTransaction({
            from: batchSender.address,
            to: senderJettonWallet.address,
            success: true,
        });

        expect(tx.transactions).toHaveTransaction({
            from: senderJettonWallet.address,
            to: aliceJettonWallet.address,
            success: true,
        });

        expect(aliceBalance).toEqual(await aliceJettonWallet.getJettonBalance());
        expect(bobBalance).toEqual(await bobJettonWallet.getJettonBalance());
        expect(carlieBalance).toEqual(await carlieJettonWallet.getJettonBalance());

        const afterAliceTonBalance = await alice.getBalance();
        // Service fee is not consumed
        expect(aliceTonBalance - afterAliceTonBalance).toBeLessThan(toNano(1));
    });

    it('test_refund_case_when_jetton_amount_is_wrong', async () => {
        const aliceBalance = await aliceJettonWallet.getJettonBalance();
        const aliceTonBalance = await alice.getBalance();
        const bobBalance = await bobJettonWallet.getJettonBalance();
        const carlieBalance = await carlieJettonWallet.getJettonBalance();

        const tx = await aliceJettonWallet.sendTransfer(alice.getSender(), toNano(2), {
            jettonAmount: toNano(1), // This value should be 1 + 0.1
            to: batchSender.address,
            responseAddress: alice.address,
            customPayload: Cell.EMPTY,
            forwardTonAmount: toNano(1),
            forwardPayload: BatchSender.buildSendPayload([
                {
                    to: bob.address,
                    amount: toNano(1),
                },
                {
                    to: carlie.address,
                    amount: toNano(0.1),
                },
            ]),
        });

        expect(tx.transactions).toHaveTransaction({
            from: alice.address,
            to: aliceJettonWallet.address,
            success: true,
        });

        expect(tx.transactions).toHaveTransaction({
            from: batchSender.address,
            to: senderJettonWallet.address,
            success: true,
        });

        expect(tx.transactions).toHaveTransaction({
            from: senderJettonWallet.address,
            to: aliceJettonWallet.address,
            success: true,
        });

        expect(aliceBalance).toEqual(await aliceJettonWallet.getJettonBalance());
        expect(bobBalance).toEqual(await bobJettonWallet.getJettonBalance());
        expect(carlieBalance).toEqual(await carlieJettonWallet.getJettonBalance());

        const afterAliceTonBalance = await alice.getBalance();
        expect(aliceTonBalance - afterAliceTonBalance).toBeLessThan(toNano('1'));
    });

    it('test_refund_case_when_message_size_is_0', async () => {
        const aliceBalance = await aliceJettonWallet.getJettonBalance();
        const aliceTonBalance = await alice.getBalance();
        const bobBalance = await bobJettonWallet.getJettonBalance();
        const carlieBalance = await carlieJettonWallet.getJettonBalance();

        const tx = await aliceJettonWallet.sendTransfer(alice.getSender(), toNano(2), {
            jettonAmount: toNano(1),
            to: batchSender.address,
            responseAddress: alice.address,
            customPayload: Cell.EMPTY,
            forwardTonAmount: toNano(1),
            forwardPayload: BatchSender.buildSendPayload([]),
        });

        expect(tx.transactions).toHaveTransaction({
            from: alice.address,
            to: aliceJettonWallet.address,
            success: true,
        });

        expect(tx.transactions).toHaveTransaction({
            from: batchSender.address,
            to: senderJettonWallet.address,
            success: true,
        });

        expect(tx.transactions).toHaveTransaction({
            from: senderJettonWallet.address,
            to: aliceJettonWallet.address,
            success: true,
        });

        expect(aliceBalance).toEqual(await aliceJettonWallet.getJettonBalance());
        expect(bobBalance).toEqual(await bobJettonWallet.getJettonBalance());
        expect(carlieBalance).toEqual(await carlieJettonWallet.getJettonBalance());

        const afterAliceTonBalance = await alice.getBalance();
        expect(aliceTonBalance - afterAliceTonBalance).toBeLessThan(toNano('1'));
    });

    it('test_send_2', async () => {
        const aliceBalance = await aliceJettonWallet.getJettonBalance();
        const contractBalance = await batchSender.getBalance();
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

        const afterContractBalance = await batchSender.getBalance();

        expect(afterContractBalance).toBeGreaterThanOrEqual(contractBalance);
    });

    it('test_send_bulk', async () => {
        const aliceBalance = await aliceJettonWallet.getJettonBalance();
        const contractBalance = await batchSender.getBalance();
        const feeReceiverTonBalance = await feeReceiver.getBalance();
        const messages = _.times(200, (i) => {
            return {
                to: i % 2 ? bob.address : carlie.address,
                amount: toNano(_.random(0.1, 2)),
            };
        });
        const expectedRequiredGas = toNano(0.05) * BigInt(messages.length);
        const expectedServiceFee = toNano(10);
        const totalJettonAmount = messages.reduce((acc, m) => acc + m.amount, 0n);

        // Computation Fee
        // 100 -> 0.36TON
        // 200 -> 0.72TON
        const tx = await aliceJettonWallet.sendTransfer(
            alice.getSender(),
            toNano(2) + expectedRequiredGas + expectedServiceFee,
            {
                jettonAmount: totalJettonAmount,
                to: batchSender.address,
                responseAddress: alice.address,
                customPayload: Cell.EMPTY,
                forwardTonAmount: expectedRequiredGas + expectedServiceFee + toNano(1),
                forwardPayload: BatchSender.buildSendPayload(messages),
            },
        );

        // printTransactionFees(_.slice(tx.transactions, 0, 5));

        expect(tx.transactions).toHaveTransaction({
            from: alice.address,
            to: aliceJettonWallet.address,
            success: true,
        });

        expect(tx.transactions).not.toHaveTransaction({
            from: senderJettonWallet.address,
            to: aliceJettonWallet.address,
        });

        expect(tx.transactions).toHaveTransaction({
            from: senderJettonWallet.address,
            to: bobJettonWallet.address,
        });

        const afterFeeReceiverTonBalance = await feeReceiver.getBalance();
        expect(afterFeeReceiverTonBalance).toBeGreaterThan(feeReceiverTonBalance);
        expect(afterFeeReceiverTonBalance).toBeLessThan(expectedServiceFee + feeReceiverTonBalance);

        expect(await bobJettonWallet.getJettonBalance()).toEqual(
            messages.reduce((acc, m) => (m.to === bob.address ? acc + m.amount : acc), 0n),
        );
        expect(await carlieJettonWallet.getJettonBalance()).toEqual(
            messages.reduce((acc, m) => (m.to === carlie.address ? acc + m.amount : acc), 0n),
        );
        expect(aliceBalance - totalJettonAmount).toEqual(await aliceJettonWallet.getJettonBalance());

        const afterContractBalance = await batchSender.getBalance();
        expect(afterContractBalance).toBeGreaterThanOrEqual(contractBalance);
    });

    // TODO : Simulate Gas fee
    it('test_calculate_cost', async () => {
        const res = await batchSender.getCost(5, 0);
        expect(res).toEqual(0n);

        const res2 = await batchSender.getCost(11, 0);
        expect(res2).toEqual(toNano('10'));

        const res3 = await batchSender.getCost(11, 1);
        expect(res3).toEqual(toNano('10') * 11n);
    });

    it('test_set_one_time_fee', async () => {
        const expectedOneTimeFee = toNano('999');
        await batchSender.sendSetOneTimeFee(alice.getSender(), toNano('1'), expectedOneTimeFee);

        const storage = await batchSender.getStorage();
        expect(storage.oneTimeFee).toEqual(expectedOneTimeFee);
    });

    it('test_set_per_user_fee', async () => {
        const expectedFee = toNano('777');
        await batchSender.sendSetPerUserFee(alice.getSender(), toNano('1'), expectedFee);

        const storage = await batchSender.getStorage();
        expect(storage.perUserFee).toEqual(expectedFee);
    });

    it('test_set_fee_receiver', async () => {
        await batchSender.sendSetFeeReceiverAddress(alice.getSender(), toNano('1'), carlie.address);

        const storage = await batchSender.getStorage();
        expect(storage.feeReceiverAddress.equals(carlie.address)).toBeTruthy();
        expect(storage.feeReceiverAddress.equals(feeReceiver.address)).toBeFalsy();
    });

    it('test_admin_func_unautorized', async () => {
        const expectedOneTimeFee = toNano('999');
        await batchSender.sendSetOneTimeFee(bob.getSender(), toNano('10'), expectedOneTimeFee);

        const storage = await batchSender.getStorage();

        expect(storage.oneTimeFee).not.toEqual(expectedOneTimeFee);
    });
});
