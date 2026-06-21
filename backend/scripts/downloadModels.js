// scripts/downloadModels.js
//
// Downloads the face-api.js pretrained model weights into ./models.
// Run once during the Docker build (see Dockerfile) so the container
// has everything it needs offline at runtime — no internet access is
// required once the image is built, which matters for stations with
// unreliable connectivity.

const https = require('https');
const fs = require('fs');
const path = require('path');

const MODELS_DIR = path.join(__dirname, '..', 'models');
const BASE_URL = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights';

const FILES = [
  'ssd_mobilenetv1_model-weights_manifest.json',
  'ssd_mobilenetv1_model-shard1',
  'ssd_mobilenetv1_model-shard2',
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model-shard1',
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model-shard1',
  'face_recognition_model-shard2',
];

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to fetch ${url}: HTTP ${res.statusCode}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', reject);
  });
}

async function main() {
  if (!fs.existsSync(MODELS_DIR)) {
    fs.mkdirSync(MODELS_DIR, { recursive: true });
  }

  console.log(`Downloading ${FILES.length} face recognition model files...`);
  for (const file of FILES) {
    const dest = path.join(MODELS_DIR, file);
    if (fs.existsSync(dest)) {
      console.log(`  skip (exists): ${file}`);
      continue;
    }
    console.log(`  fetching: ${file}`);
    await download(`${BASE_URL}/${file}`, dest);
  }
  console.log('Done. Models saved to', MODELS_DIR);
}

main().catch((err) => {
  console.error('Model download failed:', err.message);
  process.exit(1);
});
