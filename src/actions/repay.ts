import inquirer from "inquirer";
import ora from "ora";
import chalk from "chalk";
import type { MarginfiClient } from "@mrgnlabs/marginfi-client-v2";
import { formatAmount } from "../utils.js";

export async function repayAction(
  client: MarginfiClient,
  account: any
): Promise<void> {
  const activeBorrows: any[] = [];
  for (const balance of account.balances) {
    if (!balance.active || balance.liabilityShares.isZero()) continue;
    const bank = (client as any).getBankByPk(balance.bankPk);
    if (bank) activeBorrows.push(bank);
  }

  if (activeBorrows.length === 0) {
    console.log(chalk.yellow("\n  No active borrows to repay.\n"));
    return;
  }

  const { bankAddress } = await inquirer.prompt([{
    type: "list",
    name: "bankAddress",
    message: "Which borrow do you want to repay?",
    choices: activeBorrows.map((b: any) => ({
      name: b.tokenSymbol ?? b.mint.toBase58().slice(0, 6),
      value: b.address.toBase58(),
    })),
  }]);

  const bank = (client as any).getBankByPk(bankAddress);
  if (!bank) return;

  const { amount } = await inquirer.prompt([{
    type: "input",
    name: "amount",
    message: `Amount to repay (or "max" for all):`,
    validate: (val: string) => {
      if (val.toLowerCase() === "max") return true;
      const n = parseFloat(val);
      if (isNaN(n) || n <= 0) return "Enter a positive number or 'max'";
      return true;
    },
  }]);

  const isMax = amount.toLowerCase() === "max";
  const repayAmount = isMax ? 0 : parseFloat(amount);
  const label = isMax ? "ALL" : formatAmount(repayAmount);
  console.log(chalk.cyan(`\n  Repay ${label} ${bank.tokenSymbol}`));
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
