const simpleGit = require('simple-git');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const logger = require('./logger');
const repositoryModel = require('../models/repository');

const REPOSITORIES_DIR = process.env.REPOSITORIES_DIR || '/app/repositories';

function getRepositoryPath(username, repoName) {
  return path.join(REPOSITORIES_DIR, username, repoName);
}

function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

async function cloneRepository(repoId, remoteUrl, username, repoName) {
  const repoPath = getRepositoryPath(username, repoName);
  
  try {
    repositoryModel.update(repoId, { last_status: 'cloning' });
    
    ensureDirectoryExists(path.dirname(repoPath));
    
    if (fs.existsSync(repoPath)) {
      throw new Error('Repository directory already exists');
    }
    
    const git = simpleGit();
    await git.clone(remoteUrl, repoPath);
    
    repositoryModel.update(repoId, {
      last_status: 'success',
      last_backup_at: new Date().toISOString()
    });
    
    logger.info(`Cloned repository: ${username}/${repoName}`);
    return { success: true };
  } catch (error) {
    logger.error(`Failed to clone repository ${username}/${repoName}:`, error);
    repositoryModel.update(repoId, { last_status: 'error' });
    throw error;
  }
}

async function fetchRepository(repoId, username, repoName) {
  const repoPath = getRepositoryPath(username, repoName);
  
  try {
    if (!fs.existsSync(repoPath)) {
      throw new Error('Repository directory does not exist');
    }
    
    repositoryModel.update(repoId, { last_status: 'fetching' });
    
    const git = simpleGit(repoPath);
    await git.fetch();
    
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
    logger.error(`Failed to fetch repository ${username}/${repoName}:`, error);
    repositoryModel.update(repoId, { last_status: 'error' });
    throw error;
  }
}

async function recloneRepository(repoId, remoteUrl, username, repoName) {
  const repoPath = getRepositoryPath(username, repoName);
  
  try {
    repositoryModel.update(repoId, { last_status: 'recloning' });
    
    if (fs.existsSync(repoPath)) {
      fs.rmSync(repoPath, { recursive: true, force: true });
    }
    
    await cloneRepository(repoId, remoteUrl, username, repoName);
    
    logger.info(`Recloned repository: ${username}/${repoName}`);
    return { success: true };
  } catch (error) {
    logger.error(`Failed to reclone repository ${username}/${repoName}:`, error);
    repositoryModel.update(repoId, { last_status: 'error' });
    throw error;
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
    if (format === 'zip') {
      execSync(`cd "${path.dirname(repoPath)}" && zip -r "${snapshotPath}" "${repoName}"`, {
        stdio: 'pipe'
      });
    } else if (format === 'tar.gz') {
      execSync(`cd "${path.dirname(repoPath)}" && tar -czf "${snapshotPath}" "${repoName}"`, {
        stdio: 'pipe'
      });
    } else {
      throw new Error(`Unsupported format: ${format}`);
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

module.exports = {
  cloneRepository,
  fetchRepository,
  recloneRepository,
  createSnapshot,
  getReadme,
  getRepositoryPath
};

