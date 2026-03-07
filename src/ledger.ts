import TransportModule from "@ledgerhq/hw-transport-node-hid";
import SolanaModule from "@ledgerhq/hw-app-solana";
import { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";

// Handle CJS/ESM double-default wrapping
const Transport = (TransportModule as any).default ?? TransportModule;
const Solana = (SolanaModule as any).default ?? SolanaModule;

export interface Wallet {
  publicKey: PublicKey;
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]>;
}

export class LedgerWallet implements Wallet {
  publicKey: PublicKey;

  private constructor(
    private solana: InstanceType<typeof Solana>,
    private transport: InstanceType<typeof Transport>,
    private path: string,
    publicKey: PublicKey
  ) {
    this.publicKey = publicKey;
  }

  static async connect(derivationPath: string): Promise<LedgerWallet> {
    const transport = await Transport.open("");
    const solana = new Solana(transport);
    const { address } = await solana.getAddress(derivationPath);
    const publicKey = new PublicKey(address);
    return new LedgerWallet(solana, transport, derivationPath, publicKey);
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    if (tx instanceof Transaction) {
      const serialized = tx.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });
      const { signature } = await this.solana.signTransaction(this.path, serialized);
      tx.addSignature(this.publicKey, Buffer.from(signature));
      return tx;
    }
    const serialized = tx.serialize();
    const { signature } = await this.solana.signTransaction(this.path, Buffer.from(serialized));
    tx.addSignature(this.publicKey, signature);
    return tx;
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
    const signed: T[] = [];
    for (const tx of txs) {
      signed.push(await this.signTransaction(tx));
    }
    return signed;
  }

  async disconnect(): Promise<void> {
    await this.transport.close();
  }
}
