#![no_std]
extern crate alloc;

use alloc::vec::Vec;
use soroban_poseidon::{poseidon2_hash, Field};
use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, crypto::BnScalar, symbol_short, token,
    Address, Bytes, BytesN, Env, IntoVal, InvokeError, Symbol, Val, Vec as SorobanVec, U256,
};
use ultrahonk_soroban_verifier::PROOF_BYTES;

#[contract]
pub struct PoolContract;

#[contracterror]
#[repr(u32)]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum PoolError {
    CommitmentExists = 1,
    NullifierUsed = 2,
    VerificationFailed = 3,
    RootMismatch = 4,
    VerifierNotSet = 5,
    TreeFull = 6,
    RootNotSet = 7,
    AlreadyInitialized = 8,
    InvalidPublicInputs = 9,
    TokenNotSet = 10,
}

#[contractevent(topics = ["deposit"], data_format = "map")]
pub struct DepositEvent<'a> {
    #[topic]
    pub idx: &'a u32,
    pub commitment: &'a BytesN<32>,
}

#[contractevent(topics = ["withdraw"], data_format = "single-value")]
pub struct WithdrawEvent<'a> {
    pub nullifier_hash: &'a BytesN<32>,
}

fn key_commitment_prefix() -> Symbol {
    symbol_short!("cm")
}
fn key_nullifier_prefix() -> Symbol {
    symbol_short!("nf")
}
fn key_root() -> Symbol {
    symbol_short!("root")
}
fn key_frontier_prefix() -> Symbol {
    symbol_short!("fr")
}
fn key_next_index() -> Symbol {
    symbol_short!("idx")
}
fn key_verifier() -> Symbol {
    symbol_short!("ver")
}
fn key_token() -> Symbol {
    symbol_short!("token")
}
fn key_deposit_amount() -> Symbol {
    symbol_short!("amt")
}
fn key_root_history_prefix() -> Symbol {
    symbol_short!("rh")
}
fn key_root_history_index() -> Symbol {
    symbol_short!("rhi")
}

const TREE_DEPTH: u32 = 20;
const MAX_LEAVES: u32 = 1u32 << TREE_DEPTH;
const ROOT_HISTORY_SIZE: u32 = 30;

fn poseidon2_hash2(env: &Env, a: &BytesN<32>, b: &BytesN<32>) -> BytesN<32> {
    let modulus = <BnScalar as Field>::modulus(env);
    let a_bytes = Bytes::from_array(env, &a.to_array());
    let b_bytes = Bytes::from_array(env, &b.to_array());
    let mut inputs = SorobanVec::new(env);
    inputs.push_back(U256::from_be_bytes(env, &a_bytes).rem_euclid(&modulus));
    inputs.push_back(U256::from_be_bytes(env, &b_bytes).rem_euclid(&modulus));
    let out = poseidon2_hash::<4, BnScalar>(env, &inputs);
    let out_bytes = out.to_be_bytes();
    let mut out_arr = [0u8; 32];
    out_bytes.copy_into_slice(&mut out_arr);
    BytesN::from_array(env, &out_arr)
}

fn zeroes_for_tree(env: &Env) -> Vec<BytesN<32>> {
    let mut zeroes = Vec::with_capacity(TREE_DEPTH as usize + 1);
    let mut cur = BytesN::from_array(env, &[0u8; 32]);
    zeroes.push(cur.clone());
    for _ in 0..TREE_DEPTH {
        cur = poseidon2_hash2(env, &cur, &cur);
        zeroes.push(cur.clone());
    }
    zeroes
}

fn parse_public_inputs(bytes: &Bytes) -> Result<([u8; 32], [u8; 32], [u8; 32]), PoolError> {
    if bytes.len() != 96 {
        return Err(PoolError::InvalidPublicInputs);
    }
    let mut buf = [0u8; 96];
    bytes.copy_into_slice(&mut buf);
    let mut root = [0u8; 32];
    root.copy_from_slice(&buf[..32]);
    let mut nullifier_hash = [0u8; 32];
    nullifier_hash.copy_from_slice(&buf[32..64]);
    let mut recipient_hash = [0u8; 32];
    recipient_hash.copy_from_slice(&buf[64..96]);
    Ok((root, nullifier_hash, recipient_hash))
}

fn verify_proof(
    env: &Env,
    verifier: &Address,
    public_inputs: Bytes,
    proof_bytes: Bytes,
) -> Result<(), PoolError> {
    let mut args: SorobanVec<Val> = SorobanVec::new(env);
    args.push_back(public_inputs.into_val(env));
    args.push_back(proof_bytes.into_val(env));
    env.try_invoke_contract::<(), InvokeError>(verifier, &Symbol::new(env, "verify_proof"), args)
        .map_err(|_| PoolError::VerificationFailed)?
        .map_err(|_| PoolError::VerificationFailed)
}

#[contractimpl]
impl PoolContract {
    pub fn __constructor(
        env: Env,
        verifier: Address,
        token: Address,
        deposit_amount: i128,
    ) -> Result<(), PoolError> {
        if env.storage().instance().has(&key_verifier()) {
            return Err(PoolError::AlreadyInitialized);
        }
        env.storage().instance().set(&key_verifier(), &verifier);
        env.storage().instance().set(&key_token(), &token);
        env.storage()
            .instance()
            .set(&key_deposit_amount(), &deposit_amount);
        Ok(())
    }

    pub fn deposit(env: Env, depositor: Address, commitment: BytesN<32>) -> Result<u32, PoolError> {
        depositor.require_auth();

        let cm_key = (key_commitment_prefix(), commitment.clone());
        if env.storage().instance().has(&cm_key) {
            return Err(PoolError::CommitmentExists);
        }

        let token_addr: Address = env
            .storage()
            .instance()
            .get(&key_token())
            .ok_or(PoolError::TokenNotSet)?;
        let amount: i128 = env
            .storage()
            .instance()
            .get(&key_deposit_amount())
            .ok_or(PoolError::TokenNotSet)?;

        let contract_addr = env.current_contract_address();
        token::Client::new(&env, &token_addr).transfer(&depositor, &contract_addr, &amount);

        let zeroes = zeroes_for_tree(&env);
        let mut next_index: u32 = env
            .storage()
            .instance()
            .get(&key_next_index())
            .unwrap_or(0u32);
        if next_index >= MAX_LEAVES {
            return Err(PoolError::TreeFull);
        }

        let idx = next_index;
        env.storage().instance().set(&cm_key, &true);
        DepositEvent {
            idx: &idx,
            commitment: &commitment,
        }
        .publish(&env);

        let ins_idx = next_index;
        let mut cur = commitment.clone();
        let mut i = 0u32;
        while i < TREE_DEPTH {
            let bit = (ins_idx >> i) & 1;
            if bit == 0 {
                let fk = (key_frontier_prefix(), i);
                env.storage().instance().set(&fk, &cur);
                let z = &zeroes[i as usize];
                cur = poseidon2_hash2(&env, &cur, z);
            } else {
                let fk = (key_frontier_prefix(), i);
                let left: BytesN<32> = env
                    .storage()
                    .instance()
                    .get(&fk)
                    .unwrap_or_else(|| zeroes[i as usize].clone());
                cur = poseidon2_hash2(&env, &left, &cur);
            }
            i += 1;
        }

        env.storage().instance().set(&key_root(), &cur);

        let rh_idx: u32 = env
            .storage()
            .instance()
            .get(&key_root_history_index())
            .unwrap_or(0u32);
        let rh_key = (key_root_history_prefix(), rh_idx % ROOT_HISTORY_SIZE);
        env.storage().instance().set(&rh_key, &cur);
        env.storage()
            .instance()
            .set(&key_root_history_index(), &(rh_idx + 1));

        next_index = next_index.saturating_add(1);
        env.storage().instance().set(&key_next_index(), &next_index);

        Ok(idx)
    }

    pub fn withdraw(
        env: Env,
        recipient: Address,
        public_inputs: Bytes,
        proof_bytes: Bytes,
    ) -> Result<(), PoolError> {
        if proof_bytes.len() as usize != PROOF_BYTES {
            return Err(PoolError::VerificationFailed);
        }

        let (root_arr, nf_arr, recipient_arr) = parse_public_inputs(&public_inputs)?;
        let nf_from_proof = BytesN::from_array(&env, &nf_arr);
        let _recipient_from_proof = BytesN::from_array(&env, &recipient_arr);

        let nf_key = (key_nullifier_prefix(), nf_from_proof.clone());
        if env.storage().instance().has(&nf_key) {
            return Err(PoolError::NullifierUsed);
        }

        let root_from_proof = BytesN::from_array(&env, &root_arr);
        if !env.storage().instance().has(&key_root()) {
            return Err(PoolError::RootNotSet);
        }

        let mut root_valid = false;
        let rh_count: u32 = env
            .storage()
            .instance()
            .get(&key_root_history_index())
            .unwrap_or(0u32);
        let check_count = if rh_count < ROOT_HISTORY_SIZE {
            rh_count
        } else {
            ROOT_HISTORY_SIZE
        };
        let mut j = 0u32;
        while j < check_count {
            let rh_key = (key_root_history_prefix(), j);
            if let Some(stored) = env
                .storage()
                .instance()
                .get::<_, BytesN<32>>(&rh_key)
            {
                if stored == root_from_proof {
                    root_valid = true;
                    break;
                }
            }
            j += 1;
        }
        if !root_valid {
            return Err(PoolError::RootMismatch);
        }

        let verifier: Address = env
            .storage()
            .instance()
            .get(&key_verifier())
            .ok_or(PoolError::VerifierNotSet)?;
        verify_proof(&env, &verifier, public_inputs, proof_bytes)?;

        let token_addr: Address = env
            .storage()
            .instance()
            .get(&key_token())
            .ok_or(PoolError::TokenNotSet)?;
        let amount: i128 = env
            .storage()
            .instance()
            .get(&key_deposit_amount())
            .ok_or(PoolError::TokenNotSet)?;

        let contract_addr = env.current_contract_address();
        token::Client::new(&env, &token_addr).transfer(&contract_addr, &recipient, &amount);

        env.storage().instance().set(&nf_key, &true);
        WithdrawEvent {
            nullifier_hash: &nf_from_proof,
        }
        .publish(&env);

        Ok(())
    }

    pub fn is_nullifier_used(env: Env, nullifier_hash: BytesN<32>) -> bool {
        let nf_key = (key_nullifier_prefix(), nullifier_hash);
        env.storage().instance().has(&nf_key)
    }

    pub fn get_root(env: Env) -> Option<BytesN<32>> {
        env.storage().instance().get(&key_root())
    }

    pub fn get_next_index(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&key_next_index())
            .unwrap_or(0u32)
    }

    pub fn get_token(env: Env) -> Result<Address, PoolError> {
        env.storage()
            .instance()
            .get(&key_token())
            .ok_or(PoolError::TokenNotSet)
    }

    pub fn get_deposit_amount(env: Env) -> Result<i128, PoolError> {
        env.storage()
            .instance()
            .get(&key_deposit_amount())
            .ok_or(PoolError::TokenNotSet)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::Address as TestAddress, token::StellarAssetClient, token::TokenClient, Address,
        Env,
    };

    fn dummy_commitment(env: &Env, seed: u8) -> BytesN<32> {
        let mut arr = [0u8; 32];
        arr[0] = seed;
        BytesN::from_array(env, &arr)
    }

    fn setup_with_token(env: &Env) -> (Address, Address, Address) {
        env.mock_all_auths();
        let admin = <Address as TestAddress>::generate(env);
        let token_id = env.register_stellar_asset_contract_v2(admin.clone());
        let sac = StellarAssetClient::new(env, &token_id.address());

        let depositor = <Address as TestAddress>::generate(env);
        sac.mint(&depositor, &1_000_000_000);

        let verifier_id = <Address as TestAddress>::generate(env);
        let deposit_amount: i128 = 10_000_000;
        let pool_id = env.register(
            PoolContract,
            (verifier_id, token_id.address(), deposit_amount),
        );
        (pool_id, depositor, token_id.address())
    }

    #[test]
    fn test_deposit_increments_index() {
        let env = Env::default();
        env.mock_all_auths();
        env.cost_estimate().budget().reset_unlimited();
        let (pool_id, depositor, _) = setup_with_token(&env);
        let client = PoolContractClient::new(&env, &pool_id);

        assert_eq!(client.get_next_index(), 0);

        let c1 = dummy_commitment(&env, 1);
        let idx = client.deposit(&depositor, &c1);
        assert_eq!(idx, 0);
        assert_eq!(client.get_next_index(), 1);
    }

    #[test]
    fn test_deposit_sets_root() {
        let env = Env::default();
        env.mock_all_auths();
        env.cost_estimate().budget().reset_unlimited();
        let (pool_id, depositor, _) = setup_with_token(&env);
        let client = PoolContractClient::new(&env, &pool_id);

        assert!(client.get_root().is_none());

        let c1 = dummy_commitment(&env, 1);
        client.deposit(&depositor, &c1);

        let root = client.get_root();
        assert!(root.is_some());
    }

    #[test]
    fn test_duplicate_commitment_fails() {
        let env = Env::default();
        env.mock_all_auths();
        env.cost_estimate().budget().reset_unlimited();
        let (pool_id, depositor, _) = setup_with_token(&env);
        let client = PoolContractClient::new(&env, &pool_id);

        let c1 = dummy_commitment(&env, 1);
        client.deposit(&depositor, &c1);

        let result = client.try_deposit(&depositor, &c1);
        assert_eq!(result.err().unwrap().unwrap(), PoolError::CommitmentExists);
    }

    #[test]
    fn test_nullifier_unused_by_default() {
        let env = Env::default();
        let (pool_id, _, _) = setup_with_token(&env);
        let client = PoolContractClient::new(&env, &pool_id);

        let nf = dummy_commitment(&env, 99);
        assert!(!client.is_nullifier_used(&nf));
    }

    #[test]
    fn test_withdraw_no_root_fails() {
        let env = Env::default();
        let (pool_id, _, _) = setup_with_token(&env);
        let client = PoolContractClient::new(&env, &pool_id);

        let recipient = <Address as TestAddress>::generate(&env);
        let public_inputs = Bytes::from_slice(&env, &[0u8; 96]);
        let proof = Bytes::from_slice(&env, &[0u8; PROOF_BYTES]);

        let result = client.try_withdraw(&recipient, &public_inputs, &proof);
        assert_eq!(result.err().unwrap().unwrap(), PoolError::RootNotSet);
    }

    #[test]
    fn test_deposit_transfers_tokens() {
        let env = Env::default();
        env.mock_all_auths();
        env.cost_estimate().budget().reset_unlimited();
        let (pool_id, depositor, token_addr) = setup_with_token(&env);
        let client = PoolContractClient::new(&env, &pool_id);
        let token = TokenClient::new(&env, &token_addr);

        let balance_before = token.balance(&depositor);
        let c1 = dummy_commitment(&env, 1);
        client.deposit(&depositor, &c1);
        let balance_after = token.balance(&depositor);

        assert_eq!(balance_before - balance_after, 10_000_000);
        assert_eq!(token.balance(&pool_id), 10_000_000);
    }

    #[test]
    fn test_withdraw_wrong_proof_length() {
        let env = Env::default();
        env.mock_all_auths();
        env.cost_estimate().budget().reset_unlimited();
        let (pool_id, depositor, _) = setup_with_token(&env);
        let client = PoolContractClient::new(&env, &pool_id);

        let c1 = dummy_commitment(&env, 1);
        client.deposit(&depositor, &c1);

        let recipient = <Address as TestAddress>::generate(&env);
        let public_inputs = Bytes::from_slice(&env, &[0u8; 96]);
        let bad_proof = Bytes::from_slice(&env, &[0u8; 100]);

        let result = client.try_withdraw(&recipient, &public_inputs, &bad_proof);
        assert_eq!(
            result.err().unwrap().unwrap(),
            PoolError::VerificationFailed
        );
    }

    #[test]
    fn test_withdraw_bad_public_inputs_length() {
        let env = Env::default();
        env.mock_all_auths();
        env.cost_estimate().budget().reset_unlimited();
        let (pool_id, depositor, _) = setup_with_token(&env);
        let client = PoolContractClient::new(&env, &pool_id);

        let c1 = dummy_commitment(&env, 1);
        client.deposit(&depositor, &c1);

        let recipient = <Address as TestAddress>::generate(&env);
        let bad_inputs = Bytes::from_slice(&env, &[0u8; 32]);
        let proof = Bytes::from_slice(&env, &[0u8; PROOF_BYTES]);

        let result = client.try_withdraw(&recipient, &bad_inputs, &proof);
        assert_eq!(
            result.err().unwrap().unwrap(),
            PoolError::InvalidPublicInputs
        );
    }

    #[test]
    fn test_withdraw_root_mismatch() {
        let env = Env::default();
        env.mock_all_auths();
        env.cost_estimate().budget().reset_unlimited();
        let (pool_id, depositor, _) = setup_with_token(&env);
        let client = PoolContractClient::new(&env, &pool_id);

        let c1 = dummy_commitment(&env, 1);
        client.deposit(&depositor, &c1);

        let recipient = <Address as TestAddress>::generate(&env);
        let mut pi = [0u8; 96];
        pi[0] = 0xFF;
        let public_inputs = Bytes::from_slice(&env, &pi);
        let proof = Bytes::from_slice(&env, &[0u8; PROOF_BYTES]);

        let result = client.try_withdraw(&recipient, &public_inputs, &proof);
        assert_eq!(result.err().unwrap().unwrap(), PoolError::RootMismatch);
    }

    #[test]
    fn test_multiple_deposits_different_roots() {
        let env = Env::default();
        env.mock_all_auths();
        env.cost_estimate().budget().reset_unlimited();
        let (pool_id, depositor, _) = setup_with_token(&env);
        let client = PoolContractClient::new(&env, &pool_id);

        let c1 = dummy_commitment(&env, 1);
        client.deposit(&depositor, &c1);
        let root1 = client.get_root().unwrap();

        let c2 = dummy_commitment(&env, 2);
        client.deposit(&depositor, &c2);
        let root2 = client.get_root().unwrap();

        assert_ne!(root1, root2);
    }

    #[test]
    fn test_get_token_and_amount() {
        let env = Env::default();
        let (pool_id, _, _) = setup_with_token(&env);
        let client = PoolContractClient::new(&env, &pool_id);

        let _ = client.get_token();
        assert_eq!(client.get_deposit_amount(), 10_000_000);
    }

    #[test]
    fn test_root_history_accepts_old_root() {
        let env = Env::default();
        env.mock_all_auths();
        env.cost_estimate().budget().reset_unlimited();
        let (pool_id, depositor, _) = setup_with_token(&env);
        let client = PoolContractClient::new(&env, &pool_id);

        let c1 = dummy_commitment(&env, 1);
        client.deposit(&depositor, &c1);
        let root_after_first = client.get_root().unwrap();

        let c2 = dummy_commitment(&env, 2);
        client.deposit(&depositor, &c2);
        let root_after_second = client.get_root().unwrap();
        assert_ne!(root_after_first, root_after_second);

        // A withdraw using the OLD root should still pass root validation
        // (it will fail at proof verification, but NOT at root mismatch)
        let mut pi = [0u8; 96];
        pi[..32].copy_from_slice(&root_after_first.to_array());
        let public_inputs = Bytes::from_slice(&env, &pi);
        let proof = Bytes::from_slice(&env, &[0u8; PROOF_BYTES]);

        let recipient = <Address as TestAddress>::generate(&env);
        let result = client.try_withdraw(&recipient, &public_inputs, &proof);
        // Should fail with VerificationFailed (bad proof), NOT RootMismatch
        assert_ne!(result.err().unwrap().unwrap(), PoolError::RootMismatch);
    }
}
