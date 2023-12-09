use std::fmt;

use crate::ironfish_zkp::constants::ASSET_ID_LENGTH;

use super::{keys::public_address::PUBLIC_ADDRESS_SIZE, util::str_to_array};

pub const ENCRYPTED_NOTE_SIZE: usize =
    SCALAR_SIZE + MEMO_SIZE + AMOUNT_VALUE_SIZE + ASSET_ID_LENGTH + PUBLIC_ADDRESS_SIZE;
//   8  value
// + 32 randomness
// + 32 asset id
// + 32 memo
// + 32 sender address
// = 136
pub const SCALAR_SIZE: usize = 32;
pub const MEMO_SIZE: usize = 32;
pub const AMOUNT_VALUE_SIZE: usize = 8;

/// Memo field on a Note. Used to encode transaction IDs or other information
/// about the transaction.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct Memo(pub [u8; MEMO_SIZE]);

impl From<&str> for Memo {
    fn from(string: &str) -> Self {
        let memo_bytes = str_to_array(string);
        Memo(memo_bytes)
    }
}

impl From<String> for Memo {
    fn from(string: String) -> Self {
        Memo::from(string.as_str())
    }
}

impl fmt::Display for Memo {
    /// This can be lossy because it assumes that the
    /// memo is in valid UTF-8 format.
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{}", String::from_utf8_lossy(&self.0))
    }
}
