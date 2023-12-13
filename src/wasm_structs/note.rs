use super::{panic_hook, WasmIronfishError};
use ironfish_rust::{
    assets::asset::ID_LENGTH as ASSET_ID_LENGTH,
    keys::PUBLIC_ADDRESS_SIZE,
    note::{AMOUNT_VALUE_SIZE, MEMO_SIZE, SCALAR_SIZE},
    Note, ViewKey,
};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn get_public_address_length() -> u32 {
    PUBLIC_ADDRESS_SIZE as u32
}

#[wasm_bindgen]
pub fn get_randomness_length() -> u32 {
    SCALAR_SIZE as u32
}

#[wasm_bindgen]
pub fn get_memo_length() -> u32 {
    MEMO_SIZE as u32
}

#[wasm_bindgen]
pub fn get_amount_value_length() -> u32 {
    AMOUNT_VALUE_SIZE as u32
}

//  32 randomness
//+ 32 memo
//+ 32 public address
//+ 32 asset id
//+ 8  value
//+ 32 sender address
//= 168 bytes
#[wasm_bindgen]
pub fn get_decrypted_note_length() -> u32 {
    get_randomness_length()
        + get_memo_length()
        + ASSET_ID_LENGTH as u32
        + get_public_address_length()
        + get_amount_value_length()
        + get_public_address_length()
}

#[wasm_bindgen]
pub struct WasmNote {
    pub(crate) note: Note,
}

#[wasm_bindgen]
impl WasmNote {
    #[wasm_bindgen(constructor)]
    pub fn new(
        owner: &str,
        value: u64,
        memo: &str,
        asset_id: &[u8],
        sender: &str,
    ) -> Result<WasmNote, JsValue> {
        panic_hook::set_once();

        let owner_address =
            ironfish_rust::PublicAddress::from_hex(owner).map_err(WasmIronfishError)?;
        let sender = ironfish_rust::PublicAddress::from_hex(sender).map_err(WasmIronfishError)?;
        let mut asset_id_bytes = [0; ASSET_ID_LENGTH];
        asset_id_bytes.clone_from_slice(&asset_id[0..ASSET_ID_LENGTH]);
        let asset_id = asset_id_bytes.try_into().map_err(WasmIronfishError)?;
        Ok(WasmNote {
            note: Note::new(owner_address, value, memo, asset_id, sender),
        })
    }

    #[wasm_bindgen]
    pub fn deserialize(bytes: &[u8]) -> Result<WasmNote, JsValue> {
        panic_hook::set_once();

        let cursor: std::io::Cursor<&[u8]> = std::io::Cursor::new(bytes);
        let note = Note::read(cursor).map_err(WasmIronfishError)?;
        Ok(WasmNote { note })
    }

    #[wasm_bindgen]
    pub fn serialize(&self) -> Result<Vec<u8>, JsValue> {
        let mut cursor: std::io::Cursor<Vec<u8>> = std::io::Cursor::new(vec![]);
        self.note.write(&mut cursor).map_err(WasmIronfishError)?;
        Ok(cursor.into_inner())
    }

    /// The commitment hash of the note
    /// This hash is what gets used for the leaf nodes in a Merkle Tree.
    #[wasm_bindgen(getter)]
    pub fn hash(&self) -> Vec<u8> {
        self.note.commitment().to_vec()
    }

    /// Value this note represents.
    #[wasm_bindgen(getter)]
    pub fn value(&self) -> u64 {
        self.note.value()
    }

    /// Arbitrary note the spender can supply when constructing a spend so the
    /// receiver has some record from whence it came.
    /// Note: While this is encrypted with the output, it is not encoded into
    /// the proof in any way.
    #[wasm_bindgen(getter)]
    pub fn memo(&self) -> String {
        self.note.memo().to_string()
    }

    /// Asset identifier associated with this note
    #[wasm_bindgen(getter)]
    pub fn asset_id(&self) -> Vec<u8> {
        self.note.asset_id().as_bytes().to_vec()
    }

    /// Sender of the note
    #[wasm_bindgen(getter)]
    pub fn sender(&self) -> String {
        self.note.sender().hex_public_address()
    }

    /// Owner of the note
    #[wasm_bindgen(getter)]
    pub fn owner(&self) -> String {
        self.note.owner().hex_public_address()
    }

    /// Compute the nullifier for this note, given the view key of its owner.
    ///
    /// The nullifier is a series of bytes that is published by the note owner
    /// only at the time the note is spent. This key is collected in a massive
    /// 'nullifier set', preventing double-spend.
    #[wasm_bindgen]
    pub fn nullifier(&self, owner_view_key: &str, position: u64) -> Result<Vec<u8>, JsValue> {
        let view_key = ViewKey::from_hex(owner_view_key).map_err(WasmIronfishError)?;
        Ok(self.note.nullifier(&view_key, position).to_vec())
    }
}
