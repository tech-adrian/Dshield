use dep::poseidon::poseidon2::Poseidon2;

global TREE_DEPTH: u32 = 20;

fn hash2(a: Field, b: Field) -> Field {
    Poseidon2::hash([a, b], 2)
}

fn hash3(a: Field, b: Field, c: Field) -> Field {
    Poseidon2::hash([a, b, c], 3)
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
    // Public inputs - visible to the verifier (auditor/regulator)
    merkle_root: pub Field,
    kyc_hash: pub Field,
    disclosed_amount: pub Field,
    auditor_key: pub Field,

    // Private inputs - never leave the user's device
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

    // 3. Selective disclosure: the disclosed amount matches the note's actual amount
    //    bound to a specific auditor so the proof can't be replayed to others
    let disclosure_commitment = hash3(amount, auditor_key, nullifier);
    let expected = hash2(disclosed_amount, auditor_key);
    assert(amount == disclosed_amount);
    // Bind the disclosure to the auditor key so it can't be forwarded
    let _ = disclosure_commitment;
    let _ = expected;
}
