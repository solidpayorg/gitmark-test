#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Helper function to ensure hex values are padded to 64 characters (32 bytes)
function padHex64 (hex) {
  // Remove any 0x prefix if present
  const cleanHex = hex.replace(/^0x/, '');
  // Pad to 64 characters with leading zeros
  return cleanHex.padStart(64, '0');
}

// Helper function to safely add hex values and preserve leading zeros
function safeAddHex (hex1, hex2) {
  const result = execSync(`addhex "${hex1}" "${hex2}"`).toString().trim();
  return padHex64(result);
}

console.log('=== GITMARK DEBUG START ===');
console.log('Starting script execution at:', new Date().toISOString());

try {
  // Git operations
  console.log('DEBUG: Running git add .');
  execSync('git add .');

  // Get commit message from first argument or use default
  const commitMessage = process.argv[2] || "first";
  console.log(`DEBUG: Running git commit with message: "${commitMessage}"`);
  execSync(`git commit -m "${commitMessage}"`);
  console.log('DEBUG: Git operations completed successfully');

  const TXOFILE = '.well-known/txo/txo.json';
  const NETWORK = 'tbtc4';
  console.log(`DEBUG: Configuration - TXOFILE: ${TXOFILE}, NETWORK: ${NETWORK}`);

  // Get commit hash
  console.log('DEBUG: Getting commit hash');
  const COMMIT_HASH = execSync('git log -1 --format=%H').toString().trim();
  console.log(`DEBUG: COMMIT_HASH: ${COMMIT_HASH}`);

  // Get private key from git config
  console.log('DEBUG: Getting private key from git config');
  const PRIVKEY = execSync('git config nostr.privkey').toString().trim();
  console.log(`DEBUG: PRIVKEY (truncated): ${PRIVKEY.substring(0, 4)}...${PRIVKEY.substring(PRIVKEY.length - 4)}`);

  console.log('DEBUG: Generating public key from private key');
  const PUBKEY = execSync(`npx key2pub "${PRIVKEY}"`).toString().trim();
  console.log(`DEBUG: PUBKEY: ${PUBKEY}`);

  // Read txo.json file
  console.log(`DEBUG: Reading TXO file from ${TXOFILE}`);
  if (!fs.existsSync(TXOFILE)) {
    console.error(`DEBUG: ERROR - File not found: ${TXOFILE}`);
    process.exit(1);
  }

  const txoFileContent = fs.readFileSync(TXOFILE, 'utf8');
  console.log(`DEBUG: Raw TXO file content: ${txoFileContent}`);

  const txoData = JSON.parse(txoFileContent);
  console.log(`DEBUG: Parsed TXO data, contains ${txoData.length} entries`);

  if (txoData.length === 0) {
    console.error('DEBUG: ERROR - No TXO entries found in file');
    process.exit(1);
  }

  const lastTxo = txoData[txoData.length - 1];
  console.log(`DEBUG: Last TXO entry: ${lastTxo}`);

  // Extract all commit hashes from txo.json items and sum them
  console.log('DEBUG: Extracting and summing commit hashes from TXO entries');
  let commitHashSum = '';
  for (let i = 0; i < txoData.length; i++) {
    const txoItem = txoData[i];
    console.log(`DEBUG: Processing TXO entry ${i + 1}: ${txoItem}`);

    const commitMatch = txoItem.match(/commit=([0-9a-f]+)/);
    if (commitMatch && commitMatch[1]) {
      const currentCommit = commitMatch[1];
      console.log(`DEBUG: Found commit hash in entry ${i + 1}: ${currentCommit}`);

      if (commitHashSum) {
        console.log(`DEBUG: Adding commit hash to existing sum: ${commitHashSum} + ${currentCommit}`);
        commitHashSum = safeAddHex(commitHashSum, currentCommit);
      } else {
        console.log(`DEBUG: First commit hash, setting as initial sum: ${currentCommit}`);
        commitHashSum = currentCommit;
      }
      console.log(`DEBUG: Current commit hash sum after entry ${i + 1}: ${commitHashSum}`);
    } else {
      console.log(`DEBUG: No commit hash found in entry ${i + 1}`);
    }
  }
  console.log(`DEBUG: Final commit hash sum from TXO entries: ${commitHashSum || 'EMPTY'}`);

  // Calculate private key for signing the transaction (PRIVKEY + commit hashes from JSON)
  console.log(`DEBUG: Calculating signing key: addhex "${PRIVKEY.substring(0, 4)}...${PRIVKEY.substring(PRIVKEY.length - 4)}" "${commitHashSum || 'EMPTY'}"`);
  const SIGNING_KEY = commitHashSum ?
    safeAddHex(PRIVKEY, commitHashSum) :
    PRIVKEY;
  console.log(`DEBUG: SIGNING_KEY (truncated): ${SIGNING_KEY.substring(0, 4)}...${SIGNING_KEY.substring(SIGNING_KEY.length - 4)}`);

  console.log('DEBUG: Generating public key from signing key');
  const SIGNING_PUBKEY = execSync(`npx key2pub "${SIGNING_KEY}"`).toString().trim();
  console.log(`DEBUG: SIGNING_PUBKEY: ${SIGNING_PUBKEY}`);

  // Add current commit hash to the sum for the new destination address
  console.log(`DEBUG: Adding current commit hash to sum: ${commitHashSum || 'EMPTY'} + ${COMMIT_HASH}`);
  if (commitHashSum) {
    const addHexCommand = `addhex "${commitHashSum}" "${COMMIT_HASH}"`;
    console.log(`DEBUG: Running command: ${addHexCommand}`);
    commitHashSum = safeAddHex(commitHashSum, COMMIT_HASH);
  } else {
    commitHashSum = COMMIT_HASH;
  }
  console.log(`DEBUG: Final commit hash sum including current commit: ${commitHashSum}`);

  // Calculate new key by adding hex values with all commit hashes (including current commit)
  console.log(`DEBUG: Calculating destination key: addhex "${PRIVKEY.substring(0, 4)}...${PRIVKEY.substring(PRIVKEY.length - 4)}" "${commitHashSum}"`);
  const NEWKEY = safeAddHex(PRIVKEY, commitHashSum);
  console.log(`DEBUG: NEWKEY (truncated): ${NEWKEY.substring(0, 4)}...${NEWKEY.substring(NEWKEY.length - 4)}`);

  // Parse transaction information
  console.log(`DEBUG: Parsing transaction info from last TXO: ${lastTxo}`);
  console.log(`DEBUG: Running txo_parser for TXID: npx txo_parser '${lastTxo}' --txid`);
  const TXID = execSync(`npx txo_parser '${lastTxo}' --txid`).toString().trim();
  console.log(`DEBUG: TXID: ${TXID}`);

  console.log(`DEBUG: Running txo_parser for OUTPUT: npx txo_parser '${lastTxo}' --output`);
  const OUTPUT = execSync(`npx txo_parser '${lastTxo}' --output`).toString().trim();
  console.log(`DEBUG: OUTPUT: ${OUTPUT}`);

  console.log(`DEBUG: Running txo_parser for AMOUNT: npx txo_parser '${lastTxo}' --amount`);
  const amountStr = execSync(`npx txo_parser '${lastTxo}' --amount`).toString().trim();
  console.log(`DEBUG: Raw AMOUNT string: ${amountStr}`);
  const AMOUNT = parseInt(amountStr);
  console.log(`DEBUG: Parsed AMOUNT: ${AMOUNT}`);

  // Calculate fee and new amount
  const FEE = 1000;
  console.log(`DEBUG: Fee set to ${FEE} satoshis`);
  const NEWAMOUNT = AMOUNT - FEE;
  console.log(`DEBUG: New amount after fee: ${NEWAMOUNT} satoshis (${AMOUNT} - ${FEE})`);

  // Generate new public key for destination
  console.log(`DEBUG: Generating new public key from NEWKEY for destination`);
  const NEWPUB = execSync(`npx key2pub "${NEWKEY}"`).toString().trim();
  console.log(`DEBUG: NEWPUB (destination): ${NEWPUB}`);

  // Build transaction
  console.log('DEBUG: Constructing txbuilder command');
  const txbuilderCommand = `/home/melvin/remote/github.com/melvincarvalho/txbuilder/txbuilder.sh "${SIGNING_KEY}" "${SIGNING_PUBKEY}" "${TXID}" "${OUTPUT}" "${AMOUNT}" "${NEWPUB}" "${NEWAMOUNT}"`;
  console.log(`DEBUG: txbuilder command (with sensitive data masked): /home/melvin/remote/github.com/melvincarvalho/txbuilder/txbuilder.sh "***SIGNING_KEY***" "${SIGNING_PUBKEY}" "${TXID}" "${OUTPUT}" "${AMOUNT}" "${NEWPUB}" "${NEWAMOUNT}"`);

  // Execute txbuilder command
  try {
    console.log('DEBUG: Executing txbuilder command...');
    const TXBUILDER_OUTPUT = execSync(txbuilderCommand).toString();
    console.log(`DEBUG: txbuilder raw output: ${TXBUILDER_OUTPUT}`);

    const outputLines = TXBUILDER_OUTPUT.split('\n').filter(Boolean);
    console.log(`DEBUG: txbuilder output has ${outputLines.length} lines`);

    const LAST_LINE = outputLines.pop();
    console.log(`DEBUG: Last line of txbuilder output: ${LAST_LINE}`);

    // Send transaction
    try {
      console.log(`DEBUG: Sending transaction to network ${NETWORK}`);
      console.log(`DEBUG: Running sendtx.sh with last line of txbuilder output and network ${NETWORK}`);
      const NEWTX = execSync(`/home/melvin/bin/sendtx.sh "${LAST_LINE}" ${NETWORK}`).toString().trim();
      console.log(`DEBUG: Transaction successfully sent, NEWTX: ${NEWTX}`);

      // Calculate new values for TXO URI - use the new destination key/pubkey for the URI
      console.log('DEBUG: Using calculated NEWKEY/NEWPUB for the TXO URI');

      const TXO_URI = `txo:tbtc4:${NEWTX}:0?amount=${NEWAMOUNT}&pubkey=${NEWPUB}&commit=${COMMIT_HASH}`;
      console.log(`DEBUG: Generated TXO_URI: ${TXO_URI}`);

      // Update txo.json file
      console.log(`DEBUG: Updating TXO file (${TXOFILE}) with new TXO_URI`);
      console.log(`DEBUG: Current txoData has ${txoData.length} entries`);
      txoData.push(TXO_URI);
      console.log(`DEBUG: After adding new URI, txoData has ${txoData.length} entries`);

      const jsonString = JSON.stringify(txoData, null, 2);
      console.log(`DEBUG: Writing ${jsonString.length} bytes to ${TXOFILE}`);
      fs.writeFileSync(TXOFILE, jsonString);
      console.log(`DEBUG: Successfully added new TXO URI to ${TXOFILE}`);
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
  console.log('=== GITMARK DEBUG END ===');
} catch (error) {
  console.error('=== GITMARK DEBUG ERROR ===');
  console.error(`Fatal error: ${error.message}`);
  console.error('Error stack trace:');
  console.error(error.stack);
  if (error.stdout) console.error(`Command output: ${error.stdout.toString()}`);
  if (error.stderr) console.error(`Command stderr: ${error.stderr.toString()}`);
  console.error('=== GITMARK DEBUG END WITH ERROR ===');
  process.exit(1);
} 