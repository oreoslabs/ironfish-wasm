use ironfish_rust::transaction::{Bls12, Proof};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct WasmProof {
    pub(crate) proof: Proof<Bls12>,
}
