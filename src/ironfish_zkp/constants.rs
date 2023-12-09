/// Length in bytes of the asset identifier
pub const ASSET_ID_LENGTH: usize = 32;

/// BLAKE2s personalization for the value commitment generator for the value
pub const VALUE_COMMITMENT_GENERATOR_PERSONALIZATION: &[u8; 8] = b"ironf_cv";
