const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const readline = require('readline');
const { ensureSchema } = require('../netlify/functions/_db');
const { upsertPlainDataset } = require('../netlify/functions/_plain_dataset');
const { assertExistingFile, loadWorkbookRowsFromFile } = require('../netlify/functions/_dataset_import');

function readEnvFileIfPresent() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = String(line || '').trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) return;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  });
}

function hasDatabaseUrl() {
  return Boolean(process.env.NEON_DATABASE_URL || process.env.DATABASE_URL);
}

function tryLoadDbUrlFromWindowsSecretStore() {
  try {
    const psFile = path.resolve(__dirname, 'windows-db-secret.ps1');
    if (!fs.existsSync(psFile)) return '';
    const out = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psFile, '-Mode', 'get'],
      { encoding: 'utf8' }
    );
    return String(out || '').trim();
  } catch (_) {
    return '';
  }
}

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(String(answer || '').trim());
    });
  });
}

async function ensureDatabaseUrlOrPrompt() {
  if (hasDatabaseUrl()) return;
  const stored = tryLoadDbUrlFromWindowsSecretStore();
  if (stored) {
    process.env.NEON_DATABASE_URL = stored;
    return;
  }
  if (!process.stdin.isTTY) {
    throw new Error(
      "Missing database URL. Definis NEON_DATABASE_URL/DATABASE_URL, ou configure le coffre local via setup_db_url_secure.bat."
    );
  }
  const entered = await ask('Colle ton URL PostgreSQL/Neon puis Entrée: ');
  if (!entered) {
    throw new Error('Aucune URL de base de donnees fournie.');
  }
  process.env.NEON_DATABASE_URL = entered;
}

function openFilePicker() {
  const psScript = [
    "Add-Type -AssemblyName System.Windows.Forms | Out-Null",
    '$dialog = New-Object System.Windows.Forms.OpenFileDialog',
    "$dialog.Title = 'Choisir un fichier Excel ou CSV'",
    "$dialog.Filter = 'Fichiers Excel/CSV (*.xlsx;*.csv)|*.xlsx;*.csv|Excel (*.xlsx)|*.xlsx|CSV (*.csv)|*.csv|Tous les fichiers (*.*)|*.*'",
    '$dialog.Multiselect = $false',
    '$dialog.CheckFileExists = $true',
    '$dialog.CheckPathExists = $true',
    '$result = $dialog.ShowDialog()',
    "if ($result -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $dialog.FileName }"
  ].join('; ');

  const selected = execFileSync(
    'powershell.exe',
    ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
    { encoding: 'utf8' }
  ).trim();

  if (!selected) {
    throw new Error("Aucun fichier sélectionné (import annulé).");
  }
  return selected;
}

async function main() {
  readEnvFileIfPresent();
  await ensureDatabaseUrlOrPrompt();
  const inputPath = process.argv[2] || openFilePicker();
  const datasetKey = process.argv[3] || 'saip-main';
  const actor = process.argv[4] || 'local-import-picker';

  const resolvedPath = assertExistingFile(inputPath);
  const loaded = await loadWorkbookRowsFromFile(resolvedPath);
  if (!loaded.rows.length) {
    throw new Error('Aucune donnée importable trouvée dans le fichier.');
  }

  await ensureSchema();
  const saved = await upsertPlainDataset(datasetKey, path.basename(resolvedPath), loaded.rows, actor);

  console.log(JSON.stringify({
    ok: true,
    mode: 'local-file-picker',
    datasetKey: saved.datasetKey,
    sourceName: saved.sourceName,
    rowCount: saved.rowCount,
    sheetName: loaded.sheetName,
    updatedAt: saved.updatedAt
  }, null, 2));
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
