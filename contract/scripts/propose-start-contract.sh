#!/bin/bash
set -xueo pipefail

cd /workspace/contract

SCRIPT=${SCRIPT:-start-game1.js}
PERMIT=${PERMIT:-start-game1-permit.json}
ls -sh "$SCRIPT" "$PERMIT"

PROPOSAL=$(agd query gov proposals --output json | jq -c '.proposals | length | .+1')

make fund-acct

TITLE=${TITLE:-"Start Game Place Contract"}
FROM=${FROM:-user1}
CHAIN_ID=${CHAIN_ID:-agoriclocal}

agd tx gov submit-proposal swingset-core-eval "$PERMIT" "$SCRIPT" \
  --title="${TITLE}" --description="Evaluate $SCRIPT" \
  --deposit=10000000ubld --gas=auto --gas-adjustment=1.2 \
  --from $FROM --chain-id $CHAIN_ID --keyring-backend=test \
  --yes -b block

set +x # not so noisy for this part
. /usr/src/upgrade-test-scripts/env_setup.sh
voteLatestProposalAndWait
