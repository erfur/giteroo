# Security Fixes Applied

## Critical Issues Fixed

### 1. Command Injection Vulnerability (CRITICAL)
**Location**: `src/services/gitService.js` - `createSnapshot()` function
**Issue**: User-controlled input (username, repoName) was directly interpolated into shell commands without proper escaping.
**Fix**: 
- Added `shell-quote` package to properly escape shell arguments
- Added path validation to ensure paths are within allowed directories
- Validated format parameter against whitelist
- Used proper shell argument escaping before executing commands

### 2. Path Traversal Vulnerability (HIGH)
**Location**: `src/services/gitService.js` - `getRepositoryPath()` function
**Issue**: Username and repoName from parsed URLs were used directly in file paths without validation, allowing `../` sequences.
**Fix**:
- Added `sanitizePathComponent()` function to remove path traversal sequences and dangerous characters
- Added path resolution validation to ensure paths stay within REPOSITORIES_DIR
- Sanitize username and repoName in `parseGitUrl()` before use

### 3. Cross-Site Scripting (XSS) Vulnerability (MEDIUM)
**Location**: `src/routes/api.js` - README endpoint
**Issue**: Markdown content was parsed and rendered as HTML without sanitization, potentially allowing script execution.
**Fix**:
- Added `dompurify` and `jsdom` packages for server-side HTML sanitization
- Sanitize all HTML output from markdown parsing before sending to client

## Security Improvements

1. **Input Sanitization**: All user input (username, repoName) is now sanitized to remove:
   - Path traversal sequences (`..`)
   - Path separators (`/`, `\`)
   - Invalid filename characters
   - Control characters

2. **Path Validation**: All file paths are validated to ensure they stay within intended directories

3. **Command Injection Prevention**: All shell command arguments are properly escaped using `shell-quote`

4. **XSS Prevention**: All HTML content is sanitized using DOMPurify before rendering

## Dependencies Added

- `shell-quote`: For safe shell argument escaping
- `dompurify`: For HTML sanitization
- `jsdom`: Required for server-side DOMPurify usage

## Recommendations

1. Consider implementing rate limiting on API endpoints
2. Add authentication/authorization if this will be exposed to untrusted users
3. Implement input length limits to prevent DoS attacks
4. Add Content Security Policy (CSP) headers
5. Consider using parameterized queries for all database operations (already implemented)
6. Regular security audits and dependency updates

