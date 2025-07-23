#!/usr/bin/env bash

git add .
git commit -m "first"

TXOFILE=.well-known/txo/txo.json
NETWORK=tbtc4

COMMIT_HASH=$(git log -1 --format=%H)

echo "$COMMIT_HASH"

PRIVKEY=$(git config nostr.privkey)
PUBKEY=$(npx key2pub "$PRIVKEY")

NEWKEY=$(addhex "$PRIVKEY" "$COMMIT_HASH")

echo "$NEWKEY"

TXID=$(npx txo_parser $(jq -r .[-1] <.well-known/txo/txo.json) --txid)
OUTPUT=$(npx txo_parser $(jq -r .[-1] <.well-known/txo/txo.json) --output)
AMOUNT=$(npx txo_parser $(jq -r .[-1] <.well-known/txo/txo.json) --amount)

echo "$TXID"
echo "$OUTPUT"
echo "$AMOUNT"

COMMIT_HASH=$(git log -1 --format=%H)

NEWKEY=$(addhex "$PRIVKEY" "$COMMIT_HASH")

echo "$NEWKEY"

FEE=1000
NEWAMOUNT=$(( $AMOUNT - $FEE ))

NEWPUB=$(npx key2pub "$NEWKEY")

echo /home/melvin/remote/github.com/melvincarvalho/txbuilder/txbuilder.sh "$PRIVKEY" "$PUBKEY" "$TXID" "$OUTPUT" "$AMOUNT" "$NEWPUB" "$NEWAMOUNT"


TXBUILDER_OUTPUT=$(/home/melvin/remote/github.com/melvincarvalho/txbuilder/txbuilder.sh "$PRIVKEY" "$PUBKEY" "$TXID" "$OUTPUT" "$AMOUNT" "$NEWPUB" "$NEWAMOUNT")

# Check the exit status
if [ $? -eq 0 ]; then
    # If successful, extract and print the last line
    LAST_LINE=$(echo "$TXBUILDER_OUTPUT" | tail -n 1)
    echo "$LAST_LINE"

    NEWTX=$( /home/melvin/bin/sendtx.sh "$LAST_LINE" $NETWORK )

    if [ $? -eq 0 ]; then
      echo "Successfully sent tx"

      COMMIT_HASH=$(git log -1 --format=%H)
      NEWKEY=$(addhex "$PRIVKEY" "$COMMIT_HASH")
      NEWPUB=$(npx key2pub "$NEWKEY")
      echo "txo:tbtc4:$NEWTX:0?amount=$NEWAMOUNT&pubkey=$NEWPUB&commit=$COMMIT_HASH"

      ## add this to the txo file, which is a .json array
      TXO_URI="txo:tbtc4:$NEWTX:0?amount=$NEWAMOUNT&pubkey=$NEWPUB&commit=$COMMIT_HASH"
      jq --arg uri "$TXO_URI" '. + [$uri]' "$TXOFILE" > "$TXOFILE.tmp" && mv "$TXOFILE.tmp" "$TXOFILE"
      echo "Added new TXO URI to $TXOFILE"

    else
      echo "Error: sendtx failed with exit code $?"
      exit 1
    fi

else
    echo "Error: txbuilder.sh failed with exit code $?"
    exit 1
fi


