const { spawnSync } = require('child_process');
const path = require('path');
const http = require('http');
const https = require('https');

const root = path.resolve(__dirname, '..');
const collection = path.join(root, 'Coach_Plingo_Auth_API.postman_collection.json');
const environment = path.join(root, 'postman', 'coach_plingo.local.postman_environment.json');
const baseUrl = process.env.E2E_BASE_URL || 'http://localhost:3000';
const folder = process.argv[2];

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function checkHealth(url) {
  return new Promise((resolve) => {
    const target = new URL(url);
    const client = target.protocol === 'https:' ? https : http;

    const req = client.request(
      target,
      {
        method: 'GET',
        timeout: 3000,
      },
      (res) => {
        resolve(res.statusCode >= 200 && res.statusCode < 300);
        res.resume();
      },
    );

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.on('error', () => resolve(false));
    req.end();
  });
}

async function run() {
  const healthCandidates = [
    `${baseUrl.replace(/\/$/, '')}/health`,
    `${baseUrl.replace(/\/$/, '')}/api/health`,
  ];

  let healthy = false;
  for (const healthUrl of healthCandidates) {
    // eslint-disable-next-line no-await-in-loop
    if (await checkHealth(healthUrl)) {
      healthy = true;
      break;
    }
  }

  if (!healthy) {
    fail(
      `E2E preflight failed. API not reachable at ${healthCandidates.join(' or ')}. Start server with npm run dev.`,
    );
  }

  const newmanBin = path.join(root, 'node_modules', '.bin', 'newman');
  const newmanArgs = ['run', collection, '-e', environment, '--reporters', 'cli'];
  if (folder) {
    newmanArgs.push('--folder', folder);
  }
  newmanArgs.push('--env-var', `base_url=${baseUrl}`);

  const result = spawnSync(newmanBin, newmanArgs, {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  });

  process.exit(result.status || 0);
}

run().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
