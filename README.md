# Auto Commit Message Bot

A lightweight VS Code extension that watches staged changes and automatically fills in the Source Control commit message with a context-aware summary. No buttons to click—stage a file and a draft message appears instantly. You can also run the "Auto Commit Message: Regenerate" command at any time to refresh the summary.

## Features

- 🚀 **Automatic summaries** as soon as new files are staged
- 🧠 **Heuristic analysis** that blends file metadata with staged diff highlights
- 🛡️ **User-friendly safeguards** so manually edited messages are not overwritten (unless you opt in)
- ⚙️ **Configurable debounce** delay to avoid noisy updates while staging many files
- 📝 **Command palette action** for on-demand regeneration

## Requirements

- VS Code 1.85.0 or newer
- The built-in `Git` extension (shipped with VS Code)

## Getting started

1. Clone this repository and install dependencies:
   ```bash
   npm install
   ```
2. Open the folder in VS Code and press `F5` to launch the extension host.
3. Stage one or more files in the Source Control view—the commit box will be populated automatically.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `autoCommitMessage.enable` | `true` | Master toggle for the extension. |
| `autoCommitMessage.debounce` | `300` | Delay (ms) before regenerating a message after staged changes are detected. |
| `autoCommitMessage.replaceUserMessage` | `false` | Allow the bot to overwrite a message you already edited. |

## Command palette

- `Auto Commit Message: Regenerate` — Force the extension to analyze staged files again and refresh the draft.

## Packaging

Build a `.vsix` package with:
```bash
npm run package
```
The resulting file can be installed via `code --install-extension <file>.vsix`.

## Contributing

Issues and pull requests are welcome. Please run `npm run lint` before submitting changes.
