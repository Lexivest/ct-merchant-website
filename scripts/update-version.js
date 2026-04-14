import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const publicDir = path.join(__dirname, '..', 'public');
const versionFilePath = path.join(publicDir, 'version.json');

// Ensure the public directory exists
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

const now = new Date();
const buildTime = now.getTime();
const version = `1.0.${Math.floor(buildTime / 10000) % 100000}`; // Simple auto-incrementing-like version

const versionData = {
  version,
  buildTime,
  formattedTime: now.toISOString()
};

fs.writeFileSync(versionFilePath, JSON.stringify(versionData, null, 2));

console.log(`Version updated to ${version} at ${versionData.formattedTime}`);
