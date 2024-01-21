## Accounts

This is a Rust wrapper for creating accounts and transactions to be converted into WASM.

### To Compile WASM

```
npm run build
```

This will generate a `ironfish_wasm/pkg` folder that you can import in js files elsewhere in the repository with the following (choose either as appropriate):

```
  import init, {
  generateKey,
  initialize_sapling,
  WasmNoteEncrypted,
  WasmTransaction,
  WasmNote,
  WasmProof,
  WasmEphemeralKeyPair,
} from "ironfish_wasm";
```
