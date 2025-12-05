/**
 * Web Voucher parsing and handling
 *
 * Format: txo:<chain>:<txid>:<vout>?key=<privateKey>&amount=<satoshis>
 * Example: txo:tbtc4:abc123...def:0?key=0123...cdef&amount=1000000
 *
 * Also supports long form: urn:voucher:txo:...
 */

import fs from 'fs';

/**
 * Parse a TXO voucher URI
 * @param {string} uri - Voucher URI
 * @returns {Object} Parsed voucher data
 */
export function parseVoucher(uri) {
  // Support both urn:voucher:txo: and txo: prefixes
  let normalized = uri;
  if (uri.startsWith('urn:voucher:txo:')) {
    normalized = uri.slice('urn:voucher:'.length);
  }

  if (!normalized.startsWith('txo:')) {
    throw new Error('Invalid voucher format: must start with txo: or urn:voucher:txo:');
  }

  // Split into path and query
  const [path, query] = normalized.split('?');
  const parts = path.split(':');

  if (parts.length < 4) {
    throw new Error('Invalid voucher format: expected txo:<chain>:<txid>:<vout>');
  }

  const [, chain, txid, voutStr] = parts;
  const vout = parseInt(voutStr, 10);

  // Parse query parameters
  const params = {};
  if (query) {
    for (const pair of query.split('&')) {
      const [key, value] = pair.split('=');
      params[key] = decodeURIComponent(value);
    }
  }

  if (!params.key) {
    throw new Error('Invalid voucher: missing key parameter');
  }

  if (!params.amount) {
    throw new Error('Invalid voucher: missing amount parameter');
  }

  return {
    chain,
    txid,
    vout,
    privateKey: params.key,
    amount: parseInt(params.amount, 10),
    pubkey: params.pubkey || null,
  };
}

/**
 * Create a TXO voucher URI
 * @param {Object} options - Voucher options
 * @param {string} options.chain - Network chain (tbtc4, btc, etc.)
 * @param {string} options.txid - Transaction ID
 * @param {number} options.vout - Output index
 * @param {string} options.privateKey - Private key
 * @param {number} options.amount - Amount in satoshis
 * @param {string} [options.pubkey] - Public key (optional)
 * @returns {string} Voucher URI
 */
export function createVoucher(options) {
  const { chain, txid, vout, privateKey, amount, pubkey } = options;

  let uri = `txo:${chain}:${txid}:${vout}?key=${privateKey}&amount=${amount}`;

  if (pubkey) {
    uri += `&pubkey=${pubkey}`;
  }

  return uri;
}

/**
 * Validate a voucher URI format
 * @param {string} uri - Voucher URI to validate
 * @returns {boolean}
 */
export function isValidVoucher(uri) {
  try {
    parseVoucher(uri);
    return true;
  } catch {
    return false;
  }
}

/**
 * Default voucher file path
 */
export const VOUCHER_FILE = '.voucher';

/**
 * Load voucher from file
 * @param {string} [filePath] - Path to voucher file (default: .voucher)
 * @returns {string|null} Voucher URI or null if not found
 */
export function loadVoucher(filePath = VOUCHER_FILE) {
  try {
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch {
    return null;
  }
}

/**
 * Save voucher to file
 * @param {string} uri - Voucher URI
 * @param {string} [filePath] - Path to voucher file (default: .voucher)
 */
export function saveVoucher(uri, filePath = VOUCHER_FILE) {
  fs.writeFileSync(filePath, uri + '\n');
}

/**
 * Default testnet4 faucet voucher
 * This is an INSECURE voucher for testing - anyone can spend it!
 * Replenish by sending testnet4 coins to the address derived from this key.
 */
export const DEFAULT_FAUCET_VOUCHER = null; // Will be set once funded

/**
 * Amount to give new users from the faucet (1M sats = 0.01 BTC)
 */
export const INIT_AMOUNT = 1000000;

/**
 * Minimum fee for transactions
 */
export const MIN_FEE = 1000;
