import { run } from "./cli.js";

process.exitCode = run(process.argv.slice(2));
