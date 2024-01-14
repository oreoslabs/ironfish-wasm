use ironfish_rust::transaction::{Bls12, Proof};
use wasm_bindgen::prelude::*;
use std::io::Cursor;

#[wasm_bindgen]
pub struct WasmProof {
    pub(crate) proof: Proof<Bls12>,
}

#[wasm_bindgen]
impl WasmProof {
    #[wasm_bindgen]
    pub fn from_array(v: &[u8]) -> Result<WasmProof, JsValue> {
        let mut cursor = Cursor::new(v);
        let proof = Proof::read(&mut cursor).map_err(|e| JsValue::from_str(&e.to_string()))?;
        Ok(Self { proof })
    }
}
