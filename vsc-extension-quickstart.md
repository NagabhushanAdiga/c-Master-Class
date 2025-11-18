# Welcome to Auto Commit Message Bot

This folder contains the source for a VS Code extension that generates commit messages automatically when files are staged.

## What's in the folder

- `extension.js` — entry point registering commands, wiring the Git API, and generating messages.
- `package.json` — extension metadata, activation events, commands, and configuration.
- `.eslintrc.json` — linting rules.
- `scripts/no-tests.js` — placeholder for the npm test task.

## Start debugging

1. Press `F5` to open a new Extension Development Host window.
2. Stage a file in the Source Control view and watch the commit message box update automatically.

## Make changes

- You can reload the extension (`Ctrl+R` in the dev host) after editing `extension.js`.
- Use `console.log` or the built-in Output channel (`Auto Commit Message Bot`) for diagnostics.

## Explore the API

- The built-in Git extension exposes repositories via `getAPI(1)`. See `extension.js` for usage examples.
- VS Code extension docs: https://code.visualstudio.com/api

## Run tests

Tests are not configured yet. Add your preferred test runner and update `npm run test` when ready.
