const express = require('express');
const router = express.Router();
const repositoryModel = require('../models/repository');
const gitService = require('../services/gitService');

router.get('/', async (req, res) => {
  const filters = {
    tag: req.query.tag,
    search: req.query.search
  };

  const repositories = repositoryModel.getAll(filters);
  const totalCount = repositoryModel.getTotalCount();
  const filteredCount = repositories.length;

  const repositoriesWithCommitTime = await Promise.all(
    repositories.map(async (repo) => {
      const lastCommitTime = await gitService.getLastCommitTime(repo.username, repo.repo_name);
      return {
        ...repo,
        last_commit_time: lastCommitTime
      };
    })
  );

  res.render('index', {
    repositories: repositoriesWithCommitTime,
    filters,
    totalCount,
    filteredCount
  });
});

module.exports = router;

