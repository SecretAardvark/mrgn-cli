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
  const localPath = join(process.cwd(), ".mrgnrc.json");
  if (existsSync(localPath)) {
    const raw = JSON.parse(readFileSync(localPath, "utf-8"));
    return { ...DEFAULT_CONFIG, ...raw };
  }

  const globalPath = join(homedir(), ".config", "mrgn", "config.json");
  if (existsSync(globalPath)) {
    const raw = JSON.parse(readFileSync(globalPath, "utf-8"));
    return { ...DEFAULT_CONFIG, ...raw };
  }

  return DEFAULT_CONFIG;
}
