import init, {
  generateKey,
  initialize_sapling,
  WasmNoteEncrypted,
  WasmTransaction,
  WasmNote,
} from "ironfish_wasm";
import { Buffer } from "buffer";
import * as bufio from "bufio";

export const AMOUNT_VALUE_SIZE = 8;
export const AMOUNT_VALUE_LENGTH = AMOUNT_VALUE_SIZE;
export const NAME_LENGTH = 32;
export const METADATA_LENGTH = 96;
export const PUBLIC_ADDRESS_SIZE = 32;
export const ASSET_LENGTH =
  NAME_LENGTH + PUBLIC_ADDRESS_SIZE + METADATA_LENGTH + 1;
export const TRANSACTION_VERSION = 1;
export const TRANSACTION_SIGNATURE_SIZE = 64;
export const TRANSACTION_PUBLIC_KEY_SIZE = 32;
export const TRANSACTION_EXPIRATION_SIZE = 4;
export const TRANSACTION_EXPIRATION_LENGTH = TRANSACTION_EXPIRATION_SIZE;
export const TRANSACTION_FEE_SIZE = 8;
export const TRANSACTION_FEE_LENGTH = TRANSACTION_FEE_SIZE;
export const ASSET_ID_LENGTH = 32;
export const SPEND_SERIALIZED_SIZE_IN_BYTE = 388;
export const PROOF_LENGTH = 192;
export const ENCRYPTED_SHARED_KEY_SIZE = 64;
export const MAC_SIZE = 16;
export const MAC_LENGTH = MAC_SIZE;
export const NOTE_ENCRYPTION_KEY_LENGTH = ENCRYPTED_SHARED_KEY_SIZE + MAC_SIZE;
export const SCALAR_SIZE = 32;
export const MEMO_SIZE = 32;
export const ENCRYPTED_NOTE_SIZE =
  SCALAR_SIZE +
  MEMO_SIZE +
  AMOUNT_VALUE_SIZE +
  ASSET_ID_LENGTH +
  PUBLIC_ADDRESS_SIZE;
export const ENCRYPTED_NOTE_PLAINTEXT_LENGTH = ENCRYPTED_NOTE_SIZE + MAC_LENGTH;
export const ENCRYPTED_NOTE_LENGTH =
  NOTE_ENCRYPTION_KEY_LENGTH + ENCRYPTED_NOTE_PLAINTEXT_LENGTH + 96;
export const NOTE_ENCRYPTED_SERIALIZED_SIZE_IN_BYTE =
  PROOF_LENGTH + ENCRYPTED_NOTE_LENGTH;
export const IRONFISH_ASSET_ID =
  "51f33a2f14f92735e562dc658a5639279ddca3d5079a6d1242b2a588a9cbf44c";
export const IRONFISH_MAX_UTXO_COUNT = 10;

const Side = {
  Left: "Left",
  Right: "Right",
};

export class RawTransaction {
  expiration = null;
  fee = "0";
  mints = [];
  burns = [];
  outputs = [];

  spends = [];

  size() {
    let size = 0;
    size += 8; // spends length
    size += 8; // notes length
    size += 8; // fee
    size += 4; // expiration
    size += 64; // signature
    size += this.outputs.length * NOTE_ENCRYPTED_SERIALIZED_SIZE_IN_BYTE;
    size += this.mints.length * (ASSET_LENGTH + 8);
    size += this.burns.length * (ASSET_ID_LENGTH + 8);
    size += this.spends.length * SPEND_SERIALIZED_SIZE_IN_BYTE;
    return size;
  }

  static deserialize(buffer) {
    const reader = bufio.read(buffer, true);

    const raw = new RawTransaction();
    const version = reader.readU8();
    raw.version = version;
    raw.fee = reader.readBigU64().toString();

    const spendsLength = reader.readU64();
    for (let i = 0; i < spendsLength; i++) {
      const note = reader.readVarBytes();
      const treeSize = reader.readU64();
      const rootHash = reader.readVarBytes();
      const authPathLength = reader.readU64();
      const authPath = [];
      for (let j = 0; j < authPathLength; j++) {
        const side = reader.readU8() ? Side.Right : Side.Left;
        const hashOfSibling = reader.readVarBytes();
        authPath.push({ side, hashOfSibling: hashOfSibling.toString("hex") });
      }

      const witness = {
        treeSize,
        rootHash: rootHash.toString("hex"),
        authPath,
      };

      raw.spends.push({ note: note.toString("hex"), witness });
    }

    const outputsLength = reader.readU64();
    for (let i = 0; i < outputsLength; i++) {
      const note = reader.readVarBytes();
      raw.outputs.push({ note: note.toString("hex") });
    }

    const mintsLength = reader.readU64();
    for (let i = 0; i < mintsLength; i++) {
      const name = reader.readVarString("utf8");
      const metadata = reader.readVarString("utf8");
      const value = reader.readBigU64().toString();
      raw.mints.push({ name, metadata, value });
    }

    const burnsLength = reader.readU64();
    for (let i = 0; i < burnsLength; i++) {
      const assetId = reader.readBytes(ASSET_ID_LENGTH).toString("hex");
      const value = reader.readBigU64().toString();
      raw.burns.push({ assetId, value });
    }

    const hasExpiration = reader.readU8();
    if (hasExpiration) {
      raw.expiration = reader.readU32();
    }

    return raw;
  }
}

function areEqualUint8Array(a, b) {
  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }

  return true;
}

class Witness {
  constructor(data) {
    this.data = data;
    this._authPath = data.authPath.map((item) => {
      const { side, hashOfSibling } = item;
      return {
        side: () => side,
        hashOfSibling: () => new Uint8Array(Buffer.from(hashOfSibling, "hex")),
      };
    });
    this._treeSize = data.treeSize;
    this._rootHash = new Uint8Array(Buffer.from(data.rootHash, "hex"));
  }

  verify(myHash) {
    let currentHash = myHash;
    for (let i = 0; i < this._authPath.length; i++) {
      const node = this._authPath[i];
      if (node.side() === Side.Left) {
        currentHash = WasmNoteEncrypted.combineHash(
          i,
          currentHash,
          node.hashOfSibling()
        );
      } else {
        currentHash = WasmNoteEncrypted.combineHash(
          i,
          node.hashOfSibling(),
          currentHash
        );
      }
    }
    return areEqualUint8Array(currentHash, this._rootHash);
  }

  authPath() {
    return [...this._authPath];
  }
  treeSize() {
    return this._treeSize;
  }
  serializeRootHash() {
    return this._rootHash;
  }
}

async function main() {
  const wasm = await init();
  console.log("===> wasm: ", wasm.__wbindgen_add_to_stack_pointer, wasm);
  const pk = generateKey();
  console.log("pk ", pk.spending_key);
  const start = performance.now();
  initialize_sapling();
  console.log("after initializes_sapling ", performance.now() - start);

  const serialzeTx =
    "0101000000000000000100000000000000a8d63ba13d7c35caf942c64d5139b948b885ec931977a3f248c13e7f3c1bd0aa6451f33a2f14f92735e562dc658a5639279ddca3d5079a6d1242b2a588a9cbf44c40420f0000000000d53b538751fab6d3091a66251a35b2d3d7f4c008486874f5fe4cb6cd5e5edc0c0000000000000000000000000000000000000000000000000000000000000000a4e01d2e01a0a9e4c1da27644b58262576f54ece66b2cb18521720d5a75ac4de69f28300000000002079adb8b50eb4671026ce9ae6ffc27031a61849f5846d46f263d707c3a8b3af632000000000000000002026b1dfbc93372d3de4b9f49b5a9b0abe320f0aa99da33e5e6443712fde284837012096851e938603d2dde1018a72bb140e7f78702b009eee4e981ed2e4487b1aea5c0020b1e9acc3103ea00eaaaa3b7cbe130c2306a2b1242336f84e7bcfd3ef1c502a4f00205386e708dba74a18dd33ae313aa3bf429ad3d2375bac64051a7230abbfa1f8070020683271a6892b358bf062383678724e6206ff565e40d812be6694a509f5f4e35a0020b997b1de33883c3e6b3d8fdcb817b42e08a5311405b3517b69bdb3d92ad504320020dd50fb6fd46edcc62248d765ef72783af8157f8c8b01767de24d99deaf7e7d04002040830535dbab047122c67cf34ab308c131ca89dd4704d15c814260b65e990e0a0020fdb260c630fdb9629a5ad2c1f663552c5b82508b2e6f519cf78c77e22191b761002058268072e2f19d8467a60cab74b6a2e9da0521ebc190d7b924d10933909e910e00209df46496fc7a9ef3c1efc020b30850ad66102bbe0df7d474e7eebfe67962cb380020e2987e5e165e8fb3bad4603747482ec7edc541c00ffca677942238fa0a4eac20012077052351b70b5b73d142072512b5a13a2d84040e7ef2386c422795bc39b86c680120d6de0756da61b7d213b4bbd54e49b098dbfa7b7902bf3cc9cca89d164c35985c0120ed6de3915e9423d082157dca1a7d46d92416b55fd3b0b484b10802b1848c286a0120ba778c895a5f9f60ebbb3ffc57877e500c4a3f719a7665dff93df7515c64b14c012060ab349350ad84e1359f1b5a35a27a6463d867156b0f1f598a96825e06e0286001205837b6ec9e6749fae99a1d9e68d85901f4ae7de18d653f62025a5d3d840b431300202099d064f4b837a9ab773e964e0241e18cda7fd92c5c45d1d3bac221b3b4851400208d961084031a92bfbd8bfbbf3756ac9f60e944fe4d45f237ea9368fccf644d510020573187393b89d840705433f6263b7c07a9273c7164de6d81ec5ad1c9a4ed9b54002063b46fbe0abeafeb7f3da471b4da5d70263e1e7378933ecfc691ade7d79a656b0020c7f541461c3537cf6640de9aa4dcb6f8af5a2a9a756317d7d81e23dd78c633580120dfebf76b2a4d85c909e13d4207903b8edaa97997e9be7810142744c8d76c283e00207dd78d1c7038559f021d245d2cb09e6909f200e7ef7d51d94fecb3891e16a82600206b5b1811523917af0d761c096b8d009b300b4e230a40b36f849338f3445613560020e579eb69ab4934ffe90603b5804f34fb1326b6651f6ebba1ba4a4e6bddf5d2270020967eb7bdc4dd7624eaa17867986902cbdde62429bde81453e4a7fb0bba9b52670020d25198beaa5d060790d2f00c14d865d9a071bd0ff19c7b63d9d3ec67abf18a2100205d2151df6b51f68a703289e4370a870ca86e1d11cfbcdedfa0b589354a15555500202826a088077187f073865fe2df67efa472f45395bc231ad10ce9f5452f6a066d002020816a5c4c8b54caf8817fd21f1989fd9990ce7fe2790094c81c7963286d9b610100000000000000a8d63ba13d7c35caf942c64d5139b948b885ec931977a3f248c13e7f3c1bd0aa6451f33a2f14f92735e562dc658a5639279ddca3d5079a6d1242b2a588a9cbf44c0100000000000000d49569674ea77eef0fea1c6de1ecfa0002d430ed573aba1ef98b8594733c370c0000000000000000000000000000000000000000000000000000000000000000d63ba13d7c35caf942c64d5139b948b885ec931977a3f248c13e7f3c1bd0aa640000000000000000000000000000000001a15d0500";
  const rawTx = RawTransaction.deserialize(Buffer.from(serialzeTx, "hex"));
  const root = document.getElementById("root");
  root.innerHTML = JSON.stringify(rawTx);
  const tx = new WasmTransaction(
    "46eb4ae291ed28fc62c44e977f7153870030b3af9658b8e77590ac22d1417ab5",
    1
  );
  const { spends, outputs } = rawTx;
  for (const spend of spends) {
    const { note, witness } = spend;
    const parsedNote = WasmNote.deserialize(Buffer.from(note, "hex"));
    const parsedWitness = new Witness(witness);
    tx.spend(parsedNote, parsedWitness);
  }
  for (const output of outputs) {
    const { note } = output;
    const parsedNote = WasmNote.deserialize(Buffer.from(note, "hex"));
    tx.output(parsedNote);
  }
  // const signedTx = tx.post(
  //   "7dbb62fa99ac81640b6ee5f84a3b0e2390a1f40ccfa6eb6151ff5e0a98503923",
  //   1n
  // );
  const signedTx = tx.build_circuits(
    "7dbb62fa99ac81640b6ee5f84a3b0e2390a1f40ccfa6eb6151ff5e0a98503923",
    1n
  );
  // const result = Buffer.from(signedTx.serialize()).toString("hex");
  console.log("after build_circuits ", performance.now() - start);
}

main();
