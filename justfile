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
deploy: build
    #!/usr/bin/env bash
    set -euo pipefail

    echo "Deploying verifier contract..."
    VERIFIER_ID=$(stellar contract deploy \
        --wasm target/wasm32v1-none/release/dshield_verifier.wasm \
        --source alice \
        --network local \
        -- \
        --vk_bytes-file-path circuits/shielded_pool/target/vk)
    echo "Verifier deployed: $VERIFIER_ID"
    echo "$VERIFIER_ID" > .verifier_id

    ALICE_ADDR=$(stellar keys address alice)

    echo "Deploying USDC test token..."
    TOKEN_ID=$(stellar contract asset deploy \
        --asset "USDC:$ALICE_ADDR" \
        --source alice \
        --network local 2>&1 | tail -1)
    echo "USDC token: $TOKEN_ID"
    echo "$TOKEN_ID" > .token_id

    echo "Minting USDC to deployer..."
    stellar contract invoke --id "$TOKEN_ID" --source alice --network local --send=yes \
        -- mint --to "$ALICE_ADDR" --amount 10000000000000 > /dev/null 2>&1
    echo "Deployer funded with 1,000,000 USDC"

    echo "Deploying pool tiers (10, 100, 1000 USDC)..."
    POOL_10=$(stellar contract deploy \
        --wasm target/wasm32v1-none/release/dshield_pool.wasm \
        --source alice --network local \
        -- --verifier "$VERIFIER_ID" --token "$TOKEN_ID" --deposit_amount 100000000)
    echo "Pool 10 USDC: $POOL_10"

    POOL_100=$(stellar contract deploy \
        --wasm target/wasm32v1-none/release/dshield_pool.wasm \
        --source alice --network local \
        -- --verifier "$VERIFIER_ID" --token "$TOKEN_ID" --deposit_amount 1000000000)
    echo "Pool 100 USDC: $POOL_100"

    POOL_1000=$(stellar contract deploy \
        --wasm target/wasm32v1-none/release/dshield_pool.wasm \
        --source alice --network local \
        -- --verifier "$VERIFIER_ID" --token "$TOKEN_ID" --deposit_amount 10000000000)
    echo "Pool 1000 USDC: $POOL_1000"

    echo "$POOL_10" > .pool_id
    echo "POOL_TIERS=10 USDC:$POOL_10:100000000,100 USDC:$POOL_100:1000000000,1000 USDC:$POOL_1000:10000000000"

    ADMIN_ADDR=$ALICE_ADDR

    echo "Deploying compliance contract..."
    COMPLIANCE_ID=$(stellar contract deploy \
        --wasm target/wasm32v1-none/release/dshield_compliance.wasm \
        --source alice \
        --network local \
        -- \
        --vk_bytes-file-path circuits/compliance/target/vk \
        --admin "$ADMIN_ADDR")
    echo "Compliance deployed: $COMPLIANCE_ID"
    echo "$COMPLIANCE_ID" > .compliance_id

# Run the full end-to-end pipeline on localnet
e2e: start fund deploy
    @echo "End-to-end pipeline complete."

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
