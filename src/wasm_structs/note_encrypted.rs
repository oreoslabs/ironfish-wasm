/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use ironfish_rust::IncomingViewKey;
use ironfish_rust::MerkleNote;
use ironfish_rust::MerkleNoteHash;
use ironfish_rust::OutgoingViewKey;
use wasm_bindgen::prelude::*;

use super::{panic_hook, WasmIronfishError, WasmNote};

#[wasm_bindgen]
pub struct WasmNoteEncrypted {
    pub(crate) note: MerkleNote,
}

#[wasm_bindgen]
impl WasmNoteEncrypted {
    #[wasm_bindgen]
    pub fn deserialize(bytes: &[u8]) -> Result<WasmNoteEncrypted, JsValue> {
        panic_hook::set_once();

        let cursor: std::io::Cursor<&[u8]> = std::io::Cursor::new(bytes);
        let note = MerkleNote::read(cursor).map_err(WasmIronfishError)?;
        Ok(WasmNoteEncrypted { note })
    }

    #[wasm_bindgen]
    pub fn serialize(&self) -> Result<Vec<u8>, JsValue> {
        let mut cursor: std::io::Cursor<Vec<u8>> = std::io::Cursor::new(vec![]);
        self.note.write(&mut cursor).map_err(WasmIronfishError)?;
        Ok(cursor.into_inner())
    }

    #[wasm_bindgen]
    pub fn equals(&self, other: &WasmNoteEncrypted) -> bool {
        self.note.eq(&other.note)
    }

    #[wasm_bindgen(js_name = "merkleHash")]
    pub fn merkle_hash(&self) -> Result<Vec<u8>, JsValue> {
        let mut cursor: Vec<u8> = Vec::with_capacity(32);
        self.note
            .merkle_hash()
            .write(&mut cursor)
            .map_err(WasmIronfishError)?;
        Ok(cursor)
    }

    /// Hash two child hashes together to calculate the hash of the
    /// new parent
    #[wasm_bindgen(js_name = "combineHash")]
    pub fn combine_hash(depth: usize, left: &[u8], right: &[u8]) -> Result<Vec<u8>, JsValue> {
        let mut left_hash_reader: std::io::Cursor<&[u8]> = std::io::Cursor::new(left);
        let mut right_hash_reader: std::io::Cursor<&[u8]> = std::io::Cursor::new(right);
        let left_hash = MerkleNoteHash::read(&mut left_hash_reader).map_err(WasmIronfishError)?;
        let right_hash = MerkleNoteHash::read(&mut right_hash_reader).map_err(WasmIronfishError)?;

        let mut cursor: Vec<u8> = Vec::with_capacity(32);

        MerkleNoteHash::new(MerkleNoteHash::combine_hash(
            depth,
            &left_hash.0,
            &right_hash.0,
        ))
        .write(&mut cursor)
        .map_err(WasmIronfishError)?;

        Ok(cursor)
    }

    /// Returns undefined if the note was unable to be decrypted with the given key.
    #[wasm_bindgen(js_name = "decryptNoteForOwner")]
    pub fn decrypt_note_for_owner(&self, owner_hex_key: &str) -> Result<Option<WasmNote>, JsValue> {
        let owner_view_key = IncomingViewKey::from_hex(owner_hex_key).map_err(WasmIronfishError)?;
        Ok(match self.note.decrypt_note_for_owner(&owner_view_key) {
            Ok(n) => Some(WasmNote { note: { n } }),
            Err(_) => None,
        })
    }

    /// Returns undefined if the note was unable to be decrypted with the given key.
    #[wasm_bindgen(js_name = "decryptNoteForSpender")]
    pub fn decrypt_note_for_spender(
        &self,
        spender_hex_key: &str,
    ) -> Result<Option<WasmNote>, JsValue> {
        let spender_view_key =
            OutgoingViewKey::from_hex(spender_hex_key).map_err(WasmIronfishError)?;

        Ok(
            match self.note.decrypt_note_for_spender(&spender_view_key) {
                Ok(n) => Some(WasmNote { note: { n } }),
                Err(_) => None,
            },
        )
    }
}
