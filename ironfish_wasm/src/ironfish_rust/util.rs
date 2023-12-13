use std::cmp;

/// Helper function to create an array from a string. If the string is not as
/// large as the array, it will be filled with 0. If the string is too large, it
/// will only include up to the size of the array.
pub fn str_to_array<const SIZE: usize>(string: &str) -> [u8; SIZE] {
    let bytes = string.as_bytes();
    let num_to_copy = cmp::min(bytes.len(), SIZE);

    let mut arr = [0u8; SIZE];
    arr[..num_to_copy].copy_from_slice(&bytes[..num_to_copy]);

    arr
}
