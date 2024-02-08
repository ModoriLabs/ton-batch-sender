import { promises as fs } from 'fs';
import path from 'path';
import { Address, Cell, Contract } from '@ton/core';

export type Network = 'mainnet' | 'testnet' | 'custom';

export interface ContractDeployment extends Contract {
    readonly name: string;
    readonly contract: string;
    readonly deployer: Address;
    readonly network: Network;
}

export const deployments = {
    async save(result: ContractDeployment): Promise<void> {
        const data = this.serialize({
            name: result.name,
            contract: result.contract,
            deployer: result.deployer,
            network: result.network,
            address: result.address,
            init: result.init ? result.init : undefined,
        });

        const dir = path.join('./', `deployments/${result.network}`);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(path.join(dir, `${result.name}.json`), JSON.stringify(data));
    },

    async read(name: string, network: Network): Promise<ContractDeployment> {
        const dir = path.join('./', `deployments/${network}`);
        const data = await fs.readFile(path.join(dir, `${name}.json`));
        return this.deserialize(JSON.parse(data.toString()));
    },

    serialize(result: {
        name: string;
        contract: string;
        deployer: Address;
        network: Network;
        address: Address;
        init?: {
            code: Cell;
            data: Cell;
        };
    }) {
        return {
            name: result.name,
            contract: result.contract,
            deployer: result.deployer.toString(),
            address: result.address.toString(),
            network: result.network,
            code: result.init ? result.init.code.toBoc().toString('base64') : '',
            data: result.init ? result.init.data.toBoc().toString('base64') : '',
        };
    },

    deserialize(data: {
        name: string;
        contract: string;
        deployer: string;
        network: Network;
        address: string;
        code?: string;
        data?: string;
    }): ContractDeployment {
        return {
            name: data.name,
            contract: data.contract,
            deployer: Address.parse(data.deployer),
            network: data.network,
            address: Address.parse(data.address),
            init: {
                data: Cell.fromBase64(data.data ? data.data : ''),
                code: Cell.fromBase64(data.code ? data.code : ''),
            },
        };
    },
};
