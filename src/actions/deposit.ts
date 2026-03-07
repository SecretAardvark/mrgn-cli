import inquirer from "inquirer";
import ora from "ora";
import chalk from "chalk";
import type { MarginfiClient } from "@mrgnlabs/marginfi-client-v2";
import type { Wallet } from "../ledger.js";
import { formatAmount } from "../utils.js";
import { sendWithCrank } from "../send-legacy.js";

export async function depositAction(
  client: MarginfiClient,
  account: any,
  wallet: Wallet
): Promise<void> {
  const banks = [...(client as any).banks.values()];
  const bankChoices = banks
    .filter((b: any) => b.tokenSymbol)
    .map((b: any) => ({
      name: b.tokenSymbol,
      value: b.address.toBase58(),
    }));

  const { bankAddress } = await inquirer.prompt([{
    type: "list",
    name: "bankAddress",
    message: "Which token do you want to deposit?",
    choices: bankChoices,
  }]);

  const bank = (client as any).getBankByPk(bankAddress);
  if (!bank) { console.log(chalk.red("Bank not found")); return; }

  const { amount } = await inquirer.prompt([{
    type: "input",
    name: "amount",
    message: `How much ${bank.tokenSymbol ?? "tokens"} to deposit?`,
    validate: (val: string) => {
      const n = parseFloat(val);
      if (isNaN(n) || n <= 0) return "Enter a positive number";
      return true;
    },
  }]);

  const depositAmount = parseFloat(amount);
  console.log(chalk.cyan(`\n  Deposit ${formatAmount(depositAmount)} ${bank.tokenSymbol}`));
  console.log(chalk.cyan("  Please confirm on your Ledger device.\n"));

  const spinner = ora("Submitting transaction...").start();
  try {
    const { instructions: updateFeedIxs } = await account.makeUpdateFeedIx([]);
    const depositIxs = await account.makeDepositIx(depositAmount, bank.address);

    const connection = (client as any).program.provider.connection;
    const sig = await sendWithCrank(
      connection,
      wallet,
      updateFeedIxs,
      depositIxs.instructions,
      depositIxs.keys
    );
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
