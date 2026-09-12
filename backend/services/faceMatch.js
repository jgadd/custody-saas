// Face matching disabled on this deployment — TensorFlow removed for free tier
// Restore by re-adding @tensorflow/tfjs-node, canvas, face-api.js to package.json
// and replacing this stub with the original faceMatch.js on a 2GB+ RAM server

const extractDescriptor = async (imageBuffer) => null;
const findBestMatch = (descriptor, allBiometrics) => null;

module.exports = { extractDescriptor, findBestMatch };
