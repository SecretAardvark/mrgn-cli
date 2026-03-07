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

  private async reconnect(): Promise<void> {
    try { await this.transport.close(); } catch {}
    this.transport = await Transport.open("");
    this.solana = new Solana(this.transport);
  }

  private async signWithRetry(
    sign: () => Promise<{ signature: Buffer }>
  ): Promise<Buffer> {
    try {
      const { signature } = await sign();
      return signature;
    } catch (err: any) {
      if (err.message?.includes("Invalid channel")) {
        await this.reconnect();
        const { signature } = await sign();
        return signature;
      }
      throw err;
    }
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    if (tx instanceof Transaction) {
      const message = tx.serializeMessage();
      const signature = await this.signWithRetry(() =>
        this.solana.signTransaction(this.path, message)
      );
      tx.addSignature(this.publicKey, Buffer.from(signature));
      return tx;
    }
    // VersionedTransaction: pass message bytes only
    const message = tx.message.serialize();
    const signature = await this.signWithRetry(() =>
      this.solana.signTransaction(this.path, Buffer.from(message))
    );
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
