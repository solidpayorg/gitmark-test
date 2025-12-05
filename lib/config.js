/**
 * Git config helpers for gitmark
 */

import { execSync } from 'child_process';

/**
 * Get a gitmark config value
 * @param {string} key - Config key (e.g., 'key', 'network')
 * @param {boolean} [global=false] - Use global config
 * @returns {string|null} Config value or null if not set
 */
export function getConfig(key, global = false) {
  try {
    const scope = global ? '--global' : '--local';
    return execSync(`git config ${scope} gitmark.${key}`, { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

/**
 * Set a gitmark config value
 * @param {string} key - Config key
 * @param {string} value - Config value
 * @param {boolean} [global=false] - Use global config
 */
export function setConfig(key, value, global = false) {
  const scope = global ? '--global' : '--local';
  execSync(`git config ${scope} gitmark.${key} "${value}"`);
}

/**
 * Remove a gitmark config value
 * @param {string} key - Config key
 * @param {boolean} [global=false] - Use global config
 */
export function unsetConfig(key, global = false) {
  try {
    const scope = global ? '--global' : '--local';
    execSync(`git config ${scope} --unset gitmark.${key}`);
  } catch {
    // Ignore if not set
  }
}

/**
 * Get the private key from git config (nostr.privkey)
 * @returns {string|null}
 */
export function getPrivateKey() {
  return getNostrConfig('privkey') || getNostrConfig('privkey', true);
}

/**
 * Set the private key in git config (nostr.privkey)
 * @param {string} key - Private key
 * @param {boolean} [global=false] - Use global config
 */
export function setPrivateKey(key, global = false) {
  setNostrConfig('privkey', key, global);
}

/**
 * Get a nostr config value
 * @param {string} key - Config key
 * @param {boolean} [global=false] - Use global config
 * @returns {string|null}
 */
export function getNostrConfig(key, global = false) {
  try {
    const scope = global ? '--global' : '--local';
    return execSync(`git config ${scope} nostr.${key}`, { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

/**
 * Set a nostr config value
 * @param {string} key - Config key
 * @param {string} value - Config value
 * @param {boolean} [global=false] - Use global config
 */
export function setNostrConfig(key, value, global = false) {
  const scope = global ? '--global' : '--local';
  execSync(`git config ${scope} nostr.${key} "${value}"`);
}

/**
 * Get the network from git config
 * @param {string} [defaultNetwork='tbtc4'] - Default network
 * @returns {string}
 */
export function getNetwork(defaultNetwork = 'tbtc4') {
  return getConfig('network') || getConfig('network', true) || defaultNetwork;
}

/**
 * Set the network in git config
 * @param {string} network - Network identifier
 * @param {boolean} [global=false] - Use global config
 */
export function setNetwork(network, global = false) {
  setConfig('network', network, global);
}

/**
 * Check if we're in a git repository
 * @returns {boolean}
 */
export function isGitRepo() {
  try {
    execSync('git rev-parse --git-dir', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
