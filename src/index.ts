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

  const config = loadConfig();
  if (!config.rpcUrl) {
    console.log(chalk.red("  No RPC URL configured."));
    console.log(chalk.yellow("  Create .mrgnrc.json or ~/.config/mrgn/config.json"));
    console.log(chalk.yellow("  See .mrgnrc.json.example for format.\n"));
    process.exit(1);
  }

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

  const clientSpinner = ora("Loading marginfi data...").start();
  let client;
  let account;
  try {
    client = await initClient(wallet, config.rpcUrl);
    account = await getOrCreateAccount(client);
    if (!account) {
      clientSpinner.warn("No marginfi account found.");
      const { create } = await inquirer.prompt([{
        type: "confirm",
        name: "create",
        message: "Create a new marginfi account?",
        default: true,
      }]);
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

  let running = true;
  while (running) {
    const { action } = await inquirer.prompt([{
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
    }]);

    switch (action) {
      case "positions":
        await showPositions(client, account);
        break;
      case "deposit":
        await depositAction(client, account, wallet);
        break;
      case "withdraw":
        await withdrawAction(client, account, wallet);
        break;
      case "borrow":
        await borrowAction(client, account, wallet);
        break;
      case "repay":
        await repayAction(client, account, wallet);
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
