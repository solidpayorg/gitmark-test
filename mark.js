#!/usr/bin/env node

const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Check for --verbose or -v flag
const VERBOSE = process.argv.includes('--verbose') || process.argv.includes('-v');

// Debug logging helper - only logs when VERBOSE is true
function debug(...args) {
  if (VERBOSE) debug('', ...args);
}

// txo_parser will be dynamically imported as it's an ES module

/**
 * Converts a Taproot private key (64-character hex string) to a public key (64-character hex string)
 *
 * @param {string} privateKey - 64-character hex string representing the private key
 * @returns {string} 64-character hex string representing the public key
 * @throws {Error} if the private key format is invalid
 */
async function key2pub (privateKey) {
  // Validate private key format
  if (!/^[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error(
      'Invalid private key format. Expected 64-character hex string.'
    )
  }

  try {
    // Get the public key using @noble/secp256k1
    const { getPublicKey } = await import('@noble/secp256k1');

    // getPublicKey returns a 33-byte compressed key by default, we need to convert it to 32-byte x-only format
    const compressedPubkey = getPublicKey(privateKey, true)

    // Remove the first byte (0x02 or 0x03) to get the x coordinate only
    const pubkeyX = compressedPubkey.slice(1)

    // Convert Uint8Array to hex string
    return Array.from(pubkeyX, byte => byte.toString(16).padStart(2, '0')).join('')
  } catch (error) {
    throw new Error(
      `Failed to convert private key to public key: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * Add two or more hexadecimal values together
 * 
 * @param {...string} hexValues - Hexadecimal strings (with or without 0x prefix)
 * @returns {string} - Lowercase hexadecimal result (without 0x prefix)
 */
function addHex (...hexValues) {
  if (hexValues.length === 0) {
    return '0';
  }

  let sum = 0n;

  for (const hex of hexValues) {
    // Handle hex strings with or without 0x prefix
    const cleanHex = hex.toLowerCase().startsWith('0x') ? hex.slice(2) : hex;

    // Convert to BigInt to handle large hex values
    try {
      sum += BigInt(`0x${cleanHex}`);
    } catch (e) {
      throw new Error(`Invalid hex value: ${hex}`);
    }
  }

  // Convert back to hex string without 0x prefix and in lowercase
  return sum.toString(16).toLowerCase();
}

// Helper function to ensure hex values are padded to 64 characters (32 bytes)
function padHex64 (hex) {
  // Remove any 0x prefix if present
  const cleanHex = hex.replace(/^0x/, '');
  // Pad to 64 characters with leading zeros
  return cleanHex.padStart(64, '0');
}

// Helper function to safely add hex values and preserve leading zeros
function safeAddHex (hex1, hex2) {
  const result = addHex(hex1, hex2);
  return padHex64(result);
}

// Benchmark helper functions
function formatTime (ms) {
  if (ms < 1) return `${(ms * 1000).toFixed(2)}μs`;
  if (ms < 1000) return `${ms.toFixed(2)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function timeOperation (name, operation) {
  const start = performance.now();
  try {
    const result = operation();
    const end = performance.now();
    const duration = end - start;
    console.log(`BENCHMARK: ${name} took ${formatTime(duration)}`);
    return result;
  } catch (error) {
    const end = performance.now();
    const duration = end - start;
    console.log(`BENCHMARK: ${name} FAILED after ${formatTime(duration)}`);
    throw error;
  }
}

async function timeOperationAsync (name, operation) {
  const start = performance.now();
  try {
    const result = await operation();
    const end = performance.now();
    const duration = end - start;
    console.log(`BENCHMARK: ${name} took ${formatTime(duration)}`);
    return result;
  } catch (error) {
    const end = performance.now();
    const duration = end - start;
    console.log(`BENCHMARK: ${name} FAILED after ${formatTime(duration)}`);
    throw error;
  }
}

if (VERBOSE) console.log('=== GITMARK DEBUG START ===');
const scriptStart = performance.now();
if (VERBOSE) console.log('Starting script execution at:', new Date().toISOString());

async function main () {
  try {
    // Git operations
    debug('Running git add .');
    timeOperation('git add', () => execSync('git add .'));

    // Get commit message from first argument or use default
    const commitMessage = process.argv[2] || "first";
    debug(` Running git commit with message: "${commitMessage}"`);
    timeOperation('git commit', () => execFileSync('git', ['commit', '-m', commitMessage]));
    debug(' Git operations completed successfully');

    const TXOFILE = '.well-known/txo/txo.json';
    const NETWORK = 'tbtc4';
    debug(` Configuration - TXOFILE: ${TXOFILE}, NETWORK: ${NETWORK}`);

    // Get commit hash
    debug(' Getting commit hash');
    const COMMIT_HASH = timeOperation('get commit hash', () =>
      execSync('git log -1 --format=%H').toString().trim()
    );
    debug(` COMMIT_HASH: ${COMMIT_HASH}`);

    // Get private key from git config
    debug(' Getting private key from git config');
    const PRIVKEY = timeOperation('get private key', () =>
      execSync('git config nostr.privkey').toString().trim()
    );
    debug(` PRIVKEY (truncated): ${PRIVKEY.substring(0, 4)}...${PRIVKEY.substring(PRIVKEY.length - 4)}`);

    debug(' Generating public key from private key');
    const PUBKEY = await timeOperationAsync('generate initial pubkey', () =>
      key2pub(PRIVKEY)
    );
    debug(` PUBKEY: ${PUBKEY}`);

    // Read txo.json file
    debug(` Reading TXO file from ${TXOFILE}`);
    if (!fs.existsSync(TXOFILE)) {
      console.error(`DEBUG: ERROR - File not found: ${TXOFILE}`);
      process.exit(1);
    }

    const { txoFileContent, txoData } = timeOperation('read and parse TXO file', () => {
      const content = fs.readFileSync(TXOFILE, 'utf8');
      debug(` Raw TXO file content: ${content}`);
      const data = JSON.parse(content);
      return { txoFileContent: content, txoData: data };
    });

    debug(` Parsed TXO data, contains ${txoData.length} entries`);

    if (txoData.length === 0) {
      console.error('DEBUG: ERROR - No TXO entries found in file');
      process.exit(1);
    }

    const lastTxo = txoData[txoData.length - 1];
    debug(` Last TXO entry: ${lastTxo}`);

    // Extract all commit hashes from txo.json items and sum them
    debug(' Extracting and summing commit hashes from TXO entries');
    const commitHashSum = timeOperation('process TXO entries and sum commits', () => {
      let sum = '';
      for (let i = 0; i < txoData.length; i++) {
        const txoItem = txoData[i];
        debug(` Processing TXO entry ${i + 1}: ${txoItem}`);

        const commitMatch = txoItem.match(/commit=([0-9a-f]+)/);
        if (commitMatch && commitMatch[1]) {
          const currentCommit = commitMatch[1];
          debug(` Found commit hash in entry ${i + 1}: ${currentCommit}`);

          if (sum) {
            debug(` Adding commit hash to existing sum: ${sum} + ${currentCommit}`);
            sum = safeAddHex(sum, currentCommit);
          } else {
            debug(` First commit hash, setting as initial sum: ${currentCommit}`);
            sum = currentCommit;
          }
          debug(` Current commit hash sum after entry ${i + 1}: ${sum}`);
        } else {
          debug(` No commit hash found in entry ${i + 1}`);
        }
      }
      return sum;
    });
    debug(` Final commit hash sum from TXO entries: ${commitHashSum || 'EMPTY'}`);

    // Calculate private key for signing the transaction (PRIVKEY + commit hashes from JSON)
    debug(` Calculating signing key: addhex "${PRIVKEY.substring(0, 4)}...${PRIVKEY.substring(PRIVKEY.length - 4)}" "${commitHashSum || 'EMPTY'}"`);
    const SIGNING_KEY = timeOperation('calculate signing key', () =>
      commitHashSum ? safeAddHex(PRIVKEY, commitHashSum) : PRIVKEY
    );
    debug(` SIGNING_KEY (truncated): ${SIGNING_KEY.substring(0, 4)}...${SIGNING_KEY.substring(SIGNING_KEY.length - 4)}`);

    debug(' Generating public key from signing key');
    const SIGNING_PUBKEY = await timeOperationAsync('generate signing pubkey', () =>
      key2pub(SIGNING_KEY)
    );
    debug(` SIGNING_PUBKEY: ${SIGNING_PUBKEY}`);

    // Add current commit hash to the sum for the new destination address
    debug(` Adding current commit hash to sum: ${commitHashSum || 'EMPTY'} + ${COMMIT_HASH}`);
    const finalCommitHashSum = timeOperation('add current commit to sum', () => {
      if (commitHashSum) {
        const addHexCommand = `addhex "${commitHashSum}" "${COMMIT_HASH}"`;
        debug(` Running command: ${addHexCommand}`);
        return safeAddHex(commitHashSum, COMMIT_HASH);
      } else {
        return COMMIT_HASH;
      }
    });
    debug(` Final commit hash sum including current commit: ${finalCommitHashSum}`);

    // Calculate new key by adding hex values with all commit hashes (including current commit)
    debug(` Calculating destination key: addhex "${PRIVKEY.substring(0, 4)}...${PRIVKEY.substring(PRIVKEY.length - 4)}" "${finalCommitHashSum}"`);
    const NEWKEY = timeOperation('calculate destination key', () =>
      safeAddHex(PRIVKEY, finalCommitHashSum)
    );
    debug(` NEWKEY (truncated): ${NEWKEY.substring(0, 4)}...${NEWKEY.substring(NEWKEY.length - 4)}`);

    // Parse transaction information
    debug(` Parsing transaction info from last TXO: ${lastTxo}`);

    const { TXID, OUTPUT, AMOUNT } = await timeOperationAsync('parse TXO URI', async () => {
      debug(` Parsing TXO URI directly: ${lastTxo}`);
      const { parseTxoUri } = await import('txo_parser');
      const parsed = parseTxoUri(lastTxo);
      debug(` Parsed TXID: ${parsed.txid}`);
      debug(` Parsed OUTPUT: ${parsed.output}`);
      debug(` Parsed AMOUNT: ${parsed.amount}`);
      return { TXID: parsed.txid, OUTPUT: parsed.output, AMOUNT: parsed.amount };
    });

    // Calculate fee and new amount
    const FEE = 1000;
    debug(` Fee set to ${FEE} satoshis`);
    const NEWAMOUNT = AMOUNT - FEE;
    debug(` New amount after fee: ${NEWAMOUNT} satoshis (${AMOUNT} - ${FEE})`);

    // Generate new public key for destination
    debug(` Generating new public key from NEWKEY for destination`);
    const NEWPUB = await timeOperationAsync('generate destination pubkey', () =>
      key2pub(NEWKEY)
    );
    debug(` NEWPUB (destination): ${NEWPUB}`);

    // Build transaction
    debug(' Building transaction with txbuilder');
    debug(` txbuilder params (sensitive data masked): privateKey=***SIGNING_KEY*** publicKey=${SIGNING_PUBKEY} txid=${TXID} vout=${OUTPUT} inputAmount=${AMOUNT} output=${NEWPUB}:${NEWAMOUNT}`);

    // Execute txbuilder
    try {
      debug(' Executing txbuilder...');
      const { buildTx } = await import('btctx');
      const { hex: LAST_LINE, txid: builtTxid } = await timeOperationAsync('execute txbuilder', () =>
        buildTx({
          privateKey: SIGNING_KEY,
          publicKey: SIGNING_PUBKEY,
          txid: TXID,
          vout: OUTPUT,
          inputAmount: AMOUNT,
          outputs: [{ pubkey: NEWPUB, amount: NEWAMOUNT }],
        })
      );
      debug(` txbuilder output txid: ${builtTxid}`);
      debug(` txbuilder output hex: ${LAST_LINE.substring(0, 20)}...`);

      // Send transaction
      try {
        debug(` Sending transaction to network ${NETWORK}`);
        debug(` Broadcasting transaction to ${NETWORK}`);
        const { default: sendtx } = await import('sendtx');
        const NEWTX = await timeOperationAsync('send transaction', () =>
          sendtx(LAST_LINE, NETWORK)
        );
        debug(` Transaction successfully sent, NEWTX: ${NEWTX}`);

        // Calculate new values for TXO URI - use the new destination key/pubkey for the URI
        debug(' Using calculated NEWKEY/NEWPUB for the TXO URI');

        const TXO_URI = `txo:tbtc4:${NEWTX}:0?amount=${NEWAMOUNT}&pubkey=${NEWPUB}&commit=${COMMIT_HASH}`;
        debug(` Generated TXO_URI: ${TXO_URI}`);

        // Update txo.json file and save to .git/txo.txt
        debug(` Updating TXO file (${TXOFILE}) with new TXO_URI`);
        debug(` Current txoData has ${txoData.length} entries`);

        timeOperation('update TXO files', () => {
          txoData.push(TXO_URI);
          debug(` After adding new URI, txoData has ${txoData.length} entries`);

          const jsonString = JSON.stringify(txoData, null, 2);
          debug(` Writing ${jsonString.length} bytes to ${TXOFILE}`);
          fs.writeFileSync(TXOFILE, jsonString);

          // Also save to .git/txo.txt
          const gitTxoPath = '.git/txo.json';
          debug(` Also writing ${jsonString.length} bytes to ${gitTxoPath}`);

          // Ensure .git directory exists (it should, but just in case)
          const gitDir = '.git';
          if (!fs.existsSync(gitDir)) {
            debug(` Creating ${gitDir} directory`);
            fs.mkdirSync(gitDir, { recursive: true });
          }

          fs.writeFileSync(gitTxoPath, jsonString);
          debug(` Successfully wrote TXO data to ${gitTxoPath}`);
        });
        debug(` Successfully added new TXO URI to ${TXOFILE} and .git/txo.txt`);
      } catch (error) {
        console.error(`DEBUG: ERROR in sendtx: ${error.message}`);
        console.error('DEBUG: Error stack trace:');
        console.error(error.stack);
        console.error(`DEBUG: Command output: ${error.stdout ? error.stdout.toString() : 'No output'}`);
        console.error(`DEBUG: Command stderr: ${error.stderr ? error.stderr.toString() : 'No stderr'}`);
        process.exit(1);
      }
    } catch (error) {
      console.error(`DEBUG: ERROR in txbuilder: ${error.message}`);
      console.error('DEBUG: Error stack trace:');
      console.error(error.stack);
      console.error(`DEBUG: Command output: ${error.stdout ? error.stdout.toString() : 'No output'}`);
      console.error(`DEBUG: Command stderr: ${error.stderr ? error.stderr.toString() : 'No stderr'}`);
      process.exit(1);
    }

    const scriptEnd = performance.now();
    const totalDuration = scriptEnd - scriptStart;
    console.log(`BENCHMARK: TOTAL SCRIPT EXECUTION TIME: ${formatTime(totalDuration)}`);
    if (VERBOSE) console.log('=== GITMARK DEBUG END ===');
  } catch (error) {
    const scriptEnd = performance.now();
    const totalDuration = scriptEnd - scriptStart;
    console.error('=== GITMARK DEBUG ERROR ===');
    console.error(`Fatal error: ${error.message}`);
    console.error('Error stack trace:');
    console.error(error.stack);
    if (error.stdout) console.error(`Command output: ${error.stdout.toString()}`);
    if (error.stderr) console.error(`Command stderr: ${error.stderr.toString()}`);
    console.error(`BENCHMARK: SCRIPT FAILED AFTER: ${formatTime(totalDuration)}`);
    if (VERBOSE) console.error('=== GITMARK DEBUG END WITH ERROR ===');
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  console.error('Unhandled error in main function:', error);
  process.exit(1);
}); 