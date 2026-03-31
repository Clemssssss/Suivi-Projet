const fs = require('fs');
const path = require('path');
const { ensureSchema } = require('../netlify/functions/_db');
const { upsertPlainDataset } = require('../netlify/functions/_plain_dataset');
const { assertExistingFile, loadWorkbookRowsFromFile } = require('../netlify/functions/_dataset_import');

async function main() {
  const inputPath = process.argv[2];
  const datasetKey = process.argv[3] || 'saip-main';
  const actor = process.argv[4] || 'local-import';
  if (!inputPath) {
    throw new Error('Usage: node scripts/import_secure_dataset.js <xlsx-path> [datasetKey] [actor]');
  }
  const resolvedPath = assertExistingFile(inputPath);

  const loaded = await loadWorkbookRowsFromFile(resolvedPath);
  if (!loaded.rows.length) {
    throw new Error('Aucune donnée importable trouvée dans le fichier');
  }

  await ensureSchema();
  const saved = await upsertPlainDataset(datasetKey, path.basename(resolvedPath), loaded.rows, actor);
  console.log(JSON.stringify({
    ok: true,
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
