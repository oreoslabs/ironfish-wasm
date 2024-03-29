/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use ironfish_rust::merkle_note::NOTE_ENCRYPTION_KEY_SIZE;
use ironfish_rust::note::ENCRYPTED_NOTE_SIZE;
use ironfish_rust::serializing::aead::MAC_SIZE;
use ironfish_rust::IncomingViewKey;
use ironfish_rust::MerkleNote;
use ironfish_rust::MerkleNoteHash;
use ironfish_rust::OutgoingViewKey;
use wasm_bindgen::prelude::*;

use super::{panic_hook, WasmIronfishError, WasmNote};

#[wasm_bindgen]
pub fn get_note_encryption_key_length() -> u32 {
    NOTE_ENCRYPTION_KEY_SIZE as u32
}

#[wasm_bindgen]
pub fn get_mac_length() -> u32 {
    MAC_SIZE as u32
}

#[wasm_bindgen]
pub fn get_encrypted_note_plaintext_length() -> u32 {
    ENCRYPTED_NOTE_SIZE as u32 + get_mac_length()
}

#[wasm_bindgen]
pub fn get_encrypted_note_length() -> u32 {
    get_note_encryption_key_length() + get_encrypted_note_plaintext_length() + 96
}

#[wasm_bindgen]
pub struct WasmNoteEncrypted {
    pub(crate) note: MerkleNote,
}

#[wasm_bindgen]
impl WasmNoteEncrypted {
    #[wasm_bindgen(constructor)]
    pub fn new(bytes: &[u8]) -> Result<WasmNoteEncrypted, JsValue> {
        panic_hook::set_once();

        let mut cursor: std::io::Cursor<&[u8]> = std::io::Cursor::new(bytes);
        let note = MerkleNote::read(&mut cursor).map_err(WasmIronfishError)?;
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

#[cfg(test)]
mod tests {
    use ironfish_rust::assets::asset_identifier::AssetIdentifier;
    use ironfish_rust::keys::EphemeralKeyPair;
    use ironfish_zkp::primitives::ValueCommitment;
    use rand::{thread_rng, Rng};

    use super::*;
    use ironfish_rust::merkle_note::MerkleNote;
    use ironfish_rust::note::Memo;
    use ironfish_rust::Note;
    use ironfish_rust::SaplingKey;

    #[test]
    fn test_merkle_notes_are_equal() {
        let spender_key: SaplingKey = SaplingKey::generate_key();
        let receiver_key: SaplingKey = SaplingKey::generate_key();
        let sender = spender_key.public_address();
        let owner = receiver_key.public_address();
        let asset_id = AssetIdentifier::new([1; 32]).unwrap();
        let note = Note::new(owner.clone(), 42, Memo([0; 32]), asset_id, sender);
        let diffie_hellman_keys = EphemeralKeyPair::new();

        let mut buffer = [0u8; 64];
        thread_rng().fill(&mut buffer[..]);

        let value_commitment_randomness: jubjub::Fr = jubjub::Fr::from_bytes_wide(&buffer);

        let value_commitment = ValueCommitment {
            value: note.value(),
            randomness: value_commitment_randomness,
            asset_generator: asset_id.asset_generator(),
        };

        let merkle_note =
            MerkleNote::new(&spender_key, &note, &value_commitment, &diffie_hellman_keys);

        let mut cursor: std::io::Cursor<Vec<u8>> = std::io::Cursor::new(vec![]);
        merkle_note.write(&mut cursor).unwrap();

        let vec = cursor.into_inner();
        let wasm1 = WasmNoteEncrypted::new(&vec).unwrap();
        let wasm2 = WasmNoteEncrypted::new(&vec).unwrap();
        assert!(wasm1.equals(&wasm2))
    }

    #[test]
    fn test_can_combine_merkle_note_hashes() {
        let arr: [u8; 32] = Default::default();
        let combined_hash = WasmNoteEncrypted::combine_hash(1, &arr, &arr).unwrap();

        let expected = &[
            78, 74, 99, 96, 68, 196, 78, 82, 234, 152, 143, 34, 78, 141, 112, 9, 118, 118, 97, 40,
            219, 166, 197, 144, 93, 94, 133, 118, 88, 127, 57, 32,
        ];
        assert_eq!(&combined_hash, &expected)
    }
}
