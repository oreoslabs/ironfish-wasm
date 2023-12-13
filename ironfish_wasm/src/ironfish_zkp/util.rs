use group::{cofactor::CofactorGroup, Group, GroupEncoding};
use jubjub::{ExtendedPoint, SubgroupPoint};

use crate::ironfish_zkp::constants::VALUE_COMMITMENT_GENERATOR_PERSONALIZATION;

/// This is a lightly modified group_hash function, for use with the asset identifier/generator flow
#[allow(clippy::assertions_on_constants)]
pub fn asset_hash_to_point(tag: &[u8]) -> Option<jubjub::ExtendedPoint> {
    assert_eq!(VALUE_COMMITMENT_GENERATOR_PERSONALIZATION.len(), 8);

    // Check to see that scalar field is 255 bits
    // TODO:
    // assert!(blstrs::Scalar::NUM_BITS == 255);

    let h = blake2s_simd::Params::new()
        .hash_length(32)
        .personal(VALUE_COMMITMENT_GENERATOR_PERSONALIZATION)
        .to_state()
        .update(tag)
        .finalize();

    // let p = jubjub::ExtendedPoint::from_bytes(h.as_array());
    let p = jubjub::AffinePoint::from_bytes(*(h.as_array())).map(jubjub::ExtendedPoint::from);
    if p.is_some().into() {
        let p = p.unwrap();

        // <ExtendedPoint as CofactorGroup>::clear_cofactor is implemented using
        // ExtendedPoint::mul_by_cofactor in the jubjub crate.
        <ExtendedPoint as CofactorGroup>::clear_cofactor(&p);
        let prime = CofactorGroup::clear_cofactor(&p);

        if prime.is_identity().into() {
            None
        } else {
            // Return the original ExtendedPoint, not the cofactor-cleared one
            Some(p)
        }
    } else {
        None
    }
}
