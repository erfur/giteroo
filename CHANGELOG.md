# Changelog

## [Unreleased]

### Fixed
- Fix "Last Commit" value not updating after fetch operations. The previous implementation checked the local HEAD branch, which remains unchanged after `git fetch`. Now correctly reads from the remote tracking branch (e.g., `origin/main`) to reflect the actual latest commit from the remote repository.
