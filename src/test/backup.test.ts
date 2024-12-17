import * as childProcess from 'child_process';
import * as fs from 'fs/promises';
import * as backup from '../backup';

jest.mock('child_process');
jest.mock('fs/promises');

describe('Backup', () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(new Date('2020-01-01'));
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('getLastBackupHash()', () => {
    it('returns the last hash from a log file', async () => {
      const logContent = '2021: SUCCESS: Backup created, HASH: abc123\n2022: SUCCESS: Backup created, HASH: def456';
      jest.spyOn(fs, 'readFile').mockResolvedValue(logContent);

      const lastHash = await backup.getLastBackupHash('/random-path');
      expect(lastHash).toBe('def456');
    });

    it('returns null if the log file has no hash entries', async () => {
      jest.spyOn(fs, 'readFile').mockResolvedValue('Log has no hash entry');
      const lastHash = await backup.getLastBackupHash('/random-path');
      expect(lastHash).toBeNull();
    });

    it('returns null on reading errors', async () => {
      jest.spyOn(fs, 'readFile').mockRejectedValue(new Error('Read error'));
      const lastHash = await backup.getLastBackupHash('/random-path');
      expect(lastHash).toBeNull();
    });
  });

  describe('createArchive()', () => {
    it('creates a backup successfully and writes SUCCESS to backup log file', async () => {
      jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined);
      // @ts-expect-error error
      jest.spyOn(fs, 'readdir').mockResolvedValue(['file1.txt']);
      jest.spyOn(fs, 'appendFile').mockResolvedValue();

      const execSpy = jest.spyOn(childProcess, 'exec').mockImplementation(jest.fn().mockImplementation((cmd, callback) => {
        callback(null, { stdout: '', stderr: '' });
      }));

      await backup.createArchive('/input-path', '/output-path');

      expect(execSpy).toHaveBeenCalledWith('tar -czf "/output-path/backup-2020-01-01T00-00-00-000Z.tar.gz" -C "/input-path" .', expect.any(Function));
      expect(fs.appendFile).toHaveBeenCalledWith('backup_log.txt', '2020-01-01T00:00:00.000Z: SUCCESS: Backup created at /output-path/backup-2020-01-01T00-00-00-000Z.tar.gz, HASH: 55ae75d991c770d8f3ef07cbfde124ffce9c420da5db6203afab700b27e10cf9\n');
    });

    it('throws an error when tar command fails and writes FAILED to backup log file', async () => {
      jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined);
      // @ts-expect-error error
      jest.spyOn(fs, 'readdir').mockResolvedValue(['file1.txt']);
      jest.spyOn(fs, 'appendFile').mockResolvedValue();
      jest.spyOn(childProcess, 'exec').mockImplementation(jest.fn().mockImplementation((cmd, callback) => {
        throw new Error('tar command failed');
      }));

      await expect(backup.createArchive('/input-path', '/output-path')).rejects.toThrow('Failed to create backup, error = tar command failed');
      expect(fs.appendFile).toHaveBeenCalledWith('backup_log.txt', '2020-01-01T00:00:00.000Z: FAILED: tar command failed\n');
    });
  });

  describe('runBackup()', () => {
    it('skips if the current checksum matches the last backup checksum', async () => {
      jest.spyOn(backup, 'createArchive');
      jest.spyOn(process.stdout, 'write');
      // @ts-expect-error error
      jest.spyOn(fs, 'readdir').mockResolvedValue(['file1.txt']);
      jest.spyOn(backup, 'getLastBackupHash').mockResolvedValue('checksum-1');
      jest.spyOn(backup, 'calculateDirectoryChecksum').mockResolvedValue('checksum-1');

      await backup.runBackup('/input-path', '/output-path');
      expect(backup.createArchive).not.toHaveBeenCalled();
      expect(process.stdout.write).toHaveBeenCalled();
    });

    it('creates a backup if checksums do not match', async () => {
      jest.spyOn(backup, 'createArchive');
      // @ts-expect-error error
      jest.spyOn(fs, 'readdir').mockResolvedValue(['file1.txt']);
      jest.spyOn(backup, 'getLastBackupHash').mockResolvedValue('checksum-1');
      jest.spyOn(backup, 'calculateDirectoryChecksum').mockResolvedValue('checksum-2');
      jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined);

      await backup.runBackup('/input-path', '/output-path');
      expect(backup.createArchive).toHaveBeenCalled();
    });

    it('creates a backup directory if it\'s missing', async () => {
      // @ts-expect-error error
      jest.spyOn(fs, 'readdir').mockResolvedValue(['file1.txt']);
      jest.spyOn(backup, 'getLastBackupHash').mockResolvedValue('checksum-1');
      jest.spyOn(backup, 'calculateDirectoryChecksum').mockResolvedValue('checksum-2');
      jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined);

      await backup.runBackup('/input-path', '/output-path');
      expect(fs.mkdir).toHaveBeenCalledWith('/output-path', { recursive: true });
    });

    it('logs error to stderr if any error was thrown', async () => {
      jest.spyOn(process.stderr, 'write');
      // @ts-expect-error error
      jest.spyOn(fs, 'readdir').mockResolvedValue(['file1.txt']);
      jest.spyOn(backup, 'getLastBackupHash').mockResolvedValue('checksum-1');
      jest.spyOn(backup, 'calculateDirectoryChecksum').mockResolvedValue('checksum-2');
      jest.spyOn(fs, 'mkdir').mockRejectedValue(new Error('Permission denied'));

      await backup.runBackup('/input-path', '/output-path');
      expect(process.stderr.write).toHaveBeenCalled();
    });
  });
});
