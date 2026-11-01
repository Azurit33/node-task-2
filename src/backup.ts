/* eslint-disable arrow-body-style */
/* eslint-disable max-len */
import { exec } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { promisify } from 'util';

const promisifiedExec = promisify(exec); // async version of exec function, should be used to run tar command
const logFilePath: string = 'backup_log.txt'; // the log file where backup hashes are stored, do not change

/**
 * Calculates a SHA-256 checksum for a given string.
 *
 * @param {string} str - The input string from which to generate the checksum (UTF8 encoding).
 * @returns {Promise<string>} A promise that resolves with the calculated checksum (HEX string).
 */
export const calculateDirectoryChecksum = async (str: string): Promise<string> => crypto.createHash('sha256').update(str, 'utf8').digest('hex');

/**
 * Retrieves the most recent backup hash from a log file.
 *
 * @param {string} logPath - Path to the log file containing backup hashes.
 * @returns {Promise<string | null>} A promise that resolves with the last backup hash found,
 *                                   or null if no hash is found or if an error occurs.
 */
export const getLastBackupHash = async (logPath: string): Promise<string | null> => {
  try {
    const log = await fs.readFile(logPath, 'utf8');
    const matches = [...log.matchAll(/HASH:\s*(\S+)/g)];

    if (matches.length === 0) {
      return null;
    }

    return matches[matches.length - 1][1];
  } catch {
    return null;
  }
};

/**
 * Creates an archive from a specified source directory and stores it in a destination directory.
 * Logs the result to a predetermined log file.
 *
 * @param {string} sourceDir - The directory to archive.
 * @param {string} destinationDir - The directory where the archive is to be stored.
 * @throws {Error} Throws an error if the archive creation fails.
 * @returns {Promise<void>} A promise that resolves when the archive has been successfully created.
 */
export const createArchive = async (sourceDir: string, destinationDir: string): Promise<void> => {
  // 1. Backup Filename
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFilePath = path.join(destinationDir, `backup-${timestamp}.tar.gz`);

  try {
    // 2. Backup Execution
    await promisifiedExec(`tar -czf "${backupFilePath}" -C "${sourceDir}" .`);

    // 3. Checksum and Logging
    const files = await fs.readdir(sourceDir);
    const hash = await calculateDirectoryChecksum(files.sort().join(','));

    await fs.appendFile(
      logFilePath,
      `${new Date().toISOString()}: SUCCESS: Backup created at ${backupFilePath}, HASH: ${hash}\n`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await fs.appendFile(
      logFilePath,
      `${new Date().toISOString()}: FAILED: ${message}\n`
    );

    throw new Error(`Failed to create backup, error = ${message}`);
  }
};

/**
 * Executes the backup process by checking the checksum of the current directory against the last backup.
 * If the checksums differ, it proceeds to create a new archive; otherwise, it skips the backup process.
 *
 * @param {string} sourceDir - The source directory to check for changes.
 * @param {string} destinationDir - The destination directory for storing the backup archive.
 * @throws {Error} Throws an error if the directory creation or any part of the backup process fails.
 * @returns {Promise<void>} A promise that resolves when the backup process has completed,
 *                          either by creating a new backup or skipping the process.
 */
export const runBackup = async (sourceDir: string, destinationDir: string): Promise<void> => {
  try {
    // 1. Directory Content Retrieval
    const files = await fs.readdir(sourceDir);
    const currentHash = await calculateDirectoryChecksum(files.sort().join(','));

    // 2. Checksum Verification
    const previousHash = await getLastBackupHash(logFilePath);

    // 3. Backup Decision
    if (currentHash === previousHash) {
      console.log('No changes detected since last backup');
      return;
    }

    await fs.mkdir(destinationDir, { recursive: true });
    await createArchive(sourceDir, destinationDir);
  } catch (error) {
    // 4. Error Handling
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
  }
};