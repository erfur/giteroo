function parseGitUrl(url) {
  const patterns = [
    /^https?:\/\/(?:[^@]+@)?([^\/]+)\/([^\/]+)\/([^\/]+?)(?:\.git)?$/,
    /^git@([^:]+):([^\/]+)\/([^\/]+?)(?:\.git)?$/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      const host = match[1];
      const username = match[2];
      const repoName = match[3].replace(/\.git$/, '');
      return { username, repoName, host };
    }
  }
  
  throw new Error('Invalid git URL format');
}

function validateBackupInterval(interval) {
  const validIntervals = ['15m', '1h', '6h', '1d', '1w'];
  return validIntervals.includes(interval);
}

module.exports = {
  parseGitUrl,
  validateBackupInterval
};

