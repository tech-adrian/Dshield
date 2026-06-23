#!/usr/bin/env bash
# DShield end-to-end demo: deposit -> client-side ZK proof -> relayed withdraw,
# all on-chain against the currently deployed pool. Pass the network as $1
# (default: local). Requires a freshly deployed pool (run `just deploy` first).
set -euo pipefail

NETWORK="${1:-local}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"
export PATH="$HOME/.nargo/bin:$HOME/.bb:$PATH"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
say() { echo -e "${YELLOW}$1${NC}"; }
ok() { echo -e "  ${GREEN}$1${NC}"; }

POOL=$(cat .pool_id)
ALICE=$(stellar keys address alice)
RELAYER=$(stellar keys address relayer)

# Fixed demo note (nullifier=1234, secret=5678). Public demo values, not secret.
CM=09711240e2f912c8249474f00228941f9dd99fd69e156873472d0a4db3803895
NF=2b0c9e50ac135931c5f87dff253337d63f6fe5f8b0f2489b92a5a9446cc4b3d2

say "DShield demo on '$NETWORK'"
echo "  pool:    $POOL"
echo "  user:    $ALICE"
echo "  relayer: $RELAYER"

IDX=$(stellar contract invoke --id "$POOL" --source alice --network "$NETWORK" -- get_next_index 2>&1 | tail -1)
if [ "$IDX" != "0" ]; then
  echo -e "${RED}Pool already has $IDX deposit(s). The demo needs a fresh pool — run 'just deploy $NETWORK' first.${NC}"
  exit 1
fi

say "1/5  Depositing 10 USDC into the shielded pool"
stellar contract invoke --id "$POOL" --source alice --network "$NETWORK" --send=yes \
  -- deposit --depositor "$ALICE" --commitment "$CM" >/dev/null
ROOT=$(stellar contract invoke --id "$POOL" --source alice --network "$NETWORK" -- get_root 2>&1 | tail -1 | tr -d '"')
ok "deposited; merkle root 0x${ROOT:0:16}..."

say "2/5  Computing recipient hash (binds the proof to the recipient)"
RHASH=$(cd frontend && node scripts/recipient-hash.mjs "$ALICE")
ok "recipient hash ${RHASH:0:18}..."

say "3/5  Generating ZK proof (Noir + UltraHonk, keccak)"
cd circuits/shielded_pool
cat > Prover.toml <<TOML
nullifier = "1234"
secret = "5678"
root = "0x${ROOT}"
nullifier_hash = "0x${NF}"
recipient = "${RHASH}"
path_bits = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
path_siblings = [
    "0x00",
    "0x0b63a53787021a4a962a452c2921b3663aff1ffd8d5510540f8e659e782956f1",
    "0x0e34ac2c09f45a503d2908bcb12f1cbae5fa4065759c88d501c097506a8b2290",
    "0x21f9172d72fdcdafc312eee05cf5092980dda821da5b760a9fb8dbdf607c8a20",
    "0x2373ea368857ec7af97e7b470d705848e2bf93ed7bef142a490f2119bcf82d8e",
    "0x120157cfaaa49ce3da30f8b47879114977c24b266d58b0ac18b325d878aafddf",
    "0x01c28fe1059ae0237b72334700697bdf465e03df03986fe05200cadeda66bd76",
    "0x2d78ed82f93b61ba718b17c2dfe5b52375b4d37cbbed6f1fc98b47614b0cf21b",
    "0x067243231eddf4222f3911defbba7705aff06ed45960b27f6f91319196ef97e1",
    "0x1849b85f3c693693e732dfc4577217acc18295193bede09ce8b97ad910310972",
    "0x2a775ea761d20435b31fa2c33ff07663e24542ffb9e7b293dfce3042eb104686",
    "0x0f320b0703439a8114f81593de99cd0b8f3b9bf854601abb5b2ea0e8a3dda4a7",
    "0x0d07f6e7a8a0e9199d6d92801fff867002ff5b4808962f9da2ba5ce1bdd26a73",
    "0x1c4954081e324939350febc2b918a293ebcdaead01be95ec02fcbe8d2c1635d1",
    "0x0197f2171ef99c2d053ee1fb5ff5ab288d56b9b41b4716c9214a4d97facc4c4a",
    "0x2b9cdd484c5ba1e4d6efcc3f18734b5ac4c4a0b9102e2aeb48521a661d3feee9",
    "0x14f44d672eb357739e42463497f9fdac46623af863eea4d947ca00a497dcdeb3",
    "0x071d7627ae3b2eabda8a810227bf04206370ac78dbf6c372380182dbd3711fe3",
    "0x2fdc08d9fe075ac58cb8c00f98697861a13b3ab6f9d41a4e768f75e477475bf5",
    "0x20165fe405652104dceaeeca92950aa5adc571b8cafe192878cba58ff1be49c5",
]
TOML
nargo execute >/dev/null 2>&1
bb prove --scheme ultra_honk --oracle_hash keccak \
  --bytecode_path target/shielded_pool.json --witness_path target/shielded_pool.gz \
  --output_path target --output_format bytes_and_fields >/dev/null 2>&1
cd "$ROOT_DIR"
ok "proof generated ($(wc -c < circuits/shielded_pool/target/proof) bytes)"

say "4/5  Relaying the withdrawal (the user's account never signs or pays)"
stellar contract invoke --id "$POOL" --source relayer --network "$NETWORK" --send=yes \
  -- withdraw --recipient "$ALICE" \
  --public_inputs-file-path circuits/shielded_pool/target/public_inputs \
  --proof_bytes-file-path circuits/shielded_pool/target/proof >/dev/null
ok "withdrawal submitted by relayer $RELAYER"

say "5/5  Verifying on-chain state"
USED=$(stellar contract invoke --id "$POOL" --source alice --network "$NETWORK" -- is_nullifier_used --nullifier_hash "$NF" 2>&1 | tail -1)
if [ "$USED" = "true" ]; then
  ok "nullifier consumed (double-spend now impossible)"
else
  echo -e "${RED}  nullifier not consumed — withdrawal may have failed${NC}"; exit 1
fi

echo ""
echo -e "${GREEN}Done — deposit -> ZK proof -> relayed withdraw verified on-chain.${NC}"
