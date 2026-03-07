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

  const activeBalances = account.activeBalances;

  for (const balance of activeBalances) {
    const bank = client.getBankByPk(balance.bankPk);
    if (!bank) continue;
    hasPositions = true;

    const tokenSymbol = (bank as any).tokenSymbol ?? (bank as any).mint.toBase58().slice(0, 6);

    // Get quantities using SDK methods
    const qty = balance.computeQuantityUi(bank);
    const depositAmount = qty.assets.toNumber();
    const borrowAmount = qty.liabilities.toNumber();

    // Get USD values using oracle price
    const oraclePrice = client.getOraclePriceByBank(bank.address);
    let depositValue = 0;
    let borrowValue = 0;
    if (oraclePrice) {
      const usdValues = balance.computeUsdValue(bank, oraclePrice);
      depositValue = usdValues.assets.toNumber();
      borrowValue = usdValues.liabilities.toNumber();
    }

    totalDeposits += depositValue;
    totalBorrows += borrowValue;

    // Get interest rates
    const rates = (bank as any).computeInterestRates();
    const lendingRate = rates.lendingRate.toNumber();
    const borrowingRate = rates.borrowingRate.toNumber();

    table.push([
      tokenSymbol,
      formatAmount(depositAmount),
      formatAmount(borrowAmount),
      formatApy(lendingRate),
      formatApy(-borrowingRate),
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
