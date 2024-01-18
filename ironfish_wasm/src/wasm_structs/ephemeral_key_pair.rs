use ironfish_rust::keys::EphemeralKeyPair;
use wasm_bindgen::prelude::*;
use js_sys::Uint8Array;

#[wasm_bindgen]
pub struct WasmEphemeralKeyPair {
    pub(crate) key_pair_bytes: Vec<u8>,
}

#[wasm_bindgen]
impl WasmEphemeralKeyPair {
    #[wasm_bindgen]
    pub fn from_array(v: JsValue) -> Self {
        let array = Uint8Array::new(&v);
        Self { key_pair_bytes: array.to_vec() }
    }
}
