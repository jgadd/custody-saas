// services/faceMatch.js
//
// Self-hosted face recognition. No external API, no internet dependency
// at runtime, no per-call cost. Models are downloaded once at Docker
// build time (see Dockerfile) and loaded into memory on server start.
//
// How it works:
//   1. On capture, we run face-api.js against the uploaded photo and get
//      back a 128-float "descriptor" (an embedding) that represents the
//      face numerically.
//   2. To check for a match, we compare that descriptor against every
//      stored descriptor in the Biometric table (type=FACE) using
//      Euclidean distance. Lower distance = more similar face.
//   3. A distance below MATCH_THRESHOLD is considered a match.
//
// This is the same descriptor-distance approach used by face-api.js's
// own face recognition examples and is reasonably accurate for frontal,
// well-lit booking photos. It is NOT forensic-grade — for a production
// rollout at scale, this is the natural place to swap in AWS Rekognition
// or a dedicated vendor without changing anything else in the app, since
// callers only see matchFace() / enrollFace() and don't know which
// engine is behind them.

const faceapi = require('face-api.js');
const canvas = require('canvas');
const path = require('path');
const fs = require('fs');

const { Canvas, Image, ImageData } = canvas;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

const MODELS_PATH = path.join(__dirname, '..', 'models');

// Distance threshold for considering two faces a match.
// face-api.js docs suggest 0.6 as a reasonable default; lower = stricter.
const MATCH_THRESHOLD = 0.55;

let modelsLoaded = false;

async function loadModels() {
  if (modelsLoaded) return;
  if (!fs.existsSync(MODELS_PATH)) {
    throw new Error(
      `Face recognition models not found at ${MODELS_PATH}. ` +
      `Run 'node scripts/downloadModels.js' or rebuild the Docker image.`
    );
  }
  await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODELS_PATH);
  await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS_PATH);
  await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS_PATH);
  modelsLoaded = true;
  console.log('Face recognition models loaded.');
}

/**
 * Extract a face descriptor (128-float embedding) from an image buffer.
 * Returns null if no face is detected.
 */
async function extractDescriptor(imageBuffer) {
  await loadModels();
  const img = await canvas.loadImage(imageBuffer);
  const detection = await faceapi
    .detectSingleFace(img)
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) return null;
  return Array.from(detection.descriptor); // Float32Array -> plain array for JSON storage
}

/**
 * Euclidean distance between two descriptors.
 */
function distance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) ** 2;
  }
  return Math.sqrt(sum);
}

/**
 * Compare a new descriptor against a list of stored {offenderId, descriptor}
 * records and return the best match (if any) under the threshold.
 *
 * storedBiometrics: [{ offenderId, faceEmbedding: number[] }]
 */
function findBestMatch(newDescriptor, storedBiometrics) {
  let best = null;

  for (const record of storedBiometrics) {
    if (!record.faceEmbedding) continue;
    const d = distance(newDescriptor, record.faceEmbedding);
    if (!best || d < best.distance) {
      best = { offenderId: record.offenderId, distance: d };
    }
  }

  if (!best || best.distance > MATCH_THRESHOLD) return null;

  // Convert distance to an intuitive confidence percentage.
  // distance 0 -> 100% confidence, distance == threshold -> ~50% confidence.
  const confidence = Math.max(0, 1 - best.distance / (MATCH_THRESHOLD * 2));
  return { offenderId: best.offenderId, distance: best.distance, confidence };
}

module.exports = { loadModels, extractDescriptor, findBestMatch, MATCH_THRESHOLD };
