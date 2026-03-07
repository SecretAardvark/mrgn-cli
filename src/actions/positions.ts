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

    const tokenSymbol = (bank as any).tokenSymbol ?? (bank as any).mint.toBase58().slice(0, 6);
    const depositAmount = balance.assetShares.isZero()
      ? 0
      : account.getBalance(balance.bankPk).assets.toNumber();
    const borrowAmount = balance.liabilityShares.isZero()
      ? 0
      : account.getBalance(balance.bankPk).liabilities.toNumber();

    const depositValue = depositAmount * ((bank as any).getPrice?.() ?? 0);
    const borrowValue = borrowAmount * ((bank as any).getPrice?.() ?? 0);
    totalDeposits += depositValue;
    totalBorrows += borrowValue;

    table.push([
      tokenSymbol,
      formatAmount(depositAmount),
      formatAmount(borrowAmount),
      formatApy((bank as any).getDepositRate?.() ?? 0),
      formatApy(-((bank as any).getBorrowRate?.() ?? 0)),
      formatUsd(depositValue - borrowValue),
    ]);
  }

  if (!hasPositions) {
    console.log(chalk.yellow("\n  No active positions found.\n"));
    return;
  }

  console.log("\n" + table.toString());

  const netValue = totalDeposits - totalBorrows;
  console.log(chalk.bold(`\n  Total deposits: ${formatUsd(totalDeposits)}`));
  console.log(chalk.bold(`  Total borrows:  ${formatUsd(totalBorrows)}`));
  console.log(chalk.bold(`  Net value:      ${formatUsd(netValue)}\n`));
}
