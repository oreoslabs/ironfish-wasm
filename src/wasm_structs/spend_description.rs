/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use ironfish_rust::{MerkleNoteHash, SpendDescription};
use wasm_bindgen::prelude::*;

use super::WasmIronfishError;

#[wasm_bindgen]
pub struct WasmSpendDescription {
    pub(crate) description: SpendDescription,
}

#[wasm_bindgen]
impl WasmSpendDescription {
    #[wasm_bindgen(getter, js_name = "treeSize")]
    pub fn tree_size(&self) -> u32 {
        self.description.tree_size()
    }

    #[wasm_bindgen(getter, js_name = "rootHash")]
    pub fn root_hash(&self) -> Result<Vec<u8>, JsValue> {
        let mut cursor: std::io::Cursor<Vec<u8>> = std::io::Cursor::new(vec![]);
        MerkleNoteHash::new(self.description.root_hash())
            .write(&mut cursor)
            .map_err(WasmIronfishError)?;
        Ok(cursor.into_inner())
    }

    #[wasm_bindgen(getter)]
    pub fn nullifier(&self) -> Vec<u8> {
        self.description.nullifier().to_vec()
    }
}
