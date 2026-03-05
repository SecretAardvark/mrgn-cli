# mrgn-cli Design

Interactive terminal tool for marginfi lending protocol operations with Ledger hardware wallet.

## Problem

marginfi.com frontend crashes in Chromium-based browsers on Linux when connecting a wallet. This CLI bypasses the broken frontend entirely, talking directly to the on-chain program.

## Architecture

Single Node.js CLI app with three layers:

1. **UI Layer** - `inquirer` prompts, `chalk` + `cli-table3` formatted output, `ora` spinners
2. **Service Layer** - wraps marginfi SDK (deposit, withdraw, borrow, repay, positions)
3. **Wallet Layer** - Ledger via `@ledgerhq/hw-transport-node-hid` + `@ledgerhq/hw-app-solana`

## User Flow

```
Start -> Connect Ledger -> Fetch public key -> Init MarginfiClient
-> Fetch/create MarginfiAccount -> Main menu loop
  -> View positions (table: token, deposits, borrows, APY, health factor)
  -> Deposit -> pick token -> enter amount -> confirmation -> sign on Ledger
  -> Withdraw -> pick token -> enter amount -> confirmation -> sign on Ledger
  -> Borrow -> pick token -> enter amount -> show health impact -> sign on Ledger
  -> Repay -> pick token -> enter amount (or "max") -> sign on Ledger
```

Every transaction displays a summary before Ledger signing.

## Project Structure

```
js/mrgn-cli/
├── package.json
├── tsconfig.json
├── .mrgnrc.json.example
├── src/
│   ├── index.ts          # Entry point, main menu loop
│   ├── ledger.ts         # Ledger connection + Signer wrapper
│   ├── client.ts         # MarginfiClient init + account management
│   ├── actions/
│   │   ├── positions.ts  # Display positions table
│   │   ├── deposit.ts    # Deposit flow
│   │   ├── withdraw.ts   # Withdraw flow
│   │   ├── borrow.ts     # Borrow flow
│   │   └── repay.ts      # Repay flow
│   ├── config.ts         # Config loading
│   └── utils.ts          # Formatting helpers
└── docs/
```

## Dependencies

- `@mrgnlabs/marginfi-client-v2` - marginfi protocol
- `@solana/web3.js` - Solana connection/transactions
- `@ledgerhq/hw-transport-node-hid` - USB Ledger communication
- `@ledgerhq/hw-app-solana` - Solana signing on Ledger
- `inquirer` - interactive prompts
- `chalk` - colored output
- `cli-table3` - formatted tables
- `ora` - loading spinners

## Config

Stored in `~/.config/mrgn/config.json` or local `.mrgnrc.json`:

```json
{
  "rpcUrl": "https://mainnet.helius-rpc.com/?api-key=YOUR_KEY",
  "derivationPath": "m/44'/501'/0'/0'"
}
```

## Tokens

Support all marginfi banks, with focus on: LSTs (mSOL, jitoSOL, bSOL), WETH, WBTC, USDC, PYUSD, SOL.

## Error Handling

- Ledger not connected: clear message, retry prompt
- Solana app not open: prompt to open it
- Transaction rejected on Ledger: return to menu
- RPC errors: retry with backoff
- No marginfi account: offer to create one
- Insufficient balance: show current balance, ask for new amount
