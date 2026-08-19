/** Entry point for `node --import ./test/register.mjs` — installs the alias hook. */
import { register } from "node:module";

register("./alias-hook.mjs", import.meta.url);
