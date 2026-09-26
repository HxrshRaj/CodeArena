// jasmine's package.json restricts its "exports" map, so a bare
// import("jasmine/bin/jasmine.js") is blocked by Node's ESM resolver even
// though the file exists. npm workspaces hoist devDependencies to the repo
// root node_modules, so reach the real file directly instead — the same
// thing npm's own generated .bin/jasmine shim script does internally.
import { pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(here, "../../../node_modules/jasmine/bin/jasmine.js");

await import(pathToFileURL(cliPath).href);
