use std::io;

use ff::PrimeField;

use super::errors::{IronfishError, IronfishErrorKind};

pub(crate) fn read_scalar<F: PrimeField, R: io::Read>(mut reader: R) -> Result<F, IronfishError> {
    let mut fr_repr = F::Repr::default();
    reader.read_exact(fr_repr.as_mut())?;

    Option::from(F::from_repr(fr_repr))
        .ok_or_else(|| IronfishError::new(IronfishErrorKind::InvalidData))
}

/// Output the hexadecimal String as bytes
pub fn hex_to_bytes<const SIZE: usize>(hex: &str) -> Result<[u8; SIZE], IronfishError> {
    if hex.len() != SIZE * 2 {
        return Err(IronfishError::new(IronfishErrorKind::InvalidData));
    }

    let mut bytes = [0; SIZE];

    let hex_iter = hex.as_bytes().chunks_exact(2);

    for (i, hex) in hex_iter.enumerate() {
        bytes[i] = hex_to_u8(hex[0])? << 4 | hex_to_u8(hex[1])?;
    }

    Ok(bytes)
}

#[inline]
fn hex_to_u8(char: u8) -> Result<u8, IronfishError> {
    match char {
        b'0'..=b'9' => Ok(char - b'0'),
        b'a'..=b'f' => Ok(char - b'a' + 10),
        b'A'..=b'F' => Ok(char - b'A' + 10),
        _ => Err(IronfishError::new(IronfishErrorKind::InvalidData)),
    }
}
