use dep::poseidon::poseidon2::Poseidon2;

pub fn main(a: Field, b: Field) -> pub Field {
    Poseidon2::hash([a, b], 2)
}
