# mrgn-cli Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Interactive CLI for marginfi lending protocol with Ledger hardware wallet, bypassing the broken web frontend.

**Architecture:** Three-layer Node.js app: UI (inquirer/chalk), Service (marginfi SDK), Wallet (Ledger HID). Uses @solana/web3.js v1.x (required by marginfi SDK). Ledger signs serialized transaction buffers.

**Tech Stack:** TypeScript, @mrgnlabs/marginfi-client-v2, @solana/web3.js v1, @ledgerhq/hw-app-solana, @ledgerhq/hw-transport-node-hid, inquirer, chalk, cli-table3, ora

**Task Management:** Use `td` CLI for all task tracking. Use `jj` for version control.

---

### Task 1: Project scaffold and dependencies

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/index.ts` (minimal placeholder)
- Create: `.mrgnrc.json.example`

**Step 1: Create td epic and task**

```bash
td epic "mrgn-cli" -d "Interactive CLI for marginfi with Ledger"
td task "Project scaffold and dependencies" --epic <epic-id> -d "Init package.json, tsconfig, install deps"
td start <task-id>
```

**Step 2: Create package.json**

```json
{
  "name": "mrgn-cli",
  "version": "0.1.0",
  "type": "module",
  "bin": { "mrgn": "./dist/index.js" },
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/index.ts",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@mrgnlabs/marginfi-client-v2": "^6.4.1",
    "@solana/web3.js": "^1.91.8",
    "@ledgerhq/hw-transport-node-hid": "^6.29.15",
    "@ledgerhq/hw-app-solana": "^7.6.3",
    "inquirer": "^12.0.0",
    "chalk": "^5.3.0",
    "cli-table3": "^0.6.5",
    "ora": "^8.0.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "tsx": "^4.19.0",
    "@types/node": "^22.0.0",
    "@types/inquirer": "^9.0.0"
  }
}
```

**Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src"]
}
```

**Step 4: Create .mrgnrc.json.example**

```json
{
  "rpcUrl": "https://mainnet.helius-rpc.com/?api-key=YOUR_HELIUS_API_KEY",
  "derivationPath": "44'/501'/0'/0'"
}
```

**Step 5: Create minimal src/index.ts**

```typescript
#!/usr/bin/env node
console.log("mrgn-cli starting...");
```

**Step 6: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, no errors

**Step 7: Verify build works**

Run: `npx tsx src/index.ts`
Expected: prints "mrgn-cli starting..."

**Step 8: Commit**

```bash
jj describe -m "feat: project scaffold with dependencies"
jj new
td close <task-id>
```

---

### Task 2: Config module

**Files:**
- Create: `src/config.ts`

**Step 1: Create td task**

```bash
td task "Config module" --epic <epic-id> -d "Load config from ~/.config/mrgn/config.json or local .mrgnrc.json"
td start <task-id>
```

**Step 2: Implement config.ts**

```typescript
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export interface MrgnConfig {
  rpcUrl: string;
  derivationPath: string;
}

const DEFAULT_CONFIG: MrgnConfig = {
  rpcUrl: "",
  derivationPath: "44'/501'/0'/0'",
};

export function loadConfig(): MrgnConfig {
  // Check local .mrgnrc.json first
  const localPath = join(process.cwd(), ".mrgnrc.json");
  if (existsSync(localPath)) {
    const raw = JSON.parse(readFileSync(localPath, "utf-8"));
    return { ...DEFAULT_CONFIG, ...raw };
  }

  // Then ~/.config/mrgn/config.json
  const globalPath = join(homedir(), ".config", "mrgn", "config.json");
  if (existsSync(globalPath)) {
    const raw = JSON.parse(readFileSync(globalPath, "utf-8"));
    return { ...DEFAULT_CONFIG, ...raw };
  }

  return DEFAULT_CONFIG;
}
```

**Step 3: Verify it compiles**

Run: `npx tsx -e "import { loadConfig } from './src/config.ts'; console.log(loadConfig())"`
Expected: prints default config object

**Step 4: Commit**

```bash
jj describe -m "feat: config module with local and global config loading"
jj new
td close <task-id>
```

---

### Task 3: Ledger wallet adapter

**Files:**
- Create: `src/ledger.ts`

**Step 1: Create td task**

```bash
td task "Ledger wallet adapter" --epic <epic-id> -d "Connect to Ledger, get pubkey, implement Wallet interface for marginfi SDK"
td start <task-id>
```

**Step 2: Implement ledger.ts**

The marginfi SDK expects an Anchor-compatible Wallet interface: `{ publicKey, signTransaction, signAllTransactions }`. The Ledger signs raw serialized transaction buffers.

```typescript
import Transport from "@ledgerhq/hw-transport-node-hid";
import Solana from "@ledgerhq/hw-app-solana";
import { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";

export interface Wallet {
  publicKey: PublicKey;
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]>;
}

export class LedgerWallet implements Wallet {
  publicKey: PublicKey;

  private constructor(
    private solana: Solana,
    private transport: Transport,
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
      const { signature } = await this.solana.signTransaction(
        this.path,
        serialized
      );
      tx.addSignature(this.publicKey, Buffer.from(signature));
      return tx;
    }
    // VersionedTransaction path
    const serialized = tx.serialize();
    const { signature } = await this.solana.signTransaction(
      this.path,
      Buffer.from(serialized)
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
```

**Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 4: Commit**

```bash
jj describe -m "feat: Ledger wallet adapter implementing Anchor Wallet interface"
jj new
td close <task-id>
```

---

### Task 4: MarginfiClient initialization

**Files:**
- Create: `src/client.ts`

**Step 1: Create td task**

```bash
td task "MarginfiClient initialization" --epic <epic-id> -d "Init marginfi client, fetch or create account"
td start <task-id>
```

**Step 2: Implement client.ts**

```typescript
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
```

**Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors (may need `as any` cast for wallet type compatibility - that's OK)

**Step 4: Commit**

```bash
jj describe -m "feat: marginfi client initialization and account fetching"
jj new
td close <task-id>
```

---

### Task 5: Utility helpers

**Files:**
- Create: `src/utils.ts`

**Step 1: Create td task**

```bash
td task "Utility helpers" --epic <epic-id> -d "Formatting helpers for amounts, APY, token display"
td start <task-id>
```

**Step 2: Implement utils.ts**

```typescript
import chalk from "chalk";

export function formatAmount(amount: number, decimals: number = 6): string {
  if (amount === 0) return "-";
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals > 4 ? 4 : decimals,
  });
}

export function formatApy(apy: number): string {
  const pct = (apy * 100).toFixed(2) + "%";
  if (apy > 0) return chalk.green(pct);
  if (apy < 0) return chalk.red(pct);
  return pct;
}

export function formatUsd(amount: number): string {
  return "$" + amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function shortenSig(sig: string): string {
  return sig.slice(0, 8) + "..." + sig.slice(-8);
}
```

**Step 3: Commit**

```bash
jj describe -m "feat: formatting utility helpers"
jj new
td close <task-id>
```

---

### Task 6: Positions display

**Files:**
- Create: `src/actions/positions.ts`

**Step 1: Create td task**

```bash
td task "Positions display" --epic <epic-id> -d "Show table of deposits, borrows, APY, health factor"
td start <task-id>
```

**Step 2: Implement positions.ts**

This requires understanding how marginfi exposes balance data. The account has `balances` array and banks have rate/price info. We need to iterate active balances and look up their bank details.

```typescript
import Table from "cli-table3";
import chalk from "chalk";
import type { MarginfiClient } from "@mrgnlabs/marginfi-client-v2";
import { formatAmount, formatApy, formatUsd } from "../utils.js";

export async function showPositions(
  client: MarginfiClient,
  account: any
): Promise<void> {
  await account.reload();

  const table = new Table({
    head: [
      chalk.bold("Token"),
      chalk.bold("Deposits"),
      chalk.bold("Borrows"),
      chalk.bold("Deposit APY"),
      chalk.bold("Borrow APY"),
      chalk.bold("Value (USD)"),
    ],
    colAligns: ["left", "right", "right", "right", "right", "right"],
  });

  let totalDeposits = 0;
  let totalBorrows = 0;
  let hasPositions = false;

  const balances = account.balances;

  for (const balance of balances) {
    if (!balance.active) continue;
    hasPositions = true;

    const bank = client.getBankByPk(balance.bankPk);
    if (!bank) continue;

    const tokenSymbol = bank.tokenSymbol ?? bank.mint.toBase58().slice(0, 6);
    const depositAmount = balance.assetShares.isZero()
      ? 0
      : account.getBalance(balance.bankPk).assets.toNumber();
    const borrowAmount = balance.liabilityShares.isZero()
      ? 0
      : account.getBalance(balance.bankPk).liabilities.toNumber();

    const depositValue = depositAmount * (bank.getPrice?.() ?? 0);
    const borrowValue = borrowAmount * (bank.getPrice?.() ?? 0);
    totalDeposits += depositValue;
    totalBorrows += borrowValue;

    table.push([
      tokenSymbol,
      formatAmount(depositAmount),
      formatAmount(borrowAmount),
      formatApy(bank.getDepositRate?.() ?? 0),
      formatApy(-(bank.getBorrowRate?.() ?? 0)),
      formatUsd(depositValue - borrowValue),
    ]);
  }

  if (!hasPositions) {
    console.log(chalk.yellow("\n  No active positions found.\n"));
    return;
  }

  console.log("\n" + table.toString());

  const netValue = totalDeposits - totalBorrows;
  console.log(
    chalk.bold(`\n  Total deposits: ${formatUsd(totalDeposits)}`),
  );
  console.log(
    chalk.bold(`  Total borrows:  ${formatUsd(totalBorrows)}`),
  );
  console.log(
    chalk.bold(`  Net value:      ${formatUsd(netValue)}\n`),
  );
}
```

**NOTE:** The exact property names on `balance` and `bank` objects may differ from what's documented. During implementation, inspect the actual SDK types with `npx tsc --noEmit` and adjust property access accordingly. The key pattern is: iterate `account.balances`, filter active ones, look up bank by `balance.bankPk`, compute amounts from shares.

**Step 3: Verify compilation**

Run: `npx tsc --noEmit`
Expected: may need type adjustments based on actual SDK types. Fix as needed.

**Step 4: Commit**

```bash
jj describe -m "feat: positions display with formatted table output"
jj new
td close <task-id>
```

---

### Task 7: Deposit action

**Files:**
- Create: `src/actions/deposit.ts`

**Step 1: Create td task**

```bash
td task "Deposit action" --epic <epic-id> -d "Interactive deposit flow: pick token, amount, confirm, sign"
td start <task-id>
```

**Step 2: Implement deposit.ts**

```typescript
import inquirer from "inquirer";
import ora from "ora";
import chalk from "chalk";
import type { MarginfiClient } from "@mrgnlabs/marginfi-client-v2";
import { formatAmount } from "../utils.js";

export async function depositAction(
  client: MarginfiClient,
  account: any
): Promise<void> {
  // Get all banks and let user pick
  const banks = [...client.banks.values()];
  const bankChoices = banks
    .filter((b: any) => b.tokenSymbol)
    .map((b: any) => ({
      name: `${b.tokenSymbol}`,
      value: b.address.toBase58(),
    }));

  const { bankAddress } = await inquirer.prompt([
    {
      type: "list",
      name: "bankAddress",
      message: "Which token do you want to deposit?",
      choices: bankChoices,
    },
  ]);

  const bank = client.getBankByPk(bankAddress);
  if (!bank) {
    console.log(chalk.red("Bank not found"));
    return;
  }

  const { amount } = await inquirer.prompt([
    {
      type: "input",
      name: "amount",
      message: `How much ${(bank as any).tokenSymbol ?? "tokens"} to deposit?`,
      validate: (val: string) => {
        const n = parseFloat(val);
        if (isNaN(n) || n <= 0) return "Enter a positive number";
        return true;
      },
    },
  ]);

  const depositAmount = parseFloat(amount);

  console.log(
    chalk.cyan(`\n  Deposit ${formatAmount(depositAmount)} ${(bank as any).tokenSymbol}`)
  );
  console.log(chalk.cyan("  Please confirm on your Ledger device.\n"));

  const spinner = ora("Submitting transaction...").start();

  try {
    const sig = await account.deposit(depositAmount, bank.address);
    spinner.succeed(`Deposit confirmed! Signature: ${sig}`);
  } catch (err: any) {
    spinner.fail("Deposit failed");
    if (err.message?.includes("rejected")) {
      console.log(chalk.yellow("  Transaction rejected on Ledger."));
    } else {
      console.log(chalk.red(`  Error: ${err.message}`));
    }
  }
}
```

**Step 3: Commit**

```bash
jj describe -m "feat: interactive deposit action with Ledger signing"
jj new
td close <task-id>
```

---

### Task 8: Withdraw action

**Files:**
- Create: `src/actions/withdraw.ts`

**Step 1: Create td task**

```bash
td task "Withdraw action" --epic <epic-id> -d "Interactive withdraw flow with max option"
td start <task-id>
```

**Step 2: Implement withdraw.ts**

Same pattern as deposit, but with a "max" option for withdrawing all.

```typescript
import inquirer from "inquirer";
import ora from "ora";
import chalk from "chalk";
import type { MarginfiClient } from "@mrgnlabs/marginfi-client-v2";
import { formatAmount } from "../utils.js";

export async function withdrawAction(
  client: MarginfiClient,
  account: any
): Promise<void> {
  // Show only banks where user has deposits
  const activeDeposits: any[] = [];
  for (const balance of account.balances) {
    if (!balance.active || balance.assetShares.isZero()) continue;
    const bank = client.getBankByPk(balance.bankPk);
    if (bank) activeDeposits.push(bank);
  }

  if (activeDeposits.length === 0) {
    console.log(chalk.yellow("\n  No deposits to withdraw.\n"));
    return;
  }

  const { bankAddress } = await inquirer.prompt([
    {
      type: "list",
      name: "bankAddress",
      message: "Which token do you want to withdraw?",
      choices: activeDeposits.map((b: any) => ({
        name: b.tokenSymbol ?? b.mint.toBase58().slice(0, 6),
        value: b.address.toBase58(),
      })),
    },
  ]);

  const bank = client.getBankByPk(bankAddress);
  if (!bank) return;

  const { amount } = await inquirer.prompt([
    {
      type: "input",
      name: "amount",
      message: `Amount to withdraw (or "max" for all):`,
      validate: (val: string) => {
        if (val.toLowerCase() === "max") return true;
        const n = parseFloat(val);
        if (isNaN(n) || n <= 0) return "Enter a positive number or 'max'";
        return true;
      },
    },
  ]);

  const isMax = amount.toLowerCase() === "max";
  const withdrawAmount = isMax ? 0 : parseFloat(amount);

  const label = isMax ? "ALL" : formatAmount(withdrawAmount);
  console.log(
    chalk.cyan(`\n  Withdraw ${label} ${(bank as any).tokenSymbol}`)
  );
  console.log(chalk.cyan("  Please confirm on your Ledger device.\n"));

  const spinner = ora("Submitting transaction...").start();

  try {
    const sig = isMax
      ? await account.withdraw(0, bank.address, true)
      : await account.withdraw(withdrawAmount, bank.address, false);
    spinner.succeed(`Withdrawal confirmed! Signature: ${sig}`);
  } catch (err: any) {
    spinner.fail("Withdrawal failed");
    if (err.message?.includes("rejected")) {
      console.log(chalk.yellow("  Transaction rejected on Ledger."));
    } else {
      console.log(chalk.red(`  Error: ${err.message}`));
    }
  }
}
```

**Step 3: Commit**

```bash
jj describe -m "feat: interactive withdraw action with max option"
jj new
td close <task-id>
```

---

### Task 9: Borrow action

**Files:**
- Create: `src/actions/borrow.ts`

**Step 1: Create td task**

```bash
td task "Borrow action" --epic <epic-id> -d "Interactive borrow flow"
td start <task-id>
```

**Step 2: Implement borrow.ts**

```typescript
import inquirer from "inquirer";
import ora from "ora";
import chalk from "chalk";
import type { MarginfiClient } from "@mrgnlabs/marginfi-client-v2";
import { formatAmount } from "../utils.js";

export async function borrowAction(
  client: MarginfiClient,
  account: any
): Promise<void> {
  const banks = [...client.banks.values()];
  const bankChoices = banks
    .filter((b: any) => b.tokenSymbol)
    .map((b: any) => ({
      name: `${b.tokenSymbol}`,
      value: b.address.toBase58(),
    }));

  const { bankAddress } = await inquirer.prompt([
    {
      type: "list",
      name: "bankAddress",
      message: "Which token do you want to borrow?",
      choices: bankChoices,
    },
  ]);

  const bank = client.getBankByPk(bankAddress);
  if (!bank) {
    console.log(chalk.red("Bank not found"));
    return;
  }

  const { amount } = await inquirer.prompt([
    {
      type: "input",
      name: "amount",
      message: `How much ${(bank as any).tokenSymbol ?? "tokens"} to borrow?`,
      validate: (val: string) => {
        const n = parseFloat(val);
        if (isNaN(n) || n <= 0) return "Enter a positive number";
        return true;
      },
    },
  ]);

  const borrowAmount = parseFloat(amount);

  console.log(
    chalk.cyan(`\n  Borrow ${formatAmount(borrowAmount)} ${(bank as any).tokenSymbol}`)
  );
  console.log(chalk.yellow("  Make sure you have sufficient collateral deposited."));
  console.log(chalk.cyan("  Please confirm on your Ledger device.\n"));

  const spinner = ora("Submitting transaction...").start();

  try {
    const sig = await account.borrow(borrowAmount, bank.address);
    spinner.succeed(`Borrow confirmed! Signature: ${sig}`);
  } catch (err: any) {
    spinner.fail("Borrow failed");
    if (err.message?.includes("rejected")) {
      console.log(chalk.yellow("  Transaction rejected on Ledger."));
    } else {
      console.log(chalk.red(`  Error: ${err.message}`));
    }
  }
}
```

**Step 3: Commit**

```bash
jj describe -m "feat: interactive borrow action"
jj new
td close <task-id>
```

---

### Task 10: Repay action

**Files:**
- Create: `src/actions/repay.ts`

**Step 1: Create td task**

```bash
td task "Repay action" --epic <epic-id> -d "Interactive repay flow with max option"
td start <task-id>
```

**Step 2: Implement repay.ts**

```typescript
import inquirer from "inquirer";
import ora from "ora";
import chalk from "chalk";
import type { MarginfiClient } from "@mrgnlabs/marginfi-client-v2";
import { formatAmount } from "../utils.js";

export async function repayAction(
  client: MarginfiClient,
  account: any
): Promise<void> {
  // Show only banks where user has borrows
  const activeBorrows: any[] = [];
  for (const balance of account.balances) {
    if (!balance.active || balance.liabilityShares.isZero()) continue;
    const bank = client.getBankByPk(balance.bankPk);
    if (bank) activeBorrows.push(bank);
  }

  if (activeBorrows.length === 0) {
    console.log(chalk.yellow("\n  No active borrows to repay.\n"));
    return;
  }

  const { bankAddress } = await inquirer.prompt([
    {
      type: "list",
      name: "bankAddress",
      message: "Which borrow do you want to repay?",
      choices: activeBorrows.map((b: any) => ({
        name: b.tokenSymbol ?? b.mint.toBase58().slice(0, 6),
        value: b.address.toBase58(),
      })),
    },
  ]);

  const bank = client.getBankByPk(bankAddress);
  if (!bank) return;

  const { amount } = await inquirer.prompt([
    {
      type: "input",
      name: "amount",
      message: `Amount to repay (or "max" for all):`,
      validate: (val: string) => {
        if (val.toLowerCase() === "max") return true;
        const n = parseFloat(val);
        if (isNaN(n) || n <= 0) return "Enter a positive number or 'max'";
        return true;
      },
    },
  ]);

  const isMax = amount.toLowerCase() === "max";
  const repayAmount = isMax ? 0 : parseFloat(amount);

  const label = isMax ? "ALL" : formatAmount(repayAmount);
  console.log(
    chalk.cyan(`\n  Repay ${label} ${(bank as any).tokenSymbol}`)
  );
  console.log(chalk.cyan("  Please confirm on your Ledger device.\n"));

  const spinner = ora("Submitting transaction...").start();

  try {
    const sig = isMax
      ? await account.repay(0, bank.address, true)
      : await account.repay(repayAmount, bank.address, false);
    spinner.succeed(`Repayment confirmed! Signature: ${sig}`);
  } catch (err: any) {
    spinner.fail("Repayment failed");
    if (err.message?.includes("rejected")) {
      console.log(chalk.yellow("  Transaction rejected on Ledger."));
    } else {
      console.log(chalk.red(`  Error: ${err.message}`));
    }
  }
}
```

**Step 3: Commit**

```bash
jj describe -m "feat: interactive repay action with max option"
jj new
td close <task-id>
```

---

### Task 11: Main entry point and menu loop

**Files:**
- Modify: `src/index.ts`

**Step 1: Create td task**

```bash
td task "Main entry point and menu loop" --epic <epic-id> -d "Wire up Ledger connect, client init, interactive menu"
td start <task-id>
```

**Step 2: Implement src/index.ts**

```typescript
#!/usr/bin/env node

import inquirer from "inquirer";
import ora from "ora";
import chalk from "chalk";
import { loadConfig } from "./config.js";
import { LedgerWallet } from "./ledger.js";
import { initClient, getOrCreateAccount } from "./client.js";
import { showPositions } from "./actions/positions.js";
import { depositAction } from "./actions/deposit.js";
import { withdrawAction } from "./actions/withdraw.js";
import { borrowAction } from "./actions/borrow.js";
import { repayAction } from "./actions/repay.js";

async function main() {
  console.log(chalk.bold.cyan("\n  mrgn-cli - marginfi from your terminal\n"));

  // Load config
  const config = loadConfig();
  if (!config.rpcUrl) {
    console.log(chalk.red("  No RPC URL configured."));
    console.log(chalk.yellow("  Create .mrgnrc.json or ~/.config/mrgn/config.json"));
    console.log(chalk.yellow("  See .mrgnrc.json.example for format.\n"));
    process.exit(1);
  }

  // Connect Ledger
  let wallet: LedgerWallet;
  const ledgerSpinner = ora("Connecting to Ledger...").start();
  try {
    wallet = await LedgerWallet.connect(config.derivationPath);
    ledgerSpinner.succeed(
      `Ledger connected: ${wallet.publicKey.toBase58().slice(0, 8)}...${wallet.publicKey.toBase58().slice(-8)}`
    );
  } catch (err: any) {
    ledgerSpinner.fail("Failed to connect Ledger");
    if (err.message?.includes("cannot open")) {
      console.log(chalk.yellow("  Is your Ledger plugged in and unlocked?"));
      console.log(chalk.yellow("  Make sure the Solana app is open."));
    } else {
      console.log(chalk.red(`  ${err.message}`));
    }
    process.exit(1);
  }

  // Init marginfi client
  const clientSpinner = ora("Loading marginfi data...").start();
  let client;
  let account;
  try {
    client = await initClient(wallet, config.rpcUrl);
    account = await getOrCreateAccount(client);
    if (!account) {
      clientSpinner.warn("No marginfi account found.");
      const { create } = await inquirer.prompt([
        {
          type: "confirm",
          name: "create",
          message: "Create a new marginfi account?",
          default: true,
        },
      ]);
      if (create) {
        const createSpinner = ora("Creating account (confirm on Ledger)...").start();
        account = await client.createMarginfiAccount();
        createSpinner.succeed("Account created!");
      } else {
        await wallet.disconnect();
        process.exit(0);
      }
    } else {
      clientSpinner.succeed("marginfi account loaded.");
    }
  } catch (err: any) {
    clientSpinner.fail(`Failed to load marginfi: ${err.message}`);
    await wallet.disconnect();
    process.exit(1);
  }

  // Main menu loop
  let running = true;
  while (running) {
    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: "What do you want to do?",
        choices: [
          { name: "View positions", value: "positions" },
          { name: "Deposit", value: "deposit" },
          { name: "Withdraw", value: "withdraw" },
          { name: "Borrow", value: "borrow" },
          { name: "Repay", value: "repay" },
          new inquirer.Separator(),
          { name: "Quit", value: "quit" },
        ],
      },
    ]);

    switch (action) {
      case "positions":
        await showPositions(client, account);
        break;
      case "deposit":
        await depositAction(client, account);
        break;
      case "withdraw":
        await withdrawAction(client, account);
        break;
      case "borrow":
        await borrowAction(client, account);
        break;
      case "repay":
        await repayAction(client, account);
        break;
      case "quit":
        running = false;
        break;
    }
  }

  await wallet.disconnect();
  console.log(chalk.cyan("\n  Goodbye!\n"));
}

main().catch((err) => {
  console.error(chalk.red(`\nFatal error: ${err.message}`));
  process.exit(1);
});
```

**Step 3: Verify full build**

Run: `npx tsc --noEmit`
Expected: no errors (or minor type issues to fix)

**Step 4: Commit**

```bash
jj describe -m "feat: main entry point with menu loop and full action wiring"
jj new
td close <task-id>
```

---

### Task 12: End-to-end test with Ledger

**Step 1: Create td task**

```bash
td task "E2E test with Ledger" --epic <epic-id> -d "Create .mrgnrc.json with Helius key, run the tool, verify positions load"
td start <task-id>
```

**Step 2: Create local config**

Prompt user for their Helius API key, create `.mrgnrc.json` (add to .gitignore).

**Step 3: Run the tool**

Run: `npx tsx src/index.ts`
Expected flow:
1. "Connecting to Ledger..." -> succeeds
2. "Loading marginfi data..." -> succeeds
3. Menu appears
4. Select "View positions" -> table displays
5. Select "Quit" -> exits cleanly

**Step 4: Fix any SDK type mismatches**

The marginfi SDK types may not match the documented API exactly. During this task, fix any property name mismatches, add type casts where needed, and adjust the positions display to match the actual data structure.

**Step 5: Commit fixes**

```bash
jj describe -m "fix: SDK type adjustments from e2e testing"
jj new
td close <task-id>
```

---

### Task 13: Polish and cleanup

**Step 1: Create td task**

```bash
td task "Polish and cleanup" --epic <epic-id> -d "Add .gitignore, clean up types, add bin entry"
td start <task-id>
```

**Step 2: Add .gitignore entries**

Ensure `.gitignore` includes:
```
node_modules/
dist/
.mrgnrc.json
.todos/
```

**Step 3: Test the bin script**

Run: `npm run build && node dist/index.js`
Expected: same as dev mode

**Step 4: Final commit**

```bash
jj describe -m "chore: polish, gitignore, build verification"
jj new
td close <task-id>
```
