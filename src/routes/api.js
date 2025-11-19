const express = require('express');
const router = express.Router();
const repositoryModel = require('../models/repository');
const gitService = require('../services/gitService');
const scheduler = require('../services/scheduler');
const { parseGitUrl, validateBackupInterval } = require('../utils/helpers');
const logger = require('../services/logger');
const { marked } = require('marked');
const path = require('path');
const fs = require('fs');

router.post('/repositories', async (req, res) => {
  try {
    const { url, tags, backup_interval, bulk } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const interval = backup_interval || '1d';
    if (!validateBackupInterval(interval)) {
      return res.status(400).json({ error: 'Invalid backup interval' });
    }

    const urls = bulk ? url.split('\n').filter(u => u.trim()) : [url];
    const results = [];

    for (const repoUrl of urls) {
      try {
        const { username, repoName } = parseGitUrl(repoUrl.trim());

        const repo = repositoryModel.create({
          remote_url: repoUrl.trim(),
          username,
          repo_name: repoName,
          tags: tags || '',
          backup_interval: interval,
          enabled: true
        });

        if (!repo) {
          throw new Error('Failed to create repository in database');
        }

        scheduler.scheduleRepository(repo);

        try {
          await gitService.cloneRepository(repo.id, repoUrl.trim(), username, repoName);
          results.push(repo);
        } catch (cloneError) {
          logger.error(`Clone failed for ${repoUrl}, but repository was created:`, cloneError);
          results.push({ ...repo, cloneError: cloneError.message });
        }
      } catch (error) {
        logger.error(`Failed to add repository ${repoUrl}:`, error);
        results.push({ error: error.message, url: repoUrl });
      }
    }

    res.json({ results });
  } catch (error) {
    logger.error('Failed to create repository:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/repositories', (req, res) => {
  try {
    const filters = {
      tag: req.query.tag,
      search: req.query.search
    };

    const repositories = repositoryModel.getAll(filters);
    res.json(repositories);
  } catch (error) {
    logger.error('Failed to get repositories:', error);
    res.status(500).json({ error: error.message });
  }
});

router.delete('/repositories/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const repo = repositoryModel.getById(id);

    if (!repo) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    scheduler.unscheduleRepository(id);

    const repoPath = gitService.getRepositoryPath(repo.username, repo.repo_name);
    if (fs.existsSync(repoPath)) {
      fs.rmSync(repoPath, { recursive: true, force: true });
    }

    repositoryModel.remove(id);
    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to delete repository:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/repositories/:id/toggle', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const repo = repositoryModel.getById(id);

    if (!repo) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    const enabled = !repo.enabled;
    repositoryModel.update(id, { enabled });

    if (enabled) {
      scheduler.scheduleRepository({ ...repo, enabled });
    } else {
      scheduler.unscheduleRepository(id);
    }

    res.json({ enabled });
  } catch (error) {
    logger.error('Failed to toggle repository:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/repositories/:id/backup', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const repo = repositoryModel.getById(id);

    if (!repo) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    await gitService.fetchRepository(id, repo.username, repo.repo_name);
    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to backup repository:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/repositories/:id/reclone', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const repo = repositoryModel.getById(id);

    if (!repo) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    await gitService.recloneRepository(id, repo.remote_url, repo.username, repo.repo_name);
    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to reclone repository:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/repositories/:id/snapshot', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const format = req.query.format || 'zip';
    const repo = repositoryModel.getById(id);

    if (!repo) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    if (!['zip', 'tar.gz'].includes(format)) {
      return res.status(400).json({ error: 'Invalid format. Use zip or tar.gz' });
    }

    const { path: snapshotPath, filename } = gitService.createSnapshot(id, repo.username, repo.repo_name, format);

    res.download(snapshotPath, filename, (err) => {
      if (err) {
        logger.error('Failed to send snapshot:', err);
      } else {
        setTimeout(() => {
          if (fs.existsSync(snapshotPath)) {
            fs.unlinkSync(snapshotPath);
          }
        }, 1000);
      }
    });
  } catch (error) {
    logger.error('Failed to create snapshot:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/repositories/:id/readme', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const repo = repositoryModel.getById(id);

    if (!repo) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    const readmeContent = gitService.getReadme(id, repo.username, repo.repo_name);

    if (!readmeContent) {
      return res.status(404).json({ error: 'README not found' });
    }

    const html = marked.parse(readmeContent);
    res.json({ html });
  } catch (error) {
    logger.error('Failed to get README:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

