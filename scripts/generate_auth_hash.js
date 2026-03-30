const crypto = require('crypto');

const password = process.argv[2];
if (!password) {
  console.error('Usage: node scripts/generate_auth_hash.js "VotreMotDePasse"');
  process.exit(1);
}

function toBase64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

const iterations = 210000;
const salt = crypto.randomBytes(16);
const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');

console.log(
  'pbkdf2_sha256$' +
  iterations +
  '$' +
  toBase64Url(salt) +
  '$' +
  toBase64Url(hash)
);
