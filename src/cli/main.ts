#!/usr/bin/env node
import { nodeDeps } from './node-deps.js';
import { run } from './run.js';

// The entry point of the command `ratatoskr-site` (`bin` in package.json).
process.exitCode = await run(process.argv.slice(2), nodeDeps());
