use super::assets::WasmAssetIdentifier;
use super::{panic_hook, WasmIronfishError};
use ironfish_rust::note::Memo;
use ironfish_rust::{Note, ViewKey};
use wasm_bindgen::prelude::*;

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
        asset_id: WasmAssetIdentifier,
        sender: &str,
    ) -> Result<WasmNote, JsValue> {
        panic_hook::set_once();

        let owner_address =
            ironfish_rust::PublicAddress::from_hex(owner).map_err(WasmIronfishError)?;
        let asset_id = asset_id.try_into()?;
        let sender = ironfish_rust::PublicAddress::from_hex(sender).map_err(WasmIronfishError)?;
        Ok(WasmNote {
            note: Note::new(owner_address, value, Memo::from(memo), asset_id, sender),
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
