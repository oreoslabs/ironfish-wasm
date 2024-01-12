use ironfish_rust::keys::EphemeralKeyPair;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct WasmEphemeralKeyPair {
    pub(crate) key_pair_bytes: Vec<u8>,
}
