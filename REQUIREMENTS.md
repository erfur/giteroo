# Requirements

## web interface

- Single page web interface.
- Link input box
  - Toggle to enable bulk add
  - Tags
  - backup interval selector
    - options: 15m, 1h, 6h, 1d, 1w
- Repository widget:
  - remote address
  - user name
  - repository name
  - Display last backup status on each repository
    - Use red color for failed backup
    - Use green color for succesful backup
    - Use solarized colors for statuses
  - Buttons
    - download snapshot as zip or tar.gz archive
    - remove repository
    - toggle enable/disable sync (default: enabled)
    - run backup now
    - reclone
      - Should remove the current local repository and clone the remote repository
  - If the repository includes a README.md/readme.md file, add a toggle button to display the readme
    - Support markdown rendering
- Ability to filter by tag
- Ability to filter by string
- Show currently applied filter

## git features

- Keep mirrored repositories on disk: /app/repositories/<user_name>/<repo_name>
- Clone a new repository when it is added with the input box
- Fetch each repository in their configured intervals
  - If not accessible, set status accordingly
  - If there is a conflict, set status accordingly

## logs

- Write logs to stderr and under /app/logs/ with rotating log files.

## ops

- a Dockerfile and docker-compose.yml for deployment
- mark jobs as interrupted in case of preemptive shutdown