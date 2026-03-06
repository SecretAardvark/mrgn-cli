import { Connection } from "@solana/web3.js";
import { MarginfiClient, getConfig } from "@mrgnlabs/marginfi-client-v2";
import type { Wallet } from "./ledger.js";

export async function initClient(
  wallet: Wallet,
  rpcUrl: string
): Promise<MarginfiClient> {
  const connection = new Connection(rpcUrl, "confirmed");
  const config = getConfig("production");
  return MarginfiClient.fetch(config, wallet as any, connection);
}

export async function getOrCreateAccount(client: MarginfiClient) {
  const accounts = await client.getMarginfiAccountsForAuthority();
  if (accounts.length > 0) {
    return accounts[0];
  }
  return null;
}
