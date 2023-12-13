use ironfish_rust::{
    assets::{
        asset::{
            Asset, ASSET_LENGTH as SERIALIZED_ASSET_LENGTH, ID_LENGTH, METADATA_LENGTH, NAME_LENGTH,
        },
        asset_identifier::NATIVE_ASSET,
    },
    PublicAddress,
};

use wasm_bindgen::prelude::*;

use super::WasmIronfishError;

#[wasm_bindgen]
pub fn get_asset_id_length() -> u32 {
    ID_LENGTH as u32
}

#[wasm_bindgen]
pub fn get_asset_metadata_length() -> u32 {
    METADATA_LENGTH as u32
}

#[wasm_bindgen]
pub fn get_asset_name_length() -> u32 {
    NAME_LENGTH as u32
}

#[wasm_bindgen]
pub fn get_asset_length() -> u32 {
    SERIALIZED_ASSET_LENGTH as u32
}

#[wasm_bindgen]
pub struct WasmAsset {
    pub(crate) asset: Asset,
}

#[wasm_bindgen]
impl WasmAsset {
    #[wasm_bindgen(constructor)]
    pub fn new(
        creator_public_address: String,
        name: String,
        metadata: String,
    ) -> Result<WasmAsset, JsValue> {
        let public_address =
            PublicAddress::from_hex(&creator_public_address).map_err(WasmIronfishError)?;

        Ok(WasmAsset {
            asset: Asset::new(public_address, &name, &metadata).map_err(WasmIronfishError)?,
        })
    }

    #[wasm_bindgen]
    pub fn metadata(&self) -> Vec<u8> {
        self.asset.metadata().to_vec()
    }

    #[wasm_bindgen]
    pub fn name(&self) -> Vec<u8> {
        self.asset.name().to_vec()
    }

    #[wasm_bindgen]
    pub fn nonce(&self) -> u8 {
        self.asset.nonce()
    }

    #[wasm_bindgen]
    pub fn creator(&self) -> Vec<u8> {
        self.asset.creator().to_vec()
    }

    #[wasm_bindgen]
    pub fn native_id() -> Vec<u8> {
        NATIVE_ASSET.as_bytes().to_vec()
    }

    #[wasm_bindgen]
    pub fn id(&self) -> Vec<u8> {
        self.asset.id().as_bytes().to_vec()
    }

    #[wasm_bindgen]
    pub fn serialize(&self) -> Result<Vec<u8>, JsValue> {
        let mut cursor: std::io::Cursor<Vec<u8>> = std::io::Cursor::new(vec![]);
        self.asset.write(&mut cursor).map_err(WasmIronfishError)?;

        Ok(cursor.into_inner())
    }

    #[wasm_bindgen]
    pub fn deserialize(bytes: &[u8]) -> Result<WasmAsset, JsValue> {
        let mut cursor: std::io::Cursor<&[u8]> = std::io::Cursor::new(bytes);
        let asset = Asset::read(&mut cursor).map_err(WasmIronfishError)?;

        Ok(WasmAsset { asset })
    }
}
// pub const ASSET_ID_LENGTH: usize = 32;

// #[wasm_bindgen]
// pub struct WasmAssetIdentifier(Vec<u8>);

// impl WasmAssetIdentifier {
//     pub fn as_bytes(&self) -> &Vec<u8> {
//         &self.0
//     }
// }

// impl TryFrom<WasmAssetIdentifier> for AssetIdentifier {
//     type Error = WasmIronfishError;
//     fn try_from(asset_id: WasmAssetIdentifier) -> Result<Self, Self::Error> {
//         let bytes = asset_id.as_bytes();
//         let mut buffer = [0u8; ASSET_ID_LENGTH];
//         buffer[12..].copy_from_slice(bytes);
//         AssetIdentifier::new(buffer).map_err(WasmIronfishError)
//     }
// }
