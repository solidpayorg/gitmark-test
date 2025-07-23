#!/usr/bin/env bash

ADDR=$1
PUBKEY=$2

# Create .well-known/txo directory if it doesn't exist
mkdir -p .well-known/txo

# Fetch UTXO data
UTXO_DATA=$(curl -s "https://mempool.space/testnet4/api/address/$ADDR/utxo")

# Parse the UTXO data to extract txid, vout, and value
TXID=$(echo "$UTXO_DATA" | jq -r '.[0].txid')
VOUT=$(echo "$UTXO_DATA" | jq -r '.[0].vout')
AMOUNT=$(echo "$UTXO_DATA" | jq -r '.[0].value')

# Format the URI
URI="txo:tbtc4:$TXID:$VOUT?amount=$AMOUNT&pubkey=$PUBKEY"

# Output the URI
echo "$URI"

# Create JSON array and save to file
JSON_CONTENT="[\"$URI\"]"
echo "$JSON_CONTENT" > .well-known/txo/txo.json

echo "URI saved to .well-known/txo/txo.json"
