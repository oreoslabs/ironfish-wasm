const {
  initializeSapling,
  NoteEncrypted,
  Transaction,
  Note,
} = require("@ironfish/rust-nodejs");

const { Buffer } = require("buffer");
const bufio = require("bufio");

const AMOUNT_VALUE_SIZE = 8;
const AMOUNT_VALUE_LENGTH = AMOUNT_VALUE_SIZE;
const NAME_LENGTH = 32;
const METADATA_LENGTH = 96;
const PUBLIC_ADDRESS_SIZE = 32;
const ASSET_LENGTH = NAME_LENGTH + PUBLIC_ADDRESS_SIZE + METADATA_LENGTH + 1;
const TRANSACTION_VERSION = 1;
const TRANSACTION_SIGNATURE_SIZE = 64;
const TRANSACTION_PUBLIC_KEY_SIZE = 32;
const TRANSACTION_EXPIRATION_SIZE = 4;
const TRANSACTION_EXPIRATION_LENGTH = TRANSACTION_EXPIRATION_SIZE;
const TRANSACTION_FEE_SIZE = 8;
const TRANSACTION_FEE_LENGTH = TRANSACTION_FEE_SIZE;
const ASSET_ID_LENGTH = 32;
const SPEND_SERIALIZED_SIZE_IN_BYTE = 388;
const PROOF_LENGTH = 192;
const ENCRYPTED_SHARED_KEY_SIZE = 64;
const MAC_SIZE = 16;
const MAC_LENGTH = MAC_SIZE;
const NOTE_ENCRYPTION_KEY_LENGTH = ENCRYPTED_SHARED_KEY_SIZE + MAC_SIZE;
const SCALAR_SIZE = 32;
const MEMO_SIZE = 32;
const ENCRYPTED_NOTE_SIZE =
  SCALAR_SIZE +
  MEMO_SIZE +
  AMOUNT_VALUE_SIZE +
  ASSET_ID_LENGTH +
  PUBLIC_ADDRESS_SIZE;
const ENCRYPTED_NOTE_PLAINTEXT_LENGTH = ENCRYPTED_NOTE_SIZE + MAC_LENGTH;
const ENCRYPTED_NOTE_LENGTH =
  NOTE_ENCRYPTION_KEY_LENGTH + ENCRYPTED_NOTE_PLAINTEXT_LENGTH + 96;
const NOTE_ENCRYPTED_SERIALIZED_SIZE_IN_BYTE =
  PROOF_LENGTH + ENCRYPTED_NOTE_LENGTH;
const IRONFISH_ASSET_ID =
  "51f33a2f14f92735e562dc658a5639279ddca3d5079a6d1242b2a588a9cbf44c";
const IRONFISH_MAX_UTXO_COUNT = 10;

const Side = {
  Left: "Left",
  Right: "Right",
};

class RawTransaction {
  expiration = null;
  fee = "0";
  mints = [];
  burns = [];
  outputs = [];
  version = 1;

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
  const start = performance.now();
  initializeSapling();
  console.log("after initializes_sapling ", performance.now() - start);

  const serialzeTx =
    "0101000000000000000100000000000000a8d63ba13d7c35caf942c64d5139b948b885ec931977a3f248c13e7f3c1bd0aa6451f33a2f14f92735e562dc658a5639279ddca3d5079a6d1242b2a588a9cbf44c40420f0000000000d53b538751fab6d3091a66251a35b2d3d7f4c008486874f5fe4cb6cd5e5edc0c0000000000000000000000000000000000000000000000000000000000000000a4e01d2e01a0a9e4c1da27644b58262576f54ece66b2cb18521720d5a75ac4def0f28300000000002015a2bd5abafc096617a9e8589efeb87e5af5a00a8e0d5af2f2382814a93b0d322000000000000000002026b1dfbc93372d3de4b9f49b5a9b0abe320f0aa99da33e5e6443712fde284837012096851e938603d2dde1018a72bb140e7f78702b009eee4e981ed2e4487b1aea5c0020b1e9acc3103ea00eaaaa3b7cbe130c2306a2b1242336f84e7bcfd3ef1c502a4f00205386e708dba74a18dd33ae313aa3bf429ad3d2375bac64051a7230abbfa1f8070020683271a6892b358bf062383678724e6206ff565e40d812be6694a509f5f4e35a0020b997b1de33883c3e6b3d8fdcb817b42e08a5311405b3517b69bdb3d92ad504320020dd50fb6fd46edcc62248d765ef72783af8157f8c8b01767de24d99deaf7e7d04002040830535dbab047122c67cf34ab308c131ca89dd4704d15c814260b65e990e0a0020fdb260c630fdb9629a5ad2c1f663552c5b82508b2e6f519cf78c77e22191b76100205572021ed36e123ded8b12578a203be7034d02cec38653eb44e509c76662931e00206b849ec49586d872e9d2264f235c1c23335919d00bac02bd741a2c6e2fdd950e00205be07828557990a8912baed5e133c68bd26528ecbf993bfa17ab2c6fb67f7b68012077052351b70b5b73d142072512b5a13a2d84040e7ef2386c422795bc39b86c680120d6de0756da61b7d213b4bbd54e49b098dbfa7b7902bf3cc9cca89d164c35985c0120ed6de3915e9423d082157dca1a7d46d92416b55fd3b0b484b10802b1848c286a0120ba778c895a5f9f60ebbb3ffc57877e500c4a3f719a7665dff93df7515c64b14c012060ab349350ad84e1359f1b5a35a27a6463d867156b0f1f598a96825e06e0286001205837b6ec9e6749fae99a1d9e68d85901f4ae7de18d653f62025a5d3d840b4313002055f88cac2a2f3cd668bc6e5533799ac9323ebd30e929dc9065c3c93359e2016c0020731aa8d9e5dcc1700cc3c09514be963197012756d90c68468756aecd922be5650020d16de75992279855d22432cb0d88e3c1929b2096395ac50f784fc3d09bcd772d0020c881d46a6bd8ade3e91992c6c03398060b438cb8114473cf6248bfc4f2112b1500201f66dc4a0f7cd12e881e1460ff5b89dbf8c88b0cd634c5992e069dfdeef230270120dfebf76b2a4d85c909e13d4207903b8edaa97997e9be7810142744c8d76c283e002085b53f20afaa099c89d647b6405003db71ba83c45254eea8239f210b2937a069002099be4dcef97a4895196463c44e952f4865ceb2c724470301cc6609fec050b53b0020b85bdf04a09c2e89c5f2922f14606d1d35569b0fa329713456e6da5b8c928a7200201ec2391783b7fa838da0f2914232be86e8e819785d6f79016246d29e69d6be2100206b2aa3c4d657266967d04e0f6c2b714bb818f0615a662713c1b04668c289ce4d00204083dee9d043ad4b7ada344a5db21307679b893229482d9d8710090db448ce0c002046297cda23599f3847716b7715e0fa0e7ad2b46e174d9c0dc25a6b29067cc4270020d2880c8b19f7d2e9f835416593e5b049b21f8d8d931fc15a4051c6ac4c19475a0100000000000000a8d63ba13d7c35caf942c64d5139b948b885ec931977a3f248c13e7f3c1bd0aa6451f33a2f14f92735e562dc658a5639279ddca3d5079a6d1242b2a588a9cbf44c0200000000000000a7436193fef7e3a4bdaabd4d492edb9f10a40b190ae8fc6d0a2a92cc3bacbc030000000000000000000000000000000000000000000000000000000000000000d63ba13d7c35caf942c64d5139b948b885ec931977a3f248c13e7f3c1bd0aa640000000000000000000000000000000001ce5d0500";
  const rawTx = RawTransaction.deserialize(Buffer.from(serialzeTx, "hex"));
  const tx = new Transaction(
    "46eb4ae291ed28fc62c44e977f7153870030b3af9658b8e77590ac22d1417ab5",
    1
  );
  const { spends, outputs } = rawTx;
  for (const spend of spends) {
    const { note, witness } = spend;
    const parsedNote = Note.deserialize(Buffer.from(note, "hex"));
    const parsedWitness = new Witness(witness);
    tx.spend(parsedNote, parsedWitness);
  }
  for (const output of outputs) {
    const { note } = output;
    const parsedNote = Note.deserialize(Buffer.from(note, "hex"));
    tx.output(parsedNote);
  }
  const withProofTx = tx.post(
    "7dbb62fa99ac81640b6ee5f84a3b0e2390a1f40ccfa6eb6151ff5e0a98503923",
    1n
  );
  const result = Buffer.from(withProofTx).toString("hex");

  console.log("result: ", result);
}

main();
