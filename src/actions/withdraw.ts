import inquirer from "inquirer";
import ora from "ora";
import chalk from "chalk";
import type { MarginfiClient } from "@mrgnlabs/marginfi-client-v2";
import type { Wallet } from "../ledger.js";
import { formatAmount } from "../utils.js";
import { sendWithCrank } from "../send-legacy.js";

export async function withdrawAction(
  client: MarginfiClient,
  account: any,
  wallet: Wallet
): Promise<void> {
  const activeDeposits: any[] = [];
  for (const balance of account.activeBalances) {
    if (balance.assetShares.isZero()) continue;
    const bank = client.getBankByPk(balance.bankPk);
    if (bank) activeDeposits.push(bank);
  }

  if (activeDeposits.length === 0) {
    console.log(chalk.yellow("\n  No deposits to withdraw.\n"));
    return;
  }

  const { bankAddress } = await inquirer.prompt([{
    type: "list",
    name: "bankAddress",
    message: "Which token do you want to withdraw?",
    choices: activeDeposits.map((b: any) => ({
      name: b.tokenSymbol ?? b.mint.toBase58().slice(0, 6),
      value: b.address.toBase58(),
    })),
  }]);

  const bank = (client as any).getBankByPk(bankAddress);
  if (!bank) return;

  const { amount } = await inquirer.prompt([{
    type: "input",
    name: "amount",
    message: `Amount to withdraw (or "max" for all):`,
    validate: (val: string) => {
      if (val.toLowerCase() === "max") return true;
      const n = parseFloat(val);
      if (isNaN(n) || n <= 0) return "Enter a positive number or 'max'";
      return true;
    },
  }]);

  const isMax = amount.toLowerCase() === "max";
  const withdrawAmount = isMax ? 0 : parseFloat(amount);
  const label = isMax ? "ALL" : formatAmount(withdrawAmount);
  console.log(chalk.cyan(`\n  Withdraw ${label} ${bank.tokenSymbol}`));
  console.log(chalk.cyan("  Please confirm on your Ledger device.\n"));

  const spinner = ora("Submitting transaction...").start();
  try {
    // Get raw instructions (bypasses SDK v0 formatting)
    const { instructions: updateFeedIxs } = await account.makeUpdateFeedIx([]);
    const withdrawIxs = await account.makeWithdrawIx(
      isMax ? 0 : withdrawAmount,
      bank.address,
      isMax
    );

    const connection = (client as any).program.provider.connection;
    const sig = await sendWithCrank(
      connection,
      wallet,
      updateFeedIxs,
      withdrawIxs.instructions,
      withdrawIxs.keys
    );
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
