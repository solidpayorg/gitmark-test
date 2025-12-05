#!/usr/bin/env node

/**
 * git-mark-init - Initialize gitmark for a repository
 *
 * Usage:
 *   git mark-init [voucher-uri]
 *
 * If voucher-uri is provided, funds will be transferred from the voucher
 * to the newly generated key. Change goes back to the voucher address.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { generateKeypair, getPublicKey } from './lib/keys.js';
import { setPrivateKey, setNetwork, isGitRepo, getPrivateKey } from './lib/config.js';
import { parseVoucher, createVoucher, loadVoucher, saveVoucher, INIT_AMOUNT, MIN_FEE } from './lib/voucher.js';

const args = process.argv.slice(2);

// Help
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
git-mark-init - Initialize gitmark for a repository

Usage:
  git mark-init [options] [voucher-uri]

Arguments:
  voucher        TXO voucher URI or path to voucher file
                 Format: txo:<chain>:<txid>:<vout>?amount=<sats>&key=<key>
                 If a file path is given, the voucher is read from the file
                 and updated with the change output after use.

Options:
  -h, --help     Show this help message
  -v, --version  Show version number
  --global       Store key in global git config (default: local)
  --force        Overwrite existing key

Examples:
  # Initialize with a voucher URI
  git mark-init "txo:tbtc4:abc...def:0?amount=5000000&key=123...abc"

  # Initialize from voucher file (file is updated with change)
  git mark-init /path/to/faucet.voucher

  # Just generate a key (no funding)
  git mark-init

  # Use global config
  git mark-init --global
`);
  process.exit(0);
}

// Version
if (args.includes('--version') || args.includes('-v')) {
  const pkg = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url)));
  console.log(pkg.version);
  process.exit(0);
}

// Parse flags
const useGlobal = args.includes('--global');
const force = args.includes('--force');

// Default faucet location
const DEFAULT_FAUCET = path.join(os.homedir(), '.gitmark', 'faucet.txt');

// Find voucher argument - can be a URI or a file path
const voucherArgRaw = args.find(a =>
  !a.startsWith('-') &&
  a !== '--global' &&
  a !== '--force'
);

// Resolve voucher: if it's a file, read from it
let voucherArg = null;
let voucherFile = null;

if (voucherArgRaw) {
  if (voucherArgRaw.startsWith('txo:') || voucherArgRaw.startsWith('urn:voucher:')) {
    // Direct URI
    voucherArg = voucherArgRaw;
  } else if (fs.existsSync(voucherArgRaw)) {
    // File path - read voucher from file
    voucherFile = voucherArgRaw;
    voucherArg = loadVoucher(voucherFile);
    if (!voucherArg) {
      console.error(`Error: Could not read voucher from file: ${voucherFile}`);
      process.exit(1);
    }
  } else {
    console.error(`Error: Invalid voucher. Must be a txo: URI or a file path.`);
    process.exit(1);
  }
} else if (fs.existsSync(DEFAULT_FAUCET)) {
  // No voucher provided, but default faucet exists
  voucherFile = DEFAULT_FAUCET;
  voucherArg = loadVoucher(voucherFile);
  if (voucherArg) {
    console.log(`Using default faucet: ${DEFAULT_FAUCET}`);
  }
}

async function main() {
  console.log('=== git-mark-init ===\n');

  // Check if in git repo (unless using global)
  if (!useGlobal && !isGitRepo()) {
    console.error('Error: Not in a git repository. Use --global for global config.');
    process.exit(1);
  }

  // Check for existing key
  const existingKey = getPrivateKey();
  if (existingKey && !force) {
    console.log('Existing key found. Use --force to overwrite.');
    console.log(`Public key: ${getPublicKey(existingKey)}`);
    process.exit(0);
  }

  // Generate new keypair
  console.log('Generating new keypair...');
  const { privateKey, publicKey } = generateKeypair();
  console.log(`Public key: ${publicKey}`);

  // Save to git config
  const scope = useGlobal ? 'global' : 'local';
  setPrivateKey(privateKey, useGlobal);
  console.log(`Private key saved to ${scope} git config (nostr.privkey)`);

  // If voucher provided, fund the new wallet
  if (voucherArg) {
    console.log('\nProcessing voucher...');

    try {
      const voucher = parseVoucher(voucherArg);
      console.log(`Chain: ${voucher.chain}`);
      console.log(`Voucher amount: ${voucher.amount} sats`);

      // Calculate amounts
      const userAmount = Math.min(INIT_AMOUNT, voucher.amount - MIN_FEE);
      const changeAmount = voucher.amount - userAmount - MIN_FEE;

      if (userAmount <= 0) {
        throw new Error(`Voucher amount too low. Need at least ${INIT_AMOUNT + MIN_FEE} sats.`);
      }

      console.log(`\nTransaction plan:`);
      console.log(`  Input:  ${voucher.amount} sats (from voucher)`);
      console.log(`  Output: ${userAmount} sats (to you)`);
      if (changeAmount > 0) {
        console.log(`  Change: ${changeAmount} sats (back to voucher)`);
      }
      console.log(`  Fee:    ${MIN_FEE} sats`);

      // Build transaction
      const { buildTx } = await import('btctx');
      const voucherPubkey = getPublicKey(voucher.privateKey);

      const outputs = [{ pubkey: publicKey, amount: userAmount }];

      // Add change output back to voucher address
      if (changeAmount > 0) {
        outputs.push({ pubkey: voucherPubkey, amount: changeAmount });
      }

      console.log('\nBuilding transaction...');
      const { hex, txid } = await buildTx({
        privateKey: voucher.privateKey,
        publicKey: voucherPubkey,
        txid: voucher.txid,
        vout: voucher.vout,
        inputAmount: voucher.amount,
        outputs,
      });

      // Broadcast
      console.log('Broadcasting transaction...');
      const sendtx = (await import('sendtx')).default;
      const broadcastTxid = await sendtx(hex, voucher.chain);
      console.log(`Transaction broadcast: ${broadcastTxid}`);

      // Create TXO file
      const txoDir = '.well-known/txo';
      const txoFile = path.join(txoDir, 'txo.json');

      fs.mkdirSync(txoDir, { recursive: true });

      const txoUri = `txo:${voucher.chain}:${broadcastTxid}:0?amount=${userAmount}&pubkey=${publicKey}`;
      const txoData = [txoUri];

      fs.writeFileSync(txoFile, JSON.stringify(txoData, null, 2));
      console.log(`\nTXO file created: ${txoFile}`);

      // Set network
      setNetwork(voucher.chain, useGlobal);

      // Update voucher with change output
      if (changeAmount > 0) {
        const newVoucher = createVoucher({
          chain: voucher.chain,
          txid: broadcastTxid,
          vout: 1,
          privateKey: voucher.privateKey,
          amount: changeAmount,
        });

        // If loaded from file, save new voucher back to file
        if (voucherFile) {
          saveVoucher(newVoucher, voucherFile);
          console.log(`\nVoucher file updated: ${voucherFile}`);
        } else {
          console.log(`\n--- New faucet voucher (share to replenish) ---`);
          console.log(newVoucher);
        }
      } else if (voucherFile) {
        // No change - voucher is exhausted
        console.log(`\nWarning: Voucher exhausted (no change). File not updated.`);
      }

      console.log('\n=== Initialization complete! ===');
      console.log(`\nYou can now use: git mark "your commit message"`);

    } catch (error) {
      console.error(`\nError processing voucher: ${error.message}`);
      console.log('\nKey was saved. You can fund manually and create txo.json later.');
      process.exit(1);
    }
  } else {
    console.log('\nNo voucher provided. Key saved but wallet not funded.');
    console.log('To fund manually:');
    console.log(`  1. Send testnet4 coins to address derived from pubkey: ${publicKey}`);
    console.log('  2. Create .well-known/txo/txo.json with the TXO URI');
    console.log('\nOr run again with a voucher:');
    console.log('  git mark-init "txo:tbtc4:<txid>:<vout>?amount=<sats>&key=<key>"');
  }
}

main().catch(error => {
  console.error(`Fatal error: ${error.message}`);
  process.exit(1);
});
