// Loads the browser scripts (classic scripts that attach to globalThis) into a vm context,
// exactly in the order index.html does, and returns that context's globals.

import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const libDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "lib");

export function loadLib(...names) {
  const context = vm.createContext({ console, Intl, Date, Math, JSON, structuredClone });
  for (const name of names) {
    const file = path.join(libDir, name);
    vm.runInContext(readFileSync(file, "utf8"), context, { filename: file });
  }
  return context;
}
