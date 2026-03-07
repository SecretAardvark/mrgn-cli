import {
  Connection,
  Transaction,
  TransactionInstruction,
  PublicKey,
  Keypair,
  sendAndConfirmTransaction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import type { Wallet } from "./ledger.js";

/**
 * Build a legacy Transaction from raw instructions, sign with Ledger, and send.
 * Bypasses the marginfi SDK's v0 transaction formatting which is incompatible
 * with Ledger Solana app v1.4.x.
 */
export async function sendLegacyTransaction(
  connection: Connection,
  wallet: Wallet,
  instructions: TransactionInstruction[],
  additionalSigners: Keypair[] = []
): Promise<string> {
  const tx = new Transaction();
  tx.add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
    ...instructions
  );

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = wallet.publicKey;

  // Sign with any additional keypairs first
  if (additionalSigners.length > 0) {
    tx.partialSign(...additionalSigners);
  }

  // Sign with Ledger
  const signed = await wallet.signTransaction(tx);

  // Send and confirm
  const rawTx = signed.serialize();
  const sig = await connection.sendRawTransaction(rawTx, {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });

  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed"
  );

  return sig;
}

/**
 * Build and send oracle crank instructions as a legacy tx, then the action tx.
 * If crankIxs is empty, only sends the action tx.
 */
export async function sendWithCrank(
  connection: Connection,
  wallet: Wallet,
  crankIxs: TransactionInstruction[],
  actionIxs: TransactionInstruction[],
  actionSigners: Keypair[] = []
): Promise<string> {
  // Send crank first if needed
  if (crankIxs.length > 0) {
    try {
      await sendLegacyTransaction(connection, wallet, crankIxs);
    } catch (err: any) {
      // Oracle crank can fail if feeds are already fresh - that's ok
      if (!err.message?.includes("already been processed")) {
        console.log(`  Oracle update failed (may already be fresh): ${err.message}`);
      }
    }
  }

  // Send the actual action
  return sendLegacyTransaction(connection, wallet, actionIxs, actionSigners);
}
