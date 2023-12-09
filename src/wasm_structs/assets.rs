use wasm_bindgen::prelude::*;

use crate::ironfish_rust::assets::asset_identifier::AssetIdentifier;

use super::WasmIronfishError;

pub const ASSET_ID_LENGTH: usize = 32;

#[wasm_bindgen]
pub struct WasmAssetIdentifier(Vec<u8>);

impl WasmAssetIdentifier {
    pub fn as_bytes(&self) -> &Vec<u8> {
        &self.0
    }
}

impl TryFrom<WasmAssetIdentifier> for AssetIdentifier {
    type Error = WasmIronfishError;
    fn try_from(asset_id: WasmAssetIdentifier) -> Result<Self, Self::Error> {
        let bytes = asset_id.as_bytes();
        let mut buffer = [0u8; ASSET_ID_LENGTH];
        buffer[12..].copy_from_slice(bytes);
        AssetIdentifier::new(buffer).map_err(WasmIronfishError)
    }
}
