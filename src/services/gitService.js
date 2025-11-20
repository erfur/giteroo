const simpleGit = require('simple-git');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { escape } = require('shell-quote');
const logger = require('./logger');
const repositoryModel = require('../models/repository');

const REPOSITORIES_DIR = process.env.REPOSITORIES_DIR || '/app/repositories';

// Track in-flight operations for shutdown handling
const inFlightOperations = new Set();
let isShuttingDown = false;

function getRepositoryPath(username, repoName) {
  // Ensure path is within REPOSITORIES_DIR to prevent path traversal
  const safePath = path.join(REPOSITORIES_DIR, username, repoName);
  const resolvedPath = path.resolve(safePath);
  const resolvedBase = path.resolve(REPOSITORIES_DIR);
  
  if (!resolvedPath.startsWith(resolvedBase)) {
    throw new Error('Path traversal detected');
  }
  
  return resolvedPath;
}

function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

async function cloneRepository(repoId, remoteUrl, username, repoName) {
  const repoPath = getRepositoryPath(username, repoName);
  const operationId = `clone-${repoId}`;
  
  try {
    if (isShuttingDown) {
      repositoryModel.update(repoId, { last_status: 'interrupted' });
      throw new Error('Operation interrupted due to shutdown');
    }
    
    inFlightOperations.add(operationId);
    repositoryModel.update(repoId, { last_status: 'cloning' });
    
    ensureDirectoryExists(path.dirname(repoPath));
    
    if (fs.existsSync(repoPath)) {
      throw new Error('Repository directory already exists');
    }
    
    if (isShuttingDown) {
      repositoryModel.update(repoId, { last_status: 'interrupted' });
      throw new Error('Operation interrupted due to shutdown');
    }
    
    const git = simpleGit();
    await git.clone(remoteUrl, repoPath);
    
    if (isShuttingDown) {
      repositoryModel.update(repoId, { last_status: 'interrupted' });
      throw new Error('Operation interrupted due to shutdown');
    }
    
    repositoryModel.update(repoId, {
      last_status: 'success',
      last_backup_at: new Date().toISOString()
    });
    
    logger.info(`Cloned repository: ${username}/${repoName}`);
    return { success: true };
  } catch (error) {
    if (isShuttingDown && !error.message.includes('interrupted')) {
      repositoryModel.update(repoId, { last_status: 'interrupted' });
    } else if (!isShuttingDown) {
      logger.error(`Failed to clone repository ${username}/${repoName}:`, error);
      repositoryModel.update(repoId, { last_status: 'error' });
    }
    throw error;
  } finally {
    inFlightOperations.delete(operationId);
  }
}

async function fetchRepository(repoId, username, repoName) {
  const repoPath = getRepositoryPath(username, repoName);
  const operationId = `fetch-${repoId}`;
  
  try {
    if (isShuttingDown) {
      repositoryModel.update(repoId, { last_status: 'interrupted' });
      throw new Error('Operation interrupted due to shutdown');
    }
    
    if (!fs.existsSync(repoPath)) {
      throw new Error('Repository directory does not exist');
    }
    
    inFlightOperations.add(operationId);
    repositoryModel.update(repoId, { last_status: 'fetching' });
    
    if (isShuttingDown) {
      repositoryModel.update(repoId, { last_status: 'interrupted' });
      throw new Error('Operation interrupted due to shutdown');
    }
    
    const git = simpleGit(repoPath);
    await git.fetch();
    
    if (isShuttingDown) {
      repositoryModel.update(repoId, { last_status: 'interrupted' });
      throw new Error('Operation interrupted due to shutdown');
    }
    
    const status = await git.status();
    
    if (status.conflicted.length > 0) {
      repositoryModel.update(repoId, {
        last_status: 'conflict',
        last_backup_at: new Date().toISOString()
      });
      logger.warn(`Conflict detected in ${username}/${repoName}`);
      return { success: true, conflict: true };
    }
    
    repositoryModel.update(repoId, {
      last_status: 'success',
      last_backup_at: new Date().toISOString()
    });
    
    logger.info(`Fetched repository: ${username}/${repoName}`);
    return { success: true };
  } catch (error) {
    if (isShuttingDown && !error.message.includes('interrupted')) {
      repositoryModel.update(repoId, { last_status: 'interrupted' });
    } else if (!isShuttingDown) {
      logger.error(`Failed to fetch repository ${username}/${repoName}:`, error);
      repositoryModel.update(repoId, { last_status: 'error' });
    }
    throw error;
  } finally {
    inFlightOperations.delete(operationId);
  }
}

async function recloneRepository(repoId, remoteUrl, username, repoName) {
  const repoPath = getRepositoryPath(username, repoName);
  const operationId = `reclone-${repoId}`;
  
  try {
    if (isShuttingDown) {
      repositoryModel.update(repoId, { last_status: 'interrupted' });
      throw new Error('Operation interrupted due to shutdown');
    }
    
    inFlightOperations.add(operationId);
    repositoryModel.update(repoId, { last_status: 'recloning' });
    
    if (fs.existsSync(repoPath)) {
      fs.rmSync(repoPath, { recursive: true, force: true });
    }
    
    if (isShuttingDown) {
      repositoryModel.update(repoId, { last_status: 'interrupted' });
      throw new Error('Operation interrupted due to shutdown');
    }
    
    await cloneRepository(repoId, remoteUrl, username, repoName);
    
    logger.info(`Recloned repository: ${username}/${repoName}`);
    return { success: true };
  } catch (error) {
    if (isShuttingDown && !error.message.includes('interrupted')) {
      repositoryModel.update(repoId, { last_status: 'interrupted' });
    } else if (!isShuttingDown) {
      logger.error(`Failed to reclone repository ${username}/${repoName}:`, error);
      repositoryModel.update(repoId, { last_status: 'error' });
    }
    throw error;
  } finally {
    inFlightOperations.delete(operationId);
  }
}

function createSnapshot(repoId, username, repoName, format = 'zip') {
  const repoPath = getRepositoryPath(username, repoName);
  
  if (!fs.existsSync(repoPath)) {
    throw new Error('Repository directory does not exist');
  }
  
  const snapshotDir = path.join(REPOSITORIES_DIR, '..', 'snapshots');
  ensureDirectoryExists(snapshotDir);
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${username}-${repoName}-${timestamp}.${format}`;
  const snapshotPath = path.join(snapshotDir, filename);
  
  try {
    // Validate format to prevent command injection
    if (!['zip', 'tar.gz'].includes(format)) {
      throw new Error(`Unsupported format: ${format}`);
    }
    
    // Use path operations instead of shell commands to prevent command injection
    const parentDir = path.dirname(repoPath);
    const safeRepoName = path.basename(repoPath);
    const safeSnapshotPath = path.resolve(snapshotPath);
    const safeParentDir = path.resolve(parentDir);
    
    // Ensure paths are safe (no path traversal)
    if (!safeSnapshotPath.startsWith(path.resolve(REPOSITORIES_DIR, '..', 'snapshots'))) {
      throw new Error('Invalid snapshot path');
    }
    if (!safeParentDir.startsWith(path.resolve(REPOSITORIES_DIR))) {
      throw new Error('Invalid repository path');
    }
    
    // Escape all arguments to prevent command injection
    // shell-quote.escape() takes an array and returns escaped string
    // We need to escape each argument separately
    const escapedParentDir = escape([safeParentDir]);
    const escapedRepoName = escape([safeRepoName]);
    const escapedSnapshotPath = escape([safeSnapshotPath]);
    
    // Build command with properly escaped arguments
    if (format === 'zip') {
      const cmd = `cd ${escapedParentDir} && zip -r ${escapedSnapshotPath} ${escapedRepoName}`;
      execSync(cmd, {
        stdio: 'pipe',
        shell: '/bin/bash'
      });
    } else if (format === 'tar.gz') {
      const cmd = `cd ${escapedParentDir} && tar -czf ${escapedSnapshotPath} ${escapedRepoName}`;
      execSync(cmd, {
        stdio: 'pipe',
        shell: '/bin/bash'
      });
    }
    
    logger.info(`Created snapshot: ${filename}`);
    return { path: snapshotPath, filename };
  } catch (error) {
    logger.error(`Failed to create snapshot for ${username}/${repoName}:`, error);
    throw error;
  }
}

function getReadme(repoId, username, repoName) {
  const repoPath = getRepositoryPath(username, repoName);
  
  const readmePaths = [
    path.join(repoPath, 'README.md'),
    path.join(repoPath, 'readme.md')
  ];
  
  for (const readmePath of readmePaths) {
    if (fs.existsSync(readmePath)) {
      return fs.readFileSync(readmePath, 'utf-8');
    }
  }
  
  return null;
}

async function getLastCommitTime(username, repoName) {
  const repoPath = getRepositoryPath(username, repoName);
  
  if (!fs.existsSync(repoPath)) {
    return null;
  }
  
  try {
    const git = simpleGit(repoPath);
    const log = await git.log({ maxCount: 1 });
    
    if (log && log.latest && log.latest.date) {
      return new Date(log.latest.date);
    }
    
    return null;
  } catch (error) {
    logger.error(`Failed to get last commit time for ${username}/${repoName}:`, error);
    return null;
  }
}

function shutdown() {
  isShuttingDown = true;
  logger.info('Shutting down git service...');
  
  // Mark all in-flight operations as interrupted
  inFlightOperations.forEach(operationId => {
    const match = operationId.match(/^(clone|fetch|reclone)-(\d+)$/);
    if (match) {
      const repoId = parseInt(match[2]);
      repositoryModel.update(repoId, { last_status: 'interrupted' });
      logger.info(`Marked in-flight operation ${operationId} as interrupted`);
    }
  });
  
  logger.info(`Marked ${inFlightOperations.size} in-flight operation(s) as interrupted`);
  logger.info('Git service shut down complete');
}

module.exports = {
  cloneRepository,
  fetchRepository,
  recloneRepository,
  createSnapshot,
  getReadme,
  getRepositoryPath,
  getLastCommitTime,
  shutdown
};

