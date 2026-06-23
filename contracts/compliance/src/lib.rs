#![no_std]
use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, symbol_short, Address, Bytes, BytesN,
    Env, Symbol,
};
use ultrahonk_soroban_verifier::{UltraHonkVerifier, VkLoadError, PROOF_BYTES};

#[contract]
pub struct ComplianceContract;

#[contracterror]
#[repr(u32)]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum ComplianceError {
    VkInvalidLength = 1,
    VkInvalidParameters = 2,
    ProofParseError = 3,
    VerificationFailed = 4,
    VkNotSet = 5,
    AlreadyInitialized = 6,
    InvalidPublicInputs = 7,
    KycNotRegistered = 8,
}

#[contractevent(topics = ["kyc_registered"])]
pub struct KycRegisteredEvent<'a> {
    pub kyc_hash: &'a BytesN<32>,
    pub registrar: &'a Address,
}

#[contractevent(topics = ["compliance_verified"])]
pub struct ComplianceVerifiedEvent<'a> {
    pub kyc_hash: &'a BytesN<32>,
    pub auditor_key: &'a BytesN<32>,
}

#[contractimpl]
impl ComplianceContract {
    fn key_vk() -> Symbol {
        symbol_short!("vk")
    }
    fn key_admin() -> Symbol {
        symbol_short!("admin")
    }
    fn key_kyc_prefix() -> Symbol {
        symbol_short!("kyc")
    }

    pub fn __constructor(env: Env, vk_bytes: Bytes, admin: Address) -> Result<(), ComplianceError> {
        if env.storage().instance().has(&Self::key_vk()) {
            return Err(ComplianceError::AlreadyInitialized);
        }
        let _ = UltraHonkVerifier::new(&env, &vk_bytes).map_err(|e| match e {
            VkLoadError::WrongLength => ComplianceError::VkInvalidLength,
            VkLoadError::InvalidParameters => ComplianceError::VkInvalidParameters,
        })?;
        env.storage().instance().set(&Self::key_vk(), &vk_bytes);
        env.storage().instance().set(&Self::key_admin(), &admin);
        Ok(())
    }

    pub fn register_kyc(env: Env, kyc_hash: BytesN<32>) -> Result<(), ComplianceError> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&Self::key_admin())
            .ok_or(ComplianceError::VkNotSet)?;
        admin.require_auth();

        let kyc_key = (Self::key_kyc_prefix(), kyc_hash.clone());
        env.storage().instance().set(&kyc_key, &true);

        KycRegisteredEvent {
            kyc_hash: &kyc_hash,
            registrar: &admin,
        }
        .publish(&env);

        Ok(())
    }

    pub fn is_kyc_registered(env: Env, kyc_hash: BytesN<32>) -> bool {
        let kyc_key = (Self::key_kyc_prefix(), kyc_hash);
        env.storage().instance().has(&kyc_key)
    }

    pub fn verify_compliance(
        env: Env,
        public_inputs: Bytes,
        proof_bytes: Bytes,
    ) -> Result<(), ComplianceError> {
        if proof_bytes.len() as usize != PROOF_BYTES {
            return Err(ComplianceError::ProofParseError);
        }

        // Public inputs: [merkle_root(32), kyc_hash(32), disclosed_amount(32), auditor_key(32)]
        if public_inputs.len() != 128 {
            return Err(ComplianceError::InvalidPublicInputs);
        }

        let mut buf = [0u8; 128];
        public_inputs.copy_into_slice(&mut buf);
        let mut kyc_arr = [0u8; 32];
        kyc_arr.copy_from_slice(&buf[32..64]);
        let kyc_hash = BytesN::from_array(&env, &kyc_arr);

        let kyc_key = (Self::key_kyc_prefix(), kyc_hash.clone());
        if !env.storage().instance().has(&kyc_key) {
            return Err(ComplianceError::KycNotRegistered);
        }

        let mut auditor_arr = [0u8; 32];
        auditor_arr.copy_from_slice(&buf[96..128]);
        let auditor_key = BytesN::from_array(&env, &auditor_arr);

        let vk_bytes: Bytes = env
            .storage()
            .instance()
            .get(&Self::key_vk())
            .ok_or(ComplianceError::VkNotSet)?;

        let verifier = UltraHonkVerifier::new(&env, &vk_bytes).map_err(|e| match e {
            VkLoadError::WrongLength => ComplianceError::VkInvalidLength,
            VkLoadError::InvalidParameters => ComplianceError::VkInvalidParameters,
        })?;

        verifier
            .verify(&env, &proof_bytes, &public_inputs)
            .map_err(|_| ComplianceError::VerificationFailed)?;

        ComplianceVerifiedEvent {
            kyc_hash: &kyc_hash,
            auditor_key: &auditor_key,
        }
        .publish(&env);

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::Address as TestAddress,
        Env,
    };

    fn vk_bytes(env: &Env) -> Bytes {
        Bytes::from_slice(
            env,
            include_bytes!("../../../circuits/compliance/target/vk"),
        )
    }

    fn dummy_hash(env: &Env, seed: u8) -> BytesN<32> {
        let mut arr = [0u8; 32];
        arr[0] = seed;
        BytesN::from_array(env, &arr)
    }

    fn setup(env: &Env) -> (Address, Address) {
        let admin = <Address as TestAddress>::generate(env);
        let contract_id: Address =
            env.register(ComplianceContract, (vk_bytes(env), admin.clone()));
        (contract_id, admin)
    }

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    #[test]
    fn test_constructor_stores_vk() {
        let env = Env::default();
        let (contract_id, _admin) = setup(&env);
        assert!(env.as_contract(&contract_id, || {
            env.storage()
                .instance()
                .has(&ComplianceContract::key_vk())
        }));
    }

    #[test]
    fn test_constructor_stores_admin() {
        let env = Env::default();
        let (contract_id, admin) = setup(&env);
        let stored_admin: Address = env.as_contract(&contract_id, || {
            env.storage()
                .instance()
                .get(&ComplianceContract::key_admin())
                .unwrap()
        });
        assert_eq!(stored_admin, admin);
    }

    #[test]
    #[should_panic]
    fn test_constructor_invalid_vk_length() {
        let env = Env::default();
        let admin = <Address as TestAddress>::generate(&env);
        let short_vk = Bytes::from_slice(&env, &[0u8; 32]);
        let _contract_id: Address =
            env.register(ComplianceContract, (short_vk, admin));
    }

    // ──────────────────────────────────────────────
    //  KYC Registration
    // ──────────────────────────────────────────────

    #[test]
    fn test_register_kyc_stores_hash() {
        let env = Env::default();
        env.mock_all_auths();
        let (contract_id, _admin) = setup(&env);
        let client = ComplianceContractClient::new(&env, &contract_id);

        let kyc_hash = dummy_hash(&env, 1);
        client.register_kyc(&kyc_hash);
        assert!(client.is_kyc_registered(&kyc_hash));
    }

    #[test]
    fn test_kyc_not_registered_returns_false() {
        let env = Env::default();
        let (contract_id, _admin) = setup(&env);
        let client = ComplianceContractClient::new(&env, &contract_id);

        let kyc_hash = dummy_hash(&env, 99);
        assert!(!client.is_kyc_registered(&kyc_hash));
    }

    #[test]
    fn test_register_kyc_requires_admin_auth() {
        let env = Env::default();
        let (contract_id, _admin) = setup(&env);
        let client = ComplianceContractClient::new(&env, &contract_id);

        let kyc_hash = dummy_hash(&env, 1);
        let result = client.try_register_kyc(&kyc_hash);
        assert!(result.is_err());
    }

    #[test]
    fn test_multiple_kyc_registrations() {
        let env = Env::default();
        env.mock_all_auths();
        let (contract_id, _admin) = setup(&env);
        let client = ComplianceContractClient::new(&env, &contract_id);

        let h1 = dummy_hash(&env, 1);
        let h2 = dummy_hash(&env, 2);
        let h3 = dummy_hash(&env, 3);

        client.register_kyc(&h1);
        client.register_kyc(&h2);

        assert!(client.is_kyc_registered(&h1));
        assert!(client.is_kyc_registered(&h2));
        assert!(!client.is_kyc_registered(&h3));
    }

    #[test]
    fn test_register_kyc_idempotent() {
        let env = Env::default();
        env.mock_all_auths();
        let (contract_id, _admin) = setup(&env);
        let client = ComplianceContractClient::new(&env, &contract_id);

        let kyc_hash = dummy_hash(&env, 1);
        client.register_kyc(&kyc_hash);
        client.register_kyc(&kyc_hash);
        assert!(client.is_kyc_registered(&kyc_hash));
    }

    #[test]
    fn test_register_kyc_zero_hash() {
        let env = Env::default();
        env.mock_all_auths();
        let (contract_id, _admin) = setup(&env);
        let client = ComplianceContractClient::new(&env, &contract_id);

        let zero_hash = BytesN::from_array(&env, &[0u8; 32]);
        client.register_kyc(&zero_hash);
        assert!(client.is_kyc_registered(&zero_hash));
    }

    #[test]
    fn test_register_kyc_max_hash() {
        let env = Env::default();
        env.mock_all_auths();
        let (contract_id, _admin) = setup(&env);
        let client = ComplianceContractClient::new(&env, &contract_id);

        let max_hash = BytesN::from_array(&env, &[0xFF; 32]);
        client.register_kyc(&max_hash);
        assert!(client.is_kyc_registered(&max_hash));
    }

    #[test]
    fn test_register_kyc_succeeds_with_auth() {
        let env = Env::default();
        env.mock_all_auths();
        let (contract_id, _admin) = setup(&env);
        let client = ComplianceContractClient::new(&env, &contract_id);

        let kyc_hash = dummy_hash(&env, 1);
        client.register_kyc(&kyc_hash);
        assert!(client.is_kyc_registered(&kyc_hash));
    }

    #[test]
    fn test_many_kyc_registrations_isolation() {
        let env = Env::default();
        env.mock_all_auths();
        let (contract_id, _admin) = setup(&env);
        let client = ComplianceContractClient::new(&env, &contract_id);

        for i in 0u8..20 {
            let h = dummy_hash(&env, i);
            client.register_kyc(&h);
        }

        for i in 0u8..20 {
            let h = dummy_hash(&env, i);
            assert!(client.is_kyc_registered(&h));
        }

        let unregistered = dummy_hash(&env, 200);
        assert!(!client.is_kyc_registered(&unregistered));
    }

    // ──────────────────────────────────────────────
    //  Compliance Verification: input validation
    // ──────────────────────────────────────────────

    #[test]
    fn test_verify_compliance_bad_public_inputs_length() {
        let env = Env::default();
        let (contract_id, _admin) = setup(&env);
        let client = ComplianceContractClient::new(&env, &contract_id);

        let bad_inputs = Bytes::from_slice(&env, &[0u8; 64]);
        let proof = Bytes::from_slice(&env, &[0u8; PROOF_BYTES]);

        let result = client.try_verify_compliance(&bad_inputs, &proof);
        assert_eq!(
            result.err().unwrap().unwrap(),
            ComplianceError::InvalidPublicInputs
        );
    }

    #[test]
    fn test_verify_compliance_empty_public_inputs() {
        let env = Env::default();
        let (contract_id, _admin) = setup(&env);
        let client = ComplianceContractClient::new(&env, &contract_id);

        let empty_inputs = Bytes::from_slice(&env, &[]);
        let proof = Bytes::from_slice(&env, &[0u8; PROOF_BYTES]);

        let result = client.try_verify_compliance(&empty_inputs, &proof);
        assert_eq!(
            result.err().unwrap().unwrap(),
            ComplianceError::InvalidPublicInputs
        );
    }

    #[test]
    fn test_verify_compliance_oversized_public_inputs() {
        let env = Env::default();
        let (contract_id, _admin) = setup(&env);
        let client = ComplianceContractClient::new(&env, &contract_id);

        let big_inputs = Bytes::from_slice(&env, &[0u8; 256]);
        let proof = Bytes::from_slice(&env, &[0u8; PROOF_BYTES]);

        let result = client.try_verify_compliance(&big_inputs, &proof);
        assert_eq!(
            result.err().unwrap().unwrap(),
            ComplianceError::InvalidPublicInputs
        );
    }

    #[test]
    fn test_verify_compliance_127_bytes_rejected() {
        let env = Env::default();
        let (contract_id, _admin) = setup(&env);
        let client = ComplianceContractClient::new(&env, &contract_id);

        let inputs = Bytes::from_slice(&env, &[0u8; 127]);
        let proof = Bytes::from_slice(&env, &[0u8; PROOF_BYTES]);

        let result = client.try_verify_compliance(&inputs, &proof);
        assert_eq!(
            result.err().unwrap().unwrap(),
            ComplianceError::InvalidPublicInputs
        );
    }

    #[test]
    fn test_verify_compliance_129_bytes_rejected() {
        let env = Env::default();
        let (contract_id, _admin) = setup(&env);
        let client = ComplianceContractClient::new(&env, &contract_id);

        let inputs = Bytes::from_slice(&env, &[0u8; 129]);
        let proof = Bytes::from_slice(&env, &[0u8; PROOF_BYTES]);

        let result = client.try_verify_compliance(&inputs, &proof);
        assert_eq!(
            result.err().unwrap().unwrap(),
            ComplianceError::InvalidPublicInputs
        );
    }

    // ──────────────────────────────────────────────
    //  Compliance Verification: KYC gate
    // ──────────────────────────────────────────────

    #[test]
    fn test_verify_compliance_kyc_not_registered() {
        let env = Env::default();
        let (contract_id, _admin) = setup(&env);
        let client = ComplianceContractClient::new(&env, &contract_id);

        let mut pi = [0u8; 128];
        pi[32] = 0xAB;
        let public_inputs = Bytes::from_slice(&env, &pi);
        let proof = Bytes::from_slice(&env, &[0u8; PROOF_BYTES]);

        let result = client.try_verify_compliance(&public_inputs, &proof);
        assert_eq!(
            result.err().unwrap().unwrap(),
            ComplianceError::KycNotRegistered
        );
    }

    #[test]
    fn test_verify_compliance_wrong_proof_length() {
        let env = Env::default();
        env.mock_all_auths();
        let (contract_id, _admin) = setup(&env);
        let client = ComplianceContractClient::new(&env, &contract_id);

        let kyc_hash = dummy_hash(&env, 0xAB);
        client.register_kyc(&kyc_hash);

        let mut pi = [0u8; 128];
        pi[32] = 0xAB;
        let public_inputs = Bytes::from_slice(&env, &pi);
        let bad_proof = Bytes::from_slice(&env, &[0u8; 100]);

        let result = client.try_verify_compliance(&public_inputs, &bad_proof);
        assert_eq!(
            result.err().unwrap().unwrap(),
            ComplianceError::ProofParseError
        );
    }

    #[test]
    fn test_verify_compliance_empty_proof() {
        let env = Env::default();
        env.mock_all_auths();
        let (contract_id, _admin) = setup(&env);
        let client = ComplianceContractClient::new(&env, &contract_id);

        let kyc_hash = dummy_hash(&env, 1);
        client.register_kyc(&kyc_hash);

        let mut pi = [0u8; 128];
        pi[32] = 1;
        let public_inputs = Bytes::from_slice(&env, &pi);
        let empty_proof = Bytes::from_slice(&env, &[]);

        let result = client.try_verify_compliance(&public_inputs, &empty_proof);
        assert_eq!(
            result.err().unwrap().unwrap(),
            ComplianceError::ProofParseError
        );
    }

    #[test]
    fn test_verify_compliance_kyc_hash_extraction_exact_position() {
        let env = Env::default();
        env.mock_all_auths();
        let (contract_id, _admin) = setup(&env);
        let client = ComplianceContractClient::new(&env, &contract_id);

        let mut kyc_arr = [0u8; 32];
        kyc_arr[0] = 0xDE;
        kyc_arr[31] = 0xAD;
        let kyc_hash = BytesN::from_array(&env, &kyc_arr);
        client.register_kyc(&kyc_hash);

        let mut pi = [0u8; 128];
        pi[32..64].copy_from_slice(&kyc_arr);
        let public_inputs = Bytes::from_slice(&env, &pi);
        let proof = Bytes::from_slice(&env, &[0u8; PROOF_BYTES]);

        // proof is garbage so it will fail at verification, not at KYC check
        let result = client.try_verify_compliance(&public_inputs, &proof);
        assert_ne!(
            result.err().unwrap().unwrap(),
            ComplianceError::KycNotRegistered
        );
    }

    #[test]
    fn test_verify_compliance_kyc_hash_one_bit_off_rejected() {
        let env = Env::default();
        env.mock_all_auths();
        let (contract_id, _admin) = setup(&env);
        let client = ComplianceContractClient::new(&env, &contract_id);

        let kyc_hash = dummy_hash(&env, 0xAA);
        client.register_kyc(&kyc_hash);

        let mut pi = [0u8; 128];
        pi[32] = 0xAB; // one bit different from 0xAA
        let public_inputs = Bytes::from_slice(&env, &pi);
        let proof = Bytes::from_slice(&env, &[0u8; PROOF_BYTES]);

        let result = client.try_verify_compliance(&public_inputs, &proof);
        assert_eq!(
            result.err().unwrap().unwrap(),
            ComplianceError::KycNotRegistered
        );
    }

    // ──────────────────────────────────────────────
    //  Compliance Verification: error ordering
    // ──────────────────────────────────────────────

    #[test]
    fn test_proof_length_checked_before_kyc() {
        let env = Env::default();
        let (contract_id, _admin) = setup(&env);
        let client = ComplianceContractClient::new(&env, &contract_id);

        let pi = Bytes::from_slice(&env, &[0u8; 128]);
        let short_proof = Bytes::from_slice(&env, &[0u8; 100]);

        let result = client.try_verify_compliance(&pi, &short_proof);
        assert_eq!(
            result.err().unwrap().unwrap(),
            ComplianceError::ProofParseError
        );
    }

    #[test]
    fn test_public_inputs_length_checked_before_proof_length() {
        let env = Env::default();
        let (contract_id, _admin) = setup(&env);
        let client = ComplianceContractClient::new(&env, &contract_id);

        // Both invalid: short public inputs + short proof
        // proof length is checked first in the code
        let short_pi = Bytes::from_slice(&env, &[0u8; 64]);
        let short_proof = Bytes::from_slice(&env, &[0u8; 100]);

        let result = client.try_verify_compliance(&short_pi, &short_proof);
        assert_eq!(
            result.err().unwrap().unwrap(),
            ComplianceError::ProofParseError
        );
    }
}
