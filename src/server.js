const express = require('express');
const path = require('path');
const repositoryModel = require('./models/repository');
const scheduler = require('./services/scheduler');
const logger = require('./services/logger');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

app.use('/', require('./routes/index'));
app.use('/api', require('./routes/api'));

async function start() {
  try {
    await repositoryModel.initDatabase();
    scheduler.initializeScheduler();
    
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();

