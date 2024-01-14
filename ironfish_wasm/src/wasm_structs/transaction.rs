/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use super::get_encrypted_note_length;
use super::WasmAsset;
use super::WasmEphemeralKeyPair;
use super::WasmProof;
use ironfish_rust::assets::asset_identifier::AssetIdentifier;
use ironfish_rust::keys::EphemeralKeyPair;
use ironfish_rust::transaction::outputs::PROOF_SIZE;
use ironfish_rust::transaction::TransactionVersion;
use ironfish_rust::transaction::TRANSACTION_EXPIRATION_SIZE;
use ironfish_rust::transaction::TRANSACTION_FEE_SIZE;
use ironfish_rust::transaction::TRANSACTION_PUBLIC_KEY_SIZE;
use ironfish_rust::transaction::TRANSACTION_SIGNATURE_SIZE;
use wasm_bindgen::prelude::*;
use js_sys::Uint8Array;

use ironfish_rust::{ProposedTransaction, PublicAddress, SaplingKey, Transaction};

use super::errors::*;
use super::note::WasmNote;
use super::panic_hook;
use super::witness::{JsWitness, JsWitness1};
use super::WasmSpendDescription;

#[wasm_bindgen]
pub fn get_proof_length() -> u32 {
    PROOF_SIZE
}

#[wasm_bindgen]
pub fn get_transaction_signature_length() -> u32 {
    TRANSACTION_SIGNATURE_SIZE as u32
}

#[wasm_bindgen]
pub fn get_transaction_public_key_randomness_length() -> u32 {
    TRANSACTION_PUBLIC_KEY_SIZE as u32
}

#[wasm_bindgen]
pub fn get_transaction_expiration_length() -> u32 {
    TRANSACTION_EXPIRATION_SIZE as u32
}

#[wasm_bindgen]
pub fn get_transaction_fee_length() -> u32 {
    TRANSACTION_FEE_SIZE as u32
}

#[wasm_bindgen]
pub fn get_latest_transaction_version() -> u8 {
    TransactionVersion::latest() as u8
}

#[wasm_bindgen]
pub struct TransactionCircuits {
    spend_circuits: Vec<Vec<u8>>,
    output_circuits: Vec<Vec<u8>>,
    output_diffie_hellman_keys: Vec<Vec<u8>>,
    mint_asset_circuits: Vec<Vec<u8>>,
}

#[wasm_bindgen]
impl TransactionCircuits {
    #[wasm_bindgen(getter, js_name = "spendCircuits")]
    pub fn spend_circuits(&self) -> Vec<Uint8Array> {
        self.spend_circuits.iter()
        .map(|vec| Uint8Array::from(&vec[..]))
        .collect()
    }

    #[wasm_bindgen(getter, js_name = "outputCircuits")]
    pub fn output_circuits(&self) -> Vec<Uint8Array> {
        self.output_circuits.iter()
        .map(|vec| Uint8Array::from(&vec[..]))
        .collect()
    }

    #[wasm_bindgen(getter, js_name = "mintCircuits")]
    pub fn mint_circuits(&self) -> Vec<Uint8Array> {
        self.mint_asset_circuits.iter()
        .map(|vec| Uint8Array::from(&vec[..]))
        .collect()
    }

    #[wasm_bindgen(getter, js_name = "hellmanKeys")]
    pub fn output_diffie_hellman_keys(&self) -> Vec<Uint8Array> {
        self.output_diffie_hellman_keys.iter()
        .map(|vec| Uint8Array::from(&vec[..]))
        .collect()
    }
}

#[wasm_bindgen]
pub struct WasmTransactionPosted {
    transaction: Transaction,
}

#[wasm_bindgen]
impl WasmTransactionPosted {
    #[wasm_bindgen(constructor)]
    pub fn new(bytes: &[u8]) -> Result<WasmTransactionPosted, JsValue> {
        panic_hook::set_once();

        let mut cursor: std::io::Cursor<&[u8]> = std::io::Cursor::new(bytes);
        let transaction = Transaction::read(&mut cursor).map_err(WasmIronfishError)?;
        Ok(WasmTransactionPosted { transaction })
    }

    #[wasm_bindgen]
    pub fn serialize(&self) -> Result<Vec<u8>, JsValue> {
        let mut cursor: std::io::Cursor<Vec<u8>> = std::io::Cursor::new(vec![]);
        self.transaction
            .write(&mut cursor)
            .map_err(WasmIronfishError)?;
        Ok(cursor.into_inner())
    }

    #[wasm_bindgen(getter, js_name = "notesLength")]
    pub fn notes_length(&self) -> usize {
        self.transaction.outputs().len()
    }

    #[wasm_bindgen(js_name = "getNote")]
    pub fn get_note(&self, index: usize) -> Result<Vec<u8>, JsValue> {
        let description = &self.transaction.outputs()[index];
        // Note bytes are 275
        let mut cursor: Vec<u8> = Vec::with_capacity(get_encrypted_note_length() as usize);
        description
            .merkle_note()
            .write(&mut cursor)
            .map_err(WasmIronfishError)?;
        Ok(cursor)
    }

    #[wasm_bindgen(getter, js_name = "spendsLength")]
    pub fn spends_length(&self) -> usize {
        self.transaction.spends().len()
    }

    #[wasm_bindgen(js_name = "getSpend")]
    pub fn get_spend(&self, index: usize) -> WasmSpendDescription {
        let description = &self.transaction.spends()[index];
        WasmSpendDescription {
            description: description.clone(),
        }
    }

    #[wasm_bindgen(getter, js_name = "fee")]
    pub fn fee(&self) -> i64 {
        self.transaction.fee()
    }

    #[wasm_bindgen(getter, js_name = "transactionSignature")]
    pub fn transaction_signature(&self) -> Result<Vec<u8>, JsValue> {
        let mut serialized_signature = vec![];
        self.transaction
            .binding_signature()
            .write(&mut serialized_signature)
            .map_err(WasmIoError)?;
        Ok(serialized_signature)
    }

    #[wasm_bindgen(getter, js_name = "hash")]
    pub fn hash(&self) -> Result<Vec<u8>, JsValue> {
        let hash = self
            .transaction
            .transaction_signature_hash()
            .map_err(WasmIronfishError)?;
        Ok(hash.to_vec())
    }

    #[wasm_bindgen(getter, js_name = "expirationSequence")]
    pub fn expiration_sequence(&self) -> u32 {
        self.transaction.expiration()
    }

    pub fn to_hex(&self) -> Result<String, JsValue> {
        let mut vec: Vec<u8> = vec![];
        self.transaction.write(&mut vec).map_err(|e| e.to_string())?;
        let signed_transaction = hex::encode(vec);
        Ok(signed_transaction)
    }
}

#[wasm_bindgen]
pub struct WasmTransaction {
    transaction: ProposedTransaction,
}

#[wasm_bindgen]
impl WasmTransaction {
    #[wasm_bindgen(constructor)]
    pub fn new(spender_hex_key: String, version: u8) -> Result<WasmTransaction, JsValue> {
        panic_hook::set_once();

        let spender_key = SaplingKey::from_hex(&spender_hex_key).map_err(WasmIronfishError)?;
        let tx_version = version.try_into().map_err(WasmIronfishError)?;
        let transaction = ProposedTransaction::new(spender_key, tx_version);

        Ok(WasmTransaction { transaction })
    }

    /// Create a proof of a new note owned by the recipient in this transaction.
    #[wasm_bindgen]
    pub fn output(&mut self, note: &WasmNote) -> Result<String, JsValue> {
        self.transaction
            .add_output(note.note.clone())
            .map_err(WasmIronfishError)?;
        Ok("".to_string())
    }

    /// Spend the note owned by spender_hex_key at the given witness location.
    #[wasm_bindgen]
    pub fn spend(&mut self, note: &WasmNote, witness: JsWitness) -> Result<String, JsValue> {
        let witness = JsWitness1 { obj: witness };
        // println!("spend: {:?}", witness);
        self.transaction
            .add_spend(note.note.clone(), &witness)
            .map_err(WasmIronfishError)?;
        Ok("".to_string())
    }

    /// Mint a new asset with a given value as part of this transaction.
    #[wasm_bindgen]
    pub fn mint(
        &mut self,
        asset: &WasmAsset,
        value: u64,
        transfer_ownership_to: Option<String>,
    ) -> Result<String, JsValue> {
        match transfer_ownership_to {
            None => self
                .transaction
                .add_mint(asset.asset, value)
                .map_err(WasmIronfishError)?,
            Some(new_owner) => {
                let new_owner = PublicAddress::from_hex(&new_owner).map_err(WasmIronfishError)?;
                self.transaction
                    .add_mint_with_new_owner(asset.asset, value, new_owner)
                    .map_err(WasmIronfishError)?;
            }
        }

        Ok("".to_string())
    }

    /// Burn some supply of a given asset and value as part of this transaction.
    #[wasm_bindgen]
    pub fn burn(&mut self, asset_id_bytes: &[u8], value: u64) -> Result<String, JsValue> {
        let asset_id =
            AssetIdentifier::new(asset_id_bytes.try_into().unwrap()).map_err(WasmIronfishError)?;
        self.transaction
            .add_burn(asset_id, value)
            .map_err(WasmIronfishError)?;

        Ok("".to_string())
    }

    /// Special case for posting a miners fee transaction. Miner fee transactions
    /// are unique in that they generate currency. They do not have any spends
    /// or change and therefore have a negative transaction fee. In normal use,
    /// a miner would not accept such a transaction unless it was explicitly set
    /// as the miners fee.
    #[wasm_bindgen]
    pub fn post_miners_fee(&mut self) -> Result<WasmTransactionPosted, JsValue> {
        let transaction = self
            .transaction
            .post_miners_fee()
            .map_err(WasmIronfishError)?;
        Ok(WasmTransactionPosted { transaction })
    }

    /// Post the transaction. This performs a bit of validation, and signs
    /// the spends with a signature that proves the spends are part of this
    /// transaction.
    ///
    /// Transaction fee is the amount the spender wants to send to the miner
    /// for mining this transaction. This has to be non-negative; sane miners
    /// wouldn't accept a transaction that takes money away from them.
    ///
    /// sum(spends) - sum(outputs) - intended_transaction_fee - change = 0
    /// aka: self.transaction_fee - intended_transaction_fee - change = 0
    #[wasm_bindgen]
    pub fn post(
        &mut self,
        change_goes_to: Option<String>,
        intended_transaction_fee: u64,
    ) -> Result<WasmTransactionPosted, JsValue> {
        let change_key = match change_goes_to {
            Some(s) => Some(PublicAddress::from_hex(&s).map_err(WasmIronfishError)?),
            None => None,
        };

        let posted_transaction = self
            .transaction
            .post(change_key, intended_transaction_fee)
            .map_err(WasmIronfishError)?;

        Ok(WasmTransactionPosted {
            transaction: posted_transaction,
        })
    }

    #[wasm_bindgen]
    pub fn post_wasm(
        &mut self,
        spend_proofs: Vec<WasmProof>,
        output_proofs: Vec<WasmProof>,
        output_diffie_hellman_keys: Vec<WasmEphemeralKeyPair>,
        mint_asset_proofs: Vec<WasmProof>,
    ) -> Result<WasmTransactionPosted, JsValue> {
        let spend_proofs = spend_proofs
            .iter()
            .map(|proof| proof.proof.clone())
            .collect();
        let output_proofs = output_proofs
            .iter()
            .map(|proof| proof.proof.clone())
            .collect();
        let key_pairs = output_diffie_hellman_keys
            .iter()
            .map(|key_pair| EphemeralKeyPair::from_bytes_le(key_pair.key_pair_bytes.clone()))
            .collect();
        let mint_asset_proofs = mint_asset_proofs
            .iter()
            .map(|proof| proof.proof.clone())
            .collect();
        let posted_transaction = self
            .transaction
            .post_wasm(spend_proofs, output_proofs, key_pairs, mint_asset_proofs)
            .map_err(WasmIronfishError)?;

        Ok(WasmTransactionPosted {
            transaction: posted_transaction,
        })
    }

    #[wasm_bindgen]
    pub fn build_circuits(
        &mut self,
        change_goes_to: Option<String>,
        intended_transaction_fee: u64,
    ) -> Result<TransactionCircuits, JsValue> {
        let change_key = match change_goes_to {
            Some(s) => Some(PublicAddress::from_hex(&s).map_err(WasmIronfishError)?),
            None => None,
        };

        let (spend_circuits, output_circuits, output_diffie_hellman_keys, mint_circuits) = self
            .transaction
            .build_circuits(change_key, intended_transaction_fee)
            .map_err(WasmIronfishError)?;
        let spend_circuits: Vec<Vec<u8>> = spend_circuits
            .iter()
            .map(|spend| {
                let mut spend_bytes = vec![];
                spend.write(&mut spend_bytes).unwrap();
                spend_bytes
            })
            .collect();
        let output_circuits: Vec<Vec<u8>> = output_circuits
            .iter()
            .map(|output| {
                let mut output_bytes = vec![];
                output.write(&mut output_bytes).unwrap();
                output_bytes
            })
            .collect();
        let output_diffie_hellman_keys: Vec<Vec<u8>> = output_diffie_hellman_keys
            .iter()
            .map(|keys| keys.to_bytes_le())
            .collect();
        let mint_asset_circuits: Vec<Vec<u8>> = mint_circuits
            .iter()
            .map(|mint_asset| {
                let mut mint_asset_bytes = vec![];
                mint_asset.write(&mut mint_asset_bytes).unwrap();
                mint_asset_bytes
            })
            .collect();
        Ok(TransactionCircuits {
            spend_circuits,
            output_circuits,
            output_diffie_hellman_keys,
            mint_asset_circuits,
        })
    }

    #[wasm_bindgen(js_name = "setExpirationSequence")]
    pub fn set_expiration_sequence(&mut self, expiration_sequence: u32) {
        self.transaction.set_expiration(expiration_sequence);
    }
}
