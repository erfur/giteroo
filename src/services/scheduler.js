const cron = require('node-cron');
const logger = require('./logger');
const repositoryModel = require('../models/repository');
const gitService = require('./gitService');

let jobs = new Map();
let isShuttingDown = false;

const INTERVAL_CRON_MAP = {
  '15m': '*/15 * * * *',
  '1h': '0 * * * *',
  '6h': '0 */6 * * *',
  '1d': '0 0 * * *',
  '1w': '0 0 * * 0'
};

function scheduleRepository(repo) {
  if (!repo || !repo.enabled) {
    return;
  }
  
  const cronPattern = INTERVAL_CRON_MAP[repo.backup_interval] || INTERVAL_CRON_MAP['1d'];
  const jobId = `repo-${repo.id}`;
  
  if (jobs.has(jobId)) {
    jobs.get(jobId).stop();
  }
  
  const job = cron.schedule(cronPattern, async () => {
    if (isShuttingDown) {
      logger.info(`Job interrupted for repository ${repo.id} due to shutdown`);
      repositoryModel.update(repo.id, { last_status: 'interrupted' });
      return;
    }
    
    try {
      logger.info(`Running scheduled fetch for repository ${repo.id}`);
      await gitService.fetchRepository(repo.id, repo.username, repo.repo_name);
    } catch (error) {
      logger.error(`Scheduled fetch failed for repository ${repo.id}:`, error);
    }
  }, {
    scheduled: true,
    timezone: 'UTC'
  });
  
  jobs.set(jobId, job);
  logger.info(`Scheduled repository ${repo.id} with interval ${repo.backup_interval}`);
}

function unscheduleRepository(repoId) {
  const jobId = `repo-${repoId}`;
  if (jobs.has(jobId)) {
    jobs.get(jobId).stop();
    jobs.delete(jobId);
    logger.info(`Unscheduled repository ${repoId}`);
  }
}

function initializeScheduler() {
  const repositories = repositoryModel.getAll();
  repositories.forEach(repo => {
    if (repo.enabled) {
      scheduleRepository(repo);
    }
  });
  logger.info(`Initialized scheduler with ${repositories.length} repositories`);
}

function shutdown() {
  isShuttingDown = true;
  logger.info('Shutting down scheduler...');
  
  // Stop all scheduled jobs and mark as interrupted
  jobs.forEach((job, jobId) => {
    job.stop();
    const repoId = parseInt(jobId.replace('repo-', ''));
    repositoryModel.update(repoId, { last_status: 'interrupted' });
  });
  
  jobs.clear();
  
  // Shutdown git service to mark in-flight operations as interrupted
  gitService.shutdown();
  
  logger.info('Scheduler shut down complete');
}

module.exports = {
  scheduleRepository,
  unscheduleRepository,
  initializeScheduler,
  shutdown
};

