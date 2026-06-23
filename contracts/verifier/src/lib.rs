#![no_std]
use soroban_sdk::{contract, contracterror, contractimpl, symbol_short, Bytes, Env, Symbol};
use ultrahonk_soroban_verifier::{UltraHonkVerifier, VkLoadError, PROOF_BYTES};

#[contract]
pub struct VerifierContract;

#[contracterror]
#[repr(u32)]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum VerifierError {
    VkInvalidLength = 1,
    VkInvalidParameters = 2,
    ProofParseError = 3,
    VerificationFailed = 4,
    VkNotSet = 5,
    AlreadyInitialized = 6,
}

#[contractimpl]
impl VerifierContract {
    fn key_vk() -> Symbol {
        symbol_short!("vk")
    }

    pub fn __constructor(env: Env, vk_bytes: Bytes) -> Result<(), VerifierError> {
        if env.storage().instance().has(&Self::key_vk()) {
            return Err(VerifierError::AlreadyInitialized);
        }
        let _ = UltraHonkVerifier::new(&env, &vk_bytes).map_err(|e| match e {
            VkLoadError::WrongLength => VerifierError::VkInvalidLength,
            VkLoadError::InvalidParameters => VerifierError::VkInvalidParameters,
        })?;
        env.storage().instance().set(&Self::key_vk(), &vk_bytes);
        Ok(())
    }

    pub fn vk_bytes(env: Env) -> Result<Bytes, VerifierError> {
        env.storage()
            .instance()
            .get(&Self::key_vk())
            .ok_or(VerifierError::VkNotSet)
    }

    pub fn verify_proof(
        env: Env,
        public_inputs: Bytes,
        proof_bytes: Bytes,
    ) -> Result<(), VerifierError> {
        if proof_bytes.len() as usize != PROOF_BYTES {
            return Err(VerifierError::ProofParseError);
        }

        let vk_bytes: Bytes = env
            .storage()
            .instance()
            .get(&Self::key_vk())
            .ok_or(VerifierError::VkNotSet)?;

        let verifier = UltraHonkVerifier::new(&env, &vk_bytes).map_err(|e| match e {
            VkLoadError::WrongLength => VerifierError::VkInvalidLength,
            VkLoadError::InvalidParameters => VerifierError::VkInvalidParameters,
        })?;

        verifier
            .verify(&env, &proof_bytes, &public_inputs)
            .map_err(|_| VerifierError::VerificationFailed)?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as TestAddress, Address, Bytes, Env};

    fn vk_bytes(env: &Env) -> Bytes {
        Bytes::from_slice(
            env,
            include_bytes!("../../../circuits/shielded_pool/target/vk"),
        )
    }

    fn proof_bytes(env: &Env) -> Bytes {
        Bytes::from_slice(
            env,
            include_bytes!("../../../circuits/shielded_pool/target/proof"),
        )
    }

    fn public_inputs_bytes(env: &Env) -> Bytes {
        Bytes::from_slice(
            env,
            include_bytes!("../../../circuits/shielded_pool/target/public_inputs"),
        )
    }

    #[test]
    fn test_constructor_stores_vk() {
        let env = Env::default();
        let vk = vk_bytes(&env);
        let contract_id: Address = env.register(VerifierContract, (vk.clone(),));
        let client = VerifierContractClient::new(&env, &contract_id);
        let stored_vk = client.vk_bytes();
        assert_eq!(stored_vk, vk);
    }

    #[test]
    fn test_double_init_fails() {
        let env = Env::default();
        let vk = vk_bytes(&env);
        let contract_id: Address = env.register(VerifierContract, (vk.clone(),));
        let client = VerifierContractClient::new(&env, &contract_id);

        // vk_bytes() should still work (not re-init)
        assert_eq!(client.vk_bytes(), vk);
    }

    #[test]
    fn test_verify_proof_valid() {
        let env = Env::default();
        env.cost_estimate().budget().reset_unlimited();
        let vk = vk_bytes(&env);
        let contract_id: Address = env.register(VerifierContract, (vk,));
        let client = VerifierContractClient::new(&env, &contract_id);

        let proof = proof_bytes(&env);
        let public_inputs = public_inputs_bytes(&env);
        client.verify_proof(&public_inputs, &proof);
    }

    #[test]
    fn test_verify_proof_wrong_length() {
        let env = Env::default();
        let vk = vk_bytes(&env);
        let contract_id: Address = env.register(VerifierContract, (vk,));
        let client = VerifierContractClient::new(&env, &contract_id);

        let short_proof = Bytes::from_slice(&env, &[0u8; 64]);
        let public_inputs = public_inputs_bytes(&env);
        let result = client.try_verify_proof(&public_inputs, &short_proof);
        assert_eq!(result.err().unwrap().unwrap(), VerifierError::ProofParseError);
    }

    #[test]
    fn test_verify_proof_wrong_inputs() {
        let env = Env::default();
        env.cost_estimate().budget().reset_unlimited();
        let vk = vk_bytes(&env);
        let contract_id: Address = env.register(VerifierContract, (vk,));
        let client = VerifierContractClient::new(&env, &contract_id);

        let proof = proof_bytes(&env);
        let bad_inputs = Bytes::from_slice(&env, &[0u8; 64]);
        let result = client.try_verify_proof(&bad_inputs, &proof);
        assert_eq!(
            result.err().unwrap().unwrap(),
            VerifierError::VerificationFailed
        );
    }

    #[test]
    fn test_vk_not_set_returns_error() {
        let env = Env::default();
        let contract_id: Address = <Address as TestAddress>::generate(&env);
        let client = VerifierContractClient::new(&env, &contract_id);
        let result = client.try_vk_bytes();
        assert!(result.is_err());
    }
}
