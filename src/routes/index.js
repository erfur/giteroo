const express = require('express');
const router = express.Router();
const repositoryModel = require('../models/repository');

router.get('/', (req, res) => {
  const filters = {
    tag: req.query.tag,
    search: req.query.search
  };
  
  const repositories = repositoryModel.getAll(filters);
  res.render('index', {
    repositories,
    filters
  });
});

module.exports = router;

