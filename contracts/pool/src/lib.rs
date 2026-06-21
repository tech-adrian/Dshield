#![no_std]
extern crate alloc;

use alloc::vec::Vec;
use soroban_poseidon::{poseidon2_hash, Field};
use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, crypto::BnScalar, symbol_short, Address,
    Bytes, BytesN, Env, IntoVal, InvokeError, Symbol, Val, Vec as SorobanVec, U256,
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

const TREE_DEPTH: u32 = 20;
const MAX_LEAVES: u32 = 1u32 << TREE_DEPTH;

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

fn parse_public_inputs(bytes: &Bytes) -> Result<([u8; 32], [u8; 32]), PoolError> {
    if bytes.len() != 64 {
        return Err(PoolError::InvalidPublicInputs);
    }
    let mut buf = [0u8; 64];
    bytes.copy_into_slice(&mut buf);
    let mut root = [0u8; 32];
    root.copy_from_slice(&buf[..32]);
    let mut nullifier_hash = [0u8; 32];
    nullifier_hash.copy_from_slice(&buf[32..]);
    Ok((root, nullifier_hash))
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
    pub fn __constructor(env: Env, verifier: Address) -> Result<(), PoolError> {
        if env.storage().instance().has(&key_verifier()) {
            return Err(PoolError::AlreadyInitialized);
        }
        env.storage().instance().set(&key_verifier(), &verifier);
        Ok(())
    }

    pub fn deposit(env: Env, commitment: BytesN<32>) -> Result<u32, PoolError> {
        let cm_key = (key_commitment_prefix(), commitment.clone());
        if env.storage().instance().has(&cm_key) {
            return Err(PoolError::CommitmentExists);
        }

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
        next_index = next_index.saturating_add(1);
        env.storage().instance().set(&key_next_index(), &next_index);

        Ok(idx)
    }

    pub fn withdraw(env: Env, public_inputs: Bytes, proof_bytes: Bytes) -> Result<(), PoolError> {
        if proof_bytes.len() as usize != PROOF_BYTES {
            return Err(PoolError::VerificationFailed);
        }

        let (root_arr, nf_arr) = parse_public_inputs(&public_inputs)?;
        let nf_from_proof = BytesN::from_array(&env, &nf_arr);

        let nf_key = (key_nullifier_prefix(), nf_from_proof.clone());
        if env.storage().instance().has(&nf_key) {
            return Err(PoolError::NullifierUsed);
        }

        let root_from_proof = BytesN::from_array(&env, &root_arr);
        let stored_root: BytesN<32> = env
            .storage()
            .instance()
            .get(&key_root())
            .ok_or(PoolError::RootNotSet)?;
        if stored_root != root_from_proof {
            return Err(PoolError::RootMismatch);
        }

        let verifier: Address = env
            .storage()
            .instance()
            .get(&key_verifier())
            .ok_or(PoolError::VerifierNotSet)?;
        verify_proof(&env, &verifier, public_inputs, proof_bytes)?;

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
}
