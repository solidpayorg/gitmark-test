/**
 * Key generation and derivation utilities
 */

import { getPublicKey as nobleGetPublicKey } from '@noble/secp256k1';
import crypto from 'crypto';

/**
 * Generate a new random private key
 * @returns {string} 64-char hex private key
 */
export function generatePrivateKey() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Derive x-only public key from private key
 * @param {string} privateKey - 64-char hex private key
 * @returns {string} 64-char hex public key (x-only for Taproot)
 */
export function getPublicKey(privateKey) {
  // Get compressed public key (33 bytes)
  const compressed = nobleGetPublicKey(privateKey, true);
  // Return x-only (last 32 bytes, skip the prefix byte)
  return Buffer.from(compressed.slice(1)).toString('hex');
}

/**
 * Generate a new keypair
 * @returns {{privateKey: string, publicKey: string}}
 */
export function generateKeypair() {
  const privateKey = generatePrivateKey();
  const publicKey = getPublicKey(privateKey);
  return { privateKey, publicKey };
}

/**
 * Validate a private key format
 * @param {string} key - Private key to validate
 * @returns {boolean}
 */
export function isValidPrivateKey(key) {
  return /^[0-9a-fA-F]{64}$/.test(key);
}

/**
 * Validate a public key format
 * @param {string} key - Public key to validate
 * @returns {boolean}
 */
export function isValidPublicKey(key) {
  return /^[0-9a-fA-F]{64}$/.test(key);
}
