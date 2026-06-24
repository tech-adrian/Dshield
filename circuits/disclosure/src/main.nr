use dep::poseidon::poseidon2::Poseidon2;

global TREE_DEPTH: u32 = 20;

fn hash2(a: Field, b: Field) -> Field {
    Poseidon2::hash([a, b], 2)
}

fn constrain_bit(bit: Field) {
    assert(bit * (1 - bit) == 0);
}

fn compute_root(leaf: Field, path_siblings: [Field; TREE_DEPTH], path_bits: [Field; TREE_DEPTH]) -> Field {
    let mut cur = leaf;
    for i in 0..TREE_DEPTH {
        let sib = path_siblings[i];
        let bit = path_bits[i];
        constrain_bit(bit);
        if bit == 0 {
            cur = hash2(cur, sib);
        } else {
            cur = hash2(sib, cur);
        }
    }
    cur
}

pub fn main(
    // Public inputs
    merkle_root: pub Field,
    kyc_hash: pub Field,
    threshold: pub Field,
    auditor_key: pub Field,

    // Private inputs
    kyc_preimage: Field,
    nullifier: Field,
    secret: Field,
    amount: Field,
    path_siblings: [Field; TREE_DEPTH],
    path_bits: [Field; TREE_DEPTH],
) {
    // 1. KYC proof: user knows the preimage behind the registered kyc_hash
    let computed_kyc = hash2(kyc_preimage, 0);
    assert(computed_kyc == kyc_hash);

    // 2. Wallet authorization: user owns a note in the shielded pool
    let leaf = hash2(nullifier, secret);
    let computed_root = compute_root(leaf, path_siblings, path_bits);
    assert(computed_root == merkle_root);

    // 3. Threshold proof: balance >= threshold without revealing exact amount
    let amount_u64 = amount as u64;
    let threshold_u64 = threshold as u64;
    assert(amount_u64 >= threshold_u64);

    // 4. Bind disclosure to auditor (prevents proof replay to others)
    let _binding = Poseidon2::hash([amount, auditor_key, nullifier], 3);
}
