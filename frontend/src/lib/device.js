/**
 * device.js
 *
 * Fingerprint capture via this app only ever works through a USB
 * scanner with its own capture software — a phone's built-in
 * fingerprint sensor (Touch ID, Android fingerprint unlock) is
 * permanently inaccessible to any web app by OS-level design on both
 * iOS and Android, so there's no way to read a real fingerprint
 * through it here.
 *
 * Given that, fingerprint capture is offered only on devices where a
 * USB scanner could plausibly be attached — i.e. not a phone. This
 * keeps the option from appearing where it could never actually work.
 */

/**
 * True for phones — small touchscreens without a physical keyboard.
 * Tablets are treated as desktop-capable since many station tablets
 * are USB-OTG capable and can have a scanner attached.
 */
export function isMobilePhone() {
  const ua = navigator.userAgent || '';
  const isTouchPrimary = window.matchMedia('(pointer: coarse)').matches;
  const isNarrow = window.matchMedia('(max-width: 600px)').matches;
  const isPhoneUA = /iPhone|Android.*Mobile|Windows Phone/i.test(ua);
  return isPhoneUA || (isTouchPrimary && isNarrow);
}

/**
 * Whether the fingerprint capture option should be shown at all.
 * Mirrors isMobilePhone() now, but kept as its own named export so
 * the actual policy (currently "not on phones") lives in one place
 * and can be refined later (e.g. once real AFIS/WebUSB scanner
 * integration exists) without touching every call site.
 */
export function supportsFingerprintCapture() {
  return !isMobilePhone();
}
