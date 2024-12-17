/* eslint-disable max-len */
import { runBackup } from './backup';

const sourceDir = process.argv[2];
const destinationDir = process.argv[3];

runBackup(sourceDir, destinationDir);

// ts-node ./src/index.ts /Users/.../nodejs-gmp-solutions/src /Users/.../nodejs-gmp-solutions/src-backup
