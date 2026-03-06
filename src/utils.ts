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
