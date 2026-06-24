/**
 * secugen.js
 *
 * Client for SecuGen's WebAPI local service (SgiBioSrv), which exposes
 * a connected SecuGen fingerprint reader (e.g. Hamster Pro 20) over
 * HTTP at https://localhost:8000. Officers install this free service
 * once per PC — see https://webapi.secugen.com — then any browser tab
 * on that machine can talk to the scanner directly.
 *
 * This is NOT a generic "detect any USB fingerprint scanner" solution
 * — it only works for SecuGen-brand readers running their official
 * service. Other scanner brands need their own equivalent bridge.
 *
 * Without a license key, the service works for a 60-day trial period
 * per SecuGen's docs — a license is needed per subdomain before going
 * live station-wide.
 */

const SECUGEN_BASE_URL = 'https://localhost:8000';
const CAPTURE_TIMEOUT_MS = 15000;
const PING_TIMEOUT_MS = 1500;

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Checks whether SgiBioSrv is running and a reader is connected, by
 * making a real (but lightweight) capture call. There's no separate
 * "ping" endpoint in the WebAPI — SGIFPCapture itself reports device
 * info even before a finger is placed, so this doubles as the
 * connectivity check. Returns device info on success, null otherwise.
 *
 * Browsers warn about the service's self-signed localhost certificate
 * on first use — officers need to visit https://localhost:8000 once
 * and accept the certificate exception, same as SecuGen's own setup
 * instructions describe.
 */
export async function detectScanner() {
  try {
    const res = await fetchWithTimeout(
      `${SECUGEN_BASE_URL}/SGIFPCapture`,
      { method: 'GET' },
      PING_TIMEOUT_MS
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.ErrorCode && data.ErrorCode !== 0) return null;
    return {
      manufacturer: data.Manufacturer,
      model: data.Model,
      serialNumber: data.SerialNumber,
    };
  } catch (e) {
    // Service not installed/running, certificate not yet accepted, or
    // no reader plugged in — all look the same from here: unavailable.
    return null;
  }
}

/**
 * Triggers a real fingerprint capture. The officer places a finger on
 * the reader; SgiBioSrv waits for the scan and returns the result.
 *
 * Returns { imageBase64, quality, width, height, dpi } on success, or
 * throws with a message suitable for display if capture fails.
 */
export async function captureFingerprint() {
  let res;
  try {
    res = await fetchWithTimeout(
      `${SECUGEN_BASE_URL}/SGIFPCapture`,
      { method: 'GET' },
      CAPTURE_TIMEOUT_MS
    );
  } catch (e) {
    throw new Error('Could not reach the fingerprint scanner service. Make sure SgiBioSrv is running and the scanner is connected.');
  }

  if (!res.ok) {
    throw new Error('Fingerprint scanner service returned an error.');
  }

  const data = await res.json();

  if (data.ErrorCode && data.ErrorCode !== 0) {
    throw new Error(`Capture failed (code ${data.ErrorCode}). Check the finger placement and try again.`);
  }
  if (!data.BMPBase64) {
    throw new Error('No fingerprint image returned. Try again with a firmer, centered placement.');
  }

  return {
    imageBase64: data.BMPBase64,
    quality: data.ImageQuality,
    nfiq: data.ImageNFIQ,
    width: data.ImageWidth,
    height: data.ImageHeight,
    dpi: data.ImageDPI,
  };
}

/**
 * NFIQ quality is 1 (best) to 5 (worst). 3 or better is generally
 * considered usable for matching; this gives the UI a simple
 * good/fair/poor label without exposing the raw 1-5 scale to officers.
 */
export function describeQuality(nfiq) {
  if (nfiq == null) return null;
  if (nfiq <= 2) return { label: 'Good', level: 'good' };
  if (nfiq === 3) return { label: 'Fair — consider rescanning', level: 'fair' };
  return { label: 'Poor — please rescan', level: 'poor' };
}
