function sanitizePathComponent(component) {
  // Remove path traversal sequences and dangerous characters
  return component
    .replace(/\.\./g, '') // Remove path traversal
    .replace(/[\/\\]/g, '') // Remove path separators
    .replace(/[<>:"|?*\x00-\x1f]/g, '') // Remove invalid filename characters
    .trim();
}

function parseGitUrl(url) {
  const patterns = [
    /^https?:\/\/(?:[^@]+@)?([^\/]+)\/([^\/]+)\/([^\/]+?)(?:\.git)?$/,
    /^git@([^:]+):([^\/]+)\/([^\/]+?)(?:\.git)?$/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      const host = match[1];
      let username = match[2];
      let repoName = match[3].replace(/\.git$/, '');
      
      // Sanitize username and repoName to prevent path traversal and command injection
      username = sanitizePathComponent(username);
      repoName = sanitizePathComponent(repoName);
      
      if (!username || !repoName) {
        throw new Error('Invalid git URL format: username or repository name is empty after sanitization');
      }
      
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
  validateBackupInterval,
  sanitizePathComponent
};

