import { Connection } from "@solana/web3.js";
import { MarginfiClient, getConfig } from "@mrgnlabs/marginfi-client-v2";
import type { Wallet } from "./ledger.js";

// Helius free tier doesn't support batch RPC. The marginfi SDK uses
// connection._rpcBatchRequest internally. This patch converts batch
// requests into sequential individual requests.
function patchConnectionForFreeTier(conn: Connection): Connection {
  const original = (conn as any)._rpcBatchRequest?.bind(conn);
  if (original) {
    (conn as any)._rpcBatchRequest = async (requests: any[]) => {
      const results = [];
      for (const req of requests) {
        const method = req.methodName;
        const args = req.args;
        const result = await (conn as any)._rpcRequest(method, args);
        results.push(result);
      }
      return results;
    };
  }
  return conn;
}

export async function initClient(
  wallet: Wallet,
  rpcUrl: string
): Promise<MarginfiClient> {
  const connection = patchConnectionForFreeTier(
    new Connection(rpcUrl, "confirmed")
  );
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
