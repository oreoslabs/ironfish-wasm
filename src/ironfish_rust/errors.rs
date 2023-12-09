use std::{
    backtrace::{Backtrace, BacktraceStatus},
    error::Error,
    fmt, io, num, string,
};

#[derive(Debug)]
pub struct IronfishError {
    pub kind: IronfishErrorKind,
    pub source: Option<Box<dyn Error>>,
    pub backtrace: Backtrace,
}

#[derive(Debug)]
pub enum IronfishErrorKind {
    BellpersonSynthesis,
    CryptoBox,
    IllegalValue,
    InconsistentWitness,
    InvalidAssetIdentifier,
    InvalidAuthorizingKey,
    InvalidBalance,
    InvalidCommitment,
    InvalidData,
    InvalidDecryptionKey,
    InvalidDiversificationPoint,
    InvalidEntropy,
    InvalidLanguageEncoding,
    InvalidMinersFeeTransaction,
    InvalidMintProof,
    InvalidMintSignature,
    InvalidMnemonicString,
    InvalidNonceLength,
    InvalidNullifierDerivingKey,
    InvalidOutputProof,
    InvalidPaymentAddress,
    InvalidPublicAddress,
    InvalidSignature,
    InvalidSigningKey,
    InvalidSpendProof,
    InvalidSpendSignature,
    InvalidTransaction,
    InvalidTransactionVersion,
    InvalidViewingKey,
    InvalidWord,
    Io,
    IsSmallOrder,
    RandomnessError,
    TryFromInt,
    Utf8,
}

impl IronfishError {
    pub fn new(kind: IronfishErrorKind) -> Self {
        Self {
            kind,
            source: None,
            backtrace: Backtrace::capture(),
        }
    }

    pub fn new_with_source<E>(kind: IronfishErrorKind, source: E) -> Self
    where
        E: Into<Box<dyn Error>>,
    {
        Self {
            kind,
            source: Some(source.into()),
            backtrace: Backtrace::capture(),
        }
    }
}

impl Error for IronfishError {}

impl fmt::Display for IronfishError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        let has_backtrace = self.backtrace.status() == BacktraceStatus::Captured;
        write!(f, "{:?}", self.kind)?;
        if let Some(source) = &self.source {
            write!(f, "\nCaused by: \n{}", source)?;
        }
        if has_backtrace {
            write!(f, "\nBacktrace:\n{:2}", self.backtrace)
        } else {
            write!(f, "\nTo enable Rust backtraces, use RUST_BACKTRACE=1")
        }
    }
}

impl From<io::Error> for IronfishError {
    fn from(e: io::Error) -> IronfishError {
        IronfishError::new_with_source(IronfishErrorKind::Io, e)
    }
}

impl From<string::FromUtf8Error> for IronfishError {
    fn from(e: string::FromUtf8Error) -> IronfishError {
        IronfishError::new_with_source(IronfishErrorKind::Utf8, e)
    }
}

impl From<num::TryFromIntError> for IronfishError {
    fn from(e: num::TryFromIntError) -> IronfishError {
        IronfishError::new_with_source(IronfishErrorKind::TryFromInt, e)
    }
}
