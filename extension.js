const vscode = require('vscode');
const path = require('path');

const repoControllers = new Map();
let gitAPI;
let outputChannel;

async function activate(context) {
  outputChannel = vscode.window.createOutputChannel('Auto Commit Message Bot');
  context.subscriptions.push(outputChannel);

  const gitExtension = vscode.extensions.getExtension('vscode.git');
  if (!gitExtension) {
    logError('Unable to find the built-in Git extension. Auto Commit Message Bot requires it to run.');
    return;
  }

  if (!gitExtension.isActive) {
    await gitExtension.activate();
  }

  const gitExports = gitExtension.exports;
  if (!gitExports || !gitExports.getAPI) {
    logError('The Git extension does not expose the expected API.');
    return;
  }

  gitAPI = gitExports.getAPI(1);
  if (!gitAPI) {
    logError('Unable to access the Git API.');
    return;
  }

  gitAPI.repositories.forEach(repo => trackRepository(repo, context));

  context.subscriptions.push(
    gitAPI.onDidOpenRepository(repo => trackRepository(repo, context))
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('autoCommitMessage')) {
        gitAPI.repositories.forEach(repo => scheduleGeneration(repo, { force: true }));
      }
    })
  );

  const regenerate = vscode.commands.registerCommand('autoCommitMessage.regenerate', async () => {
    const repo = pickRepository();
    if (!repo) {
      vscode.window.showInformationMessage('No Git repository is currently open.');
      return;
    }
    await generateCommitMessage(repo, { force: true, reason: 'manual command' });
  });

  context.subscriptions.push(regenerate);
}

function deactivate() {
  for (const controller of repoControllers.values()) {
    if (controller?.timer) {
      clearTimeout(controller.timer);
    }
  }
}

function pickRepository() {
  if (!gitAPI) {
    return undefined;
  }
  if (gitAPI.repositories.length === 1) {
    return gitAPI.repositories[0];
  }
  const active = gitAPI.repositories.find(repo => repo.ui?.selected);
  return active ?? gitAPI.repositories[0];
}

function trackRepository(repo, context) {
  if (repoControllers.has(repo)) {
    return;
  }

  const controller = {
    timer: undefined,
    lastSignature: '',
    lastMessage: '',
    userEdited: false
  };

  repoControllers.set(repo, controller);

  const schedule = (options = {}) => scheduleGeneration(repo, options);

  const statusDisposable = repo.onDidRunGitStatus(() => schedule());
  const inputDisposable = repo.inputBox.onDidChange(value => handleInputChange(value, repo));

  context.subscriptions.push(statusDisposable, inputDisposable);

  schedule({ immediate: true });
}

function handleInputChange(value, repo) {
  const controller = repoControllers.get(repo);
  if (!controller) {
    return;
  }
  controller.userEdited = value !== controller.lastMessage;
}

function scheduleGeneration(repo, options = {}) {
  const controller = repoControllers.get(repo);
  if (!controller) {
    return;
  }

  const delay = options.immediate ? 0 : Math.max(0, getConfigNumber('debounce', 300));

  if (controller.timer) {
    clearTimeout(controller.timer);
  }

  controller.timer = setTimeout(() => {
    controller.timer = undefined;
    generateCommitMessage(repo, options).catch(error => {
      logError('Failed to auto-generate commit message', error);
    });
  }, delay);
}

async function generateCommitMessage(repo, options = {}) {
  const config = vscode.workspace.getConfiguration('autoCommitMessage');
  if (!config.get('enable', true)) {
    return;
  }

  const controller = repoControllers.get(repo);
  if (!controller) {
    return;
  }

  const staged = repo?.state?.indexChanges ?? [];
  if (!staged.length) {
    if (repo.inputBox.value === controller.lastMessage) {
      repo.inputBox.value = '';
    }
    controller.lastSignature = '';
    controller.lastMessage = '';
    controller.userEdited = false;
    return;
  }

  const signature = staged.map(changeSignature).join('|');
  const unchanged = signature === controller.lastSignature;
  const respectUserMessage = !config.get('replaceUserMessage', false);
  const userHasCustomMessage = controller.userEdited && repo.inputBox.value !== controller.lastMessage;

  if (!options.force && (unchanged || (respectUserMessage && userHasCustomMessage))) {
    return;
  }

  const diff = await repo.diff(true).catch(error => {
    logError('Unable to read staged diff', error);
    return '';
  });

  const message = buildCommitMessage(staged, diff);
  if (!message) {
    return;
  }

  controller.lastSignature = signature;
  controller.lastMessage = message;
  controller.userEdited = false;
  repo.inputBox.value = message;

  logInfo(`Generated commit message${options.reason ? ` (${options.reason})` : ''}: ${message}`);
}

function buildCommitMessage(changes, diffText) {
  if (!changes.length) {
    return '';
  }

  const stats = summarizeStatuses(changes);
  const verb = pickVerb(stats, changes.length);
  const scope = deriveScope(changes);

  const detailSegments = describeFiles(changes);
  const conceptSegments = extractConcepts(diffText);
  const detail = [...detailSegments, ...conceptSegments]
    .filter(Boolean)
    .slice(0, 3)
    .join(', ');

  return detail ? `${verb} ${scope} – ${detail}` : `${verb} ${scope}`;
}

function summarizeStatuses(changes) {
  const result = { add: 0, modify: 0, delete: 0, rename: 0, copy: 0 };
  for (const change of changes) {
    const verb = statusToBucket(change.status);
    if (verb && result[verb] !== undefined) {
      result[verb] += 1;
    }
  }
  return result;
}

function pickVerb(stats, total) {
  const ranking = [
    { key: 'add', verb: 'Add' },
    { key: 'delete', verb: 'Remove' },
    { key: 'rename', verb: 'Rename' },
    { key: 'copy', verb: 'Copy' },
    { key: 'modify', verb: 'Update' }
  ];

  for (const item of ranking) {
    if (stats[item.key] === total && total > 0) {
      return item.verb;
    }
  }

  if (stats.add) {
    return 'Add';
  }
  if (stats.delete) {
    return 'Clean up';
  }
  return 'Update';
}

function deriveScope(changes) {
  const paths = changes.map(change => toWorkspaceRelative(change.renameUri ?? change.uri));
  const segments = paths.map(p => p.split('/').filter(Boolean));
  if (!segments.length) {
    return 'files';
  }
  const minLength = Math.min(...segments.map(s => s.length));
  const common = [];
  for (let i = 0; i < minLength; i += 1) {
    const segment = segments[0][i];
    if (segments.every(parts => parts[i] === segment)) {
      common.push(segment);
    } else {
      break;
    }
  }

  if (common.length === 0) {
    return 'files';
  }
  if (common.length === 1) {
    return common[0];
  }
  return common.slice(-1)[0];
}

function describeFiles(changes) {
  const descriptions = changes
    .slice(0, 3)
    .map(change => {
      const verb = statusToVerb(change.status);
      const fileName = toDisplayName(change.renameUri ?? change.uri);
      if (change.renameUri) {
        const from = toDisplayName(change.uri);
        return `${verb} ${from} → ${fileName}`;
      }
      return `${verb} ${fileName}`;
    });

  if (changes.length > descriptions.length) {
    descriptions.push(`+${changes.length - descriptions.length} more`);
  }

  return descriptions;
}

function extractConcepts(diffText) {
  if (!diffText) {
    return [];
  }
  const concepts = new Set();
  const lines = diffText.split('\n');
  const matcher = /(?:function|class|const|let|var|interface)\s+([A-Za-z0-9_]+)/;
  for (const line of lines) {
    if ((line.startsWith('+') || line.startsWith('-')) && !line.startsWith('+++') && !line.startsWith('---')) {
      const match = line.match(matcher);
      if (match && match[1]) {
        concepts.add(match[1]);
      }
    }
    if (concepts.size >= 3) {
      break;
    }
  }
  return Array.from(concepts);
}

function changeSignature(change) {
  const uri = toWorkspaceRelative(change.uri);
  const renameUri = change.renameUri ? toWorkspaceRelative(change.renameUri) : '';
  return `${change.status}:${uri}:${renameUri}`;
}

function statusToBucket(status) {
  switch (status) {
    case 1:
      return 'add';
    case 2:
      return 'delete';
    case 3:
      return 'rename';
    case 4:
      return 'copy';
    default:
      return 'modify';
  }
}

function statusToVerb(status) {
  switch (status) {
    case 1:
      return 'Add';
    case 2:
      return 'Remove';
    case 3:
      return 'Rename';
    case 4:
      return 'Copy';
    default:
      return 'Update';
  }
}

function toDisplayName(uri) {
  return path.basename(uri.fsPath).replace(/_/g, ' ');
}

function toWorkspaceRelative(uri) {
  return vscode.workspace.asRelativePath(uri, false) || uri.fsPath;
}

function getConfigNumber(key, fallback) {
  const config = vscode.workspace.getConfiguration('autoCommitMessage');
  const value = config.get(key);
  return typeof value === 'number' ? value : fallback;
}

function logInfo(message) {
  if (!outputChannel) {
    return;
  }
  outputChannel.appendLine(`[INFO ${new Date().toISOString()}] ${message}`);
}

function logError(message, error) {
  if (!outputChannel) {
    return;
  }
  outputChannel.appendLine(`[ERROR ${new Date().toISOString()}] ${message}`);
  if (error) {
    outputChannel.appendLine(String(error.stack || error));
  }
}

module.exports = {
  activate,
  deactivate
};
