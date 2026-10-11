import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// The package itself is CommonJS (no top-level "type"), so Node would read
// dist/esm/*.js as CJS too. This marker scopes that one directory to ESM.
const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "esm");
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module" }, null, 2));
