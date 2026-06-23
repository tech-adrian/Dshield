set dotenv-load

export PATH := env("HOME") + "/.bb:" + env("HOME") + "/.nargo/bin:" + env("PATH")
export STELLAR_NETWORK := env("STELLAR_NETWORK", "local")

default:
    @just --list

# Check all dependencies are installed
setup:
    @echo "Checking dependencies..."
    @nargo --version
    @bb --version
    @stellar --version | head -1
    @just --version
    @rustup target list --installed | grep wasm
    @echo "All dependencies OK."

# Start Stellar localnet with Protocol 26 (future) and unlimited resource limits
start:
    stellar container start -t future --name stellar-local --limits unlimited
    @echo "Waiting for RPC to become healthy..."
    @until curl -s http://localhost:8000/soroban/rpc -X POST -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' 2>/dev/null | grep -q '"status"'; do sleep 3; done
    @echo "Localnet ready at http://localhost:8000"

# Stop Stellar localnet
stop:
    stellar container stop stellar-local 2>/dev/null || true

# Fund the deployer account on localnet
fund:
    stellar keys generate alice --network local 2>/dev/null || true
    @echo "Account funded."

# Compile all Noir circuits and generate VKs
build-circuits:
    @echo "Building shielded_pool circuit..."
    cd circuits/shielded_pool && nargo compile
    cd circuits/shielded_pool && bb write_vk --scheme ultra_honk --oracle_hash keccak --bytecode_path target/shielded_pool.json --output_path target --output_format bytes_and_fields
    @echo "Building compliance circuit..."
    cd circuits/compliance && nargo compile
    cd circuits/compliance && bb write_vk --scheme ultra_honk --oracle_hash keccak --bytecode_path target/compliance.json --output_path target --output_format bytes_and_fields
    @echo "All circuits built."

# Generate a test proof from the shielded_pool circuit
prove-pool:
    cd circuits/shielded_pool && nargo execute
    cd circuits/shielded_pool && bb prove --scheme ultra_honk --oracle_hash keccak --bytecode_path target/shielded_pool.json --witness_path target/shielded_pool.gz --output_path target --output_format bytes_and_fields
    @echo "Pool proof generated."

# Generate a test proof from the compliance circuit
prove-compliance:
    cd circuits/compliance && nargo execute
    cd circuits/compliance && bb prove --scheme ultra_honk --oracle_hash keccak --bytecode_path target/compliance.json --witness_path target/compliance.gz --output_path target --output_format bytes_and_fields
    @echo "Compliance proof generated."

# Verify pool proof locally (off-chain)
verify-pool:
    cd circuits/shielded_pool && bb verify -s ultra_honk --oracle_hash keccak -k target/vk -p target/proof -i target/public_inputs
    @echo "Pool proof verified."

# Verify compliance proof locally (off-chain)
verify-compliance:
    cd circuits/compliance && bb verify -s ultra_honk --oracle_hash keccak -k target/vk -p target/proof -i target/public_inputs
    @echo "Compliance proof verified."

# Build Soroban contract WASM binaries
build-contracts:
    stellar contract build
    @echo "Contracts built:"
    @ls -la target/wasm32v1-none/release/*.wasm

# Build everything (circuits + contracts)
build: build-circuits build-contracts

# Deploy all contracts to the network
# Deploy all contracts. Pass `testnet` to target Stellar testnet, e.g.
# `just deploy testnet`; defaults to the local quickstart network.
deploy network="local": build
    #!/usr/bin/env bash
    set -euo pipefail

    NETWORK="{{network}}"
    if [ "$NETWORK" = "testnet" ]; then
        RPC_URL="https://soroban-testnet.stellar.org"
        PASSPHRASE="Test SDF Network ; September 2015"
        FRIENDBOT="https://friendbot.stellar.org/?addr="
        # Make sure the CLI knows the testnet network (idempotent).
        stellar network add testnet --rpc-url "$RPC_URL" \
            --network-passphrase "$PASSPHRASE" 2>/dev/null || true
    else
        RPC_URL="http://localhost:8000/soroban/rpc"
        PASSPHRASE="Standalone Network ; February 2017"
        FRIENDBOT="http://localhost:8000/friendbot?addr="
    fi
    echo "Deploying to network: $NETWORK"

    # Ensure the deployer + issuer + relayer exist and are funded (friendbot is
    # idempotent). On testnet this funds via the public friendbot. The relayer
    # submits withdrawals on users' behalf so their accounts stay off-chain.
    stellar keys generate alice --network "$NETWORK" 2>/dev/null || true
    stellar keys generate usdc-issuer --network "$NETWORK" 2>/dev/null || true
    stellar keys generate relayer --network "$NETWORK" 2>/dev/null || true
    ALICE_ADDR=$(stellar keys address alice)
    ISSUER_ADDR=$(stellar keys address usdc-issuer)
    RELAYER_ADDR=$(stellar keys address relayer)
    curl -s "${FRIENDBOT}${ALICE_ADDR}" >/dev/null 2>&1 || true
    curl -s "${FRIENDBOT}${ISSUER_ADDR}" >/dev/null 2>&1 || true
    curl -s "${FRIENDBOT}${RELAYER_ADDR}" >/dev/null 2>&1 || true

    echo "Deploying verifier contract..."
    VERIFIER_ID=$(stellar contract deploy \
        --wasm target/wasm32v1-none/release/dshield_verifier.wasm \
        --source alice \
        --network "$NETWORK" \
        -- \
        --vk_bytes-file-path circuits/shielded_pool/target/vk)
    echo "Verifier deployed: $VERIFIER_ID"
    echo "$VERIFIER_ID" > .verifier_id

    echo "Deploying USDC test token..."
    # Use a SEPARATE issuer so the deployer (alice) is a normal holder. A SAC
    # cannot mint to its own issuer ("operation invalid on issuer"), so alice
    # must not be the issuer.
    # The SAC address is deterministic; deploying an already-deployed asset
    # errors, so derive the id and only deploy if it isn't there yet. Deploy
    # from alice (already funded) — SAC deployment is permissionless and the
    # admin still becomes the issuer.
    TOKEN_ID=$(stellar contract id asset --asset "USDC:$ISSUER_ADDR" --network "$NETWORK" 2>&1 | tail -1)
    if ! stellar contract invoke --id "$TOKEN_ID" --source alice --network "$NETWORK" -- name >/dev/null 2>&1; then
        stellar contract asset deploy --asset "USDC:$ISSUER_ADDR" --source alice --network "$NETWORK" >/dev/null 2>&1
    fi
    echo "USDC token: $TOKEN_ID"
    echo "$TOKEN_ID" > .token_id

    echo "Establishing deployer trustline to USDC..."
    # Classic assets require a trustline before an account can hold them.
    stellar tx new change-trust --source alice --line "USDC:$ISSUER_ADDR" --network "$NETWORK" >/dev/null 2>&1 || true

    echo "Minting USDC to deployer..."
    stellar contract invoke --id "$TOKEN_ID" --source usdc-issuer --network "$NETWORK" --send=yes \
        -- mint --to "$ALICE_ADDR" --amount 10000000000000 > /dev/null 2>&1
    echo "Deployer funded with 1,000,000 USDC"

    echo "Deploying pool tiers (10, 100, 1000 USDC)..."
    POOL_10=$(stellar contract deploy \
        --wasm target/wasm32v1-none/release/dshield_pool.wasm \
        --source alice --network "$NETWORK" \
        -- --verifier "$VERIFIER_ID" --token "$TOKEN_ID" --deposit_amount 100000000)
    echo "Pool 10 USDC: $POOL_10"

    POOL_100=$(stellar contract deploy \
        --wasm target/wasm32v1-none/release/dshield_pool.wasm \
        --source alice --network "$NETWORK" \
        -- --verifier "$VERIFIER_ID" --token "$TOKEN_ID" --deposit_amount 1000000000)
    echo "Pool 100 USDC: $POOL_100"

    POOL_1000=$(stellar contract deploy \
        --wasm target/wasm32v1-none/release/dshield_pool.wasm \
        --source alice --network "$NETWORK" \
        -- --verifier "$VERIFIER_ID" --token "$TOKEN_ID" --deposit_amount 10000000000)
    echo "Pool 1000 USDC: $POOL_1000"

    echo "$POOL_10" > .pool_id
    echo "POOL_TIERS=10 USDC:$POOL_10:100000000,100 USDC:$POOL_100:1000000000,1000 USDC:$POOL_1000:10000000000"

    ADMIN_ADDR=$ALICE_ADDR

    echo "Deploying compliance contract..."
    COMPLIANCE_ID=$(stellar contract deploy \
        --wasm target/wasm32v1-none/release/dshield_compliance.wasm \
        --source alice \
        --network "$NETWORK" \
        -- \
        --vk_bytes-file-path circuits/compliance/target/vk \
        --admin "$ADMIN_ADDR")
    echo "Compliance deployed: $COMPLIANCE_ID"
    echo "$COMPLIANCE_ID" > .compliance_id

    echo "Writing frontend/.env.local..."
    # Use alice as the dev wallet so the app deposits from the account that
    # holds USDC + the trustline. Throwaway key (local/testnet only).
    ALICE_SECRET=$(stellar keys show alice 2>/dev/null || stellar keys secret alice 2>/dev/null || true)
    ISSUER_SECRET=$(stellar keys show usdc-issuer 2>/dev/null || stellar keys secret usdc-issuer 2>/dev/null || true)
    RELAYER_SECRET=$(stellar keys show relayer 2>/dev/null || stellar keys secret relayer 2>/dev/null || true)
    cat > frontend/.env.local <<EOF
    NEXT_PUBLIC_RPC_URL=$RPC_URL
    NEXT_PUBLIC_NETWORK_PASSPHRASE=$PASSPHRASE
    NEXT_PUBLIC_DEV_SECRET_KEY=$ALICE_SECRET
    NEXT_PUBLIC_USDC_CODE=USDC
    NEXT_PUBLIC_USDC_ISSUER=$ISSUER_ADDR
    USDC_ISSUER_SECRET=$ISSUER_SECRET
    RELAYER_SECRET=$RELAYER_SECRET
    NEXT_PUBLIC_POOL_CONTRACT_ID=$POOL_10
    NEXT_PUBLIC_POOL_TIERS=10 USDC:$POOL_10:100000000,100 USDC:$POOL_100:1000000000,1000 USDC:$POOL_1000:10000000000
    NEXT_PUBLIC_COMPLIANCE_CONTRACT_ID=$COMPLIANCE_ID
    EOF
    # Strip the leading indentation the recipe block adds.
    sed -i 's/^    //' frontend/.env.local
    echo "Frontend env updated. Restart the dev server to pick up new contract IDs."

# Run the full end-to-end pipeline on localnet
e2e: start fund deploy
    @echo "End-to-end pipeline complete."

# Demo the privacy loop on-chain: deposit -> ZK proof -> relayed withdraw.
# Run against the active deployment; needs a freshly deployed pool.
# e.g. `just deploy testnet && just demo testnet`
demo network="local":
    bash scripts/demo.sh {{network}}

# Demo the compliant-disclosure loop on-chain: register KYC -> ZK proof ->
# verify_compliance, plus a negative KYC-gate check. e.g. `just demo-compliance testnet`
demo-compliance network="local":
    bash scripts/demo-compliance.sh {{network}}

# Run contract unit tests
test-contracts:
    cargo test --workspace

# Run frontend unit tests
test-frontend:
    cd frontend && pnpm test

# Run all unit tests
test: test-contracts test-frontend

# Run E2E integration tests
test-e2e:
    ./tests/e2e.sh

# Clean up artifacts and containers
clean:
    stellar container stop stellar-local 2>/dev/null || true
    rm -f .verifier_id .pool_id .compliance_id
    rm -rf circuits/shielded_pool/target circuits/compliance/target
    @echo "Cleaned."
