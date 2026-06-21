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
