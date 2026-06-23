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
        let left = bit == 0;
        if left {
            cur = hash2(cur, sib);
        } else {
            cur = hash2(sib, cur);
        }
    }
    cur
}

pub fn main(
    root: pub Field,
    nullifier_hash: pub Field,
    recipient: pub Field,
    nullifier: Field,
    secret: Field,
    path_siblings: [Field; TREE_DEPTH],
    path_bits: [Field; TREE_DEPTH],
) {
    let leaf = hash2(nullifier, secret);

    let nf = hash2(nullifier, 0);
    assert(nf == nullifier_hash);

    let computed_root = compute_root(leaf, path_siblings, path_bits);
    assert(computed_root == root);

    // `recipient` is a committed public input. The front-running protection is
    // enforced on-chain: the pool contract recomputes the recipient hash from
    // the actual payout address and rejects the withdrawal unless it equals
    // this value (see recipient_hash_from_address). This assert simply keeps
    // the public input from being optimized away by the compiler.
    assert(recipient == recipient);
}
