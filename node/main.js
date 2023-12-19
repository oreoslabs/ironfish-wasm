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
    "01000000000000000200000000000000a87dbb62fa99ac81640b6ee5f84a3b0e2390a1f40ccfa6eb6151ff5e0a9850392351f33a2f14f92735e562dc658a5639279ddca3d5079a6d1242b2a588a9cbf44c801a060000000000e2356c0059b4bf97a25614a3eab2c09a3928b1404d23a007f06f483b5ee58e0a00000000000000000000000000000000000000000000000000000000000000007dbb62fa99ac81640b6ee5f84a3b0e2390a1f40ccfa6eb6151ff5e0a98503923e3ec83000000000020c0418bee1dae85d6d7dccc3ca0a8af997a26a3cf5bccbc8421498eb96ce3186b200000000000000000203d62958285a82092c963e288be8a0a1086e4f9cbdb3289d688f43320ba0f2d5f0120d66ebfdab32692b3593dcb7ad6ba30946e833243389121ff723e03385213a1260120e15d261b8c364ab802d968021b41eda5d56f37d76d80f2a22d3fee0929d4183b01202826a6fa85687319d1689297c05084c1b91684be660b1d148d0d1cab7c11e32e0120b44afaa21a3f0c5f0db75996699dd8971f6be6a134f4cac9aa61e213a6de134c01201ff744f1163266c9ef2d3d1820fca18e50e60a1aa878c69988417ee0c37488080020bc1a8955c52e2a46a18da03c130f7b4a9fa1d57b649f4104b2708a955f2dac2c012050b946880feeb428bab68a1b1bf602ad4bfc5fa4e5ab7c25a1a01d40bdd57f3a00201bef884c59b5d0757dbcbaf296b5540eaa6bdd35b54cdbaf4df412d1cea3f7290120acab1759ab25486d1aff1f2df3fe30d69cb9ebb2e31f6f43b41da2a5f703af4a0020851ddc34263cdae4e7e4c1b68cf1247afafb984df2ddefc7439bf16ae1dcd7020120f2daabd12bf04a6034362bdaed295ac0e23912de4bc13de2630a5cb4a31d104f01204aeaf18627d357af1cab212260297568336e3341ada6c85b885782f1cb57c1440020a81c175d1f9bac5f9737b1b3d449c3e1e439ac4a96c1d2c58a0f1d5ef6187f6100208e985329e54a18bb7d635c87ae8d94eb94c80ba66f5751b34885c2179ae59f020120c933e68110ccf682594a57844723b1a716610976e259f6818633015587c8106801209167219e21c567d3e18f06eee7f0e6a9b77b9c65eb9c30b741b1b4e91177715e0020176fe90f7d7ce879cb8c9b671142a7458778e7f2e21a1d66f83044777971992f01202c1335438ee7c878e5b81ef38ad0a5d163a43743cad72bcd06477a300c0f976600205b1bb78bd820d1c58e602e6394ab1e37d2c6cb3a4a13095725a4f44a9f644c4d00208cdf3b5cab126143c389c9976589275aa17a3c6d2a859a17f444169cf29a16120120f9ad0bbadf4d83c96c9810868e3444243492db6d0a9e68f4156853125e4097590120da3931bc816ac0e6553494e78117f5d103b74d71963a9040f73b71a6e37f9d0000204e643f47fd908db770bf06885ea96c8b2b526010fe629624b5ea28a5492442390020cbafb33a81cd71f04d4b3020e2831a2b70986ab954c54daeff15564e9ebfe3260020f0d0a9316593effd7d82ef93416a746150bd811fc3a7ab2839bdef0868ad115d00207b03d6a90fe0d5b580414f672ec03a5646b8c57fed733dd621c764477ea1d10500201ee05c99bf4aa0a19aaff8b1f877a3a88662bc14f3bbd025821a056d24b87a0a00206c52acaddce9acb2a0242f456c7027d236b8446c706cc86c0b1958eb5a341f6a0020d735ab3d37d8fd7afe6401a8699c0d8e0bda9efef3e73bbae9227e77c749b139002084430f6e8c80cd8c91c68f6f33c5a6c1acd03bdee235686b580897c4886823030020b36f40c2859b21ce7d5cc797fba3667c4b9cbd32d7bcc380421139df349c995aa87dbb62fa99ac81640b6ee5f84a3b0e2390a1f40ccfa6eb6151ff5e0a9850392351f33a2f14f92735e562dc658a5639279ddca3d5079a6d1242b2a588a9cbf44c8374bc0b000000009b427ebe64bd669e14da993c3e74b9a6f15097b36cb63b96fff4d356ee13b30c00000000000000000000000000000000000000000000000000000000000000007dbb62fa99ac81640b6ee5f84a3b0e2390a1f40ccfa6eb6151ff5e0a98503923e3ec83000000000020c0418bee1dae85d6d7dccc3ca0a8af997a26a3cf5bccbc8421498eb96ce3186b2000000000000000012045cc5230efab1357bd500e999281d56442c55c4b07641b9a7e4ea860e89d08430120d66ebfdab32692b3593dcb7ad6ba30946e833243389121ff723e03385213a1260120e15d261b8c364ab802d968021b41eda5d56f37d76d80f2a22d3fee0929d4183b01202826a6fa85687319d1689297c05084c1b91684be660b1d148d0d1cab7c11e32e0120b44afaa21a3f0c5f0db75996699dd8971f6be6a134f4cac9aa61e213a6de134c01201ff744f1163266c9ef2d3d1820fca18e50e60a1aa878c69988417ee0c37488080020bc1a8955c52e2a46a18da03c130f7b4a9fa1d57b649f4104b2708a955f2dac2c012050b946880feeb428bab68a1b1bf602ad4bfc5fa4e5ab7c25a1a01d40bdd57f3a00201bef884c59b5d0757dbcbaf296b5540eaa6bdd35b54cdbaf4df412d1cea3f7290120acab1759ab25486d1aff1f2df3fe30d69cb9ebb2e31f6f43b41da2a5f703af4a0020851ddc34263cdae4e7e4c1b68cf1247afafb984df2ddefc7439bf16ae1dcd7020120f2daabd12bf04a6034362bdaed295ac0e23912de4bc13de2630a5cb4a31d104f01204aeaf18627d357af1cab212260297568336e3341ada6c85b885782f1cb57c1440020a81c175d1f9bac5f9737b1b3d449c3e1e439ac4a96c1d2c58a0f1d5ef6187f6100208e985329e54a18bb7d635c87ae8d94eb94c80ba66f5751b34885c2179ae59f020120c933e68110ccf682594a57844723b1a716610976e259f6818633015587c8106801209167219e21c567d3e18f06eee7f0e6a9b77b9c65eb9c30b741b1b4e91177715e0020176fe90f7d7ce879cb8c9b671142a7458778e7f2e21a1d66f83044777971992f01202c1335438ee7c878e5b81ef38ad0a5d163a43743cad72bcd06477a300c0f976600205b1bb78bd820d1c58e602e6394ab1e37d2c6cb3a4a13095725a4f44a9f644c4d00208cdf3b5cab126143c389c9976589275aa17a3c6d2a859a17f444169cf29a16120120f9ad0bbadf4d83c96c9810868e3444243492db6d0a9e68f4156853125e4097590120da3931bc816ac0e6553494e78117f5d103b74d71963a9040f73b71a6e37f9d0000204e643f47fd908db770bf06885ea96c8b2b526010fe629624b5ea28a5492442390020cbafb33a81cd71f04d4b3020e2831a2b70986ab954c54daeff15564e9ebfe3260020f0d0a9316593effd7d82ef93416a746150bd811fc3a7ab2839bdef0868ad115d00207b03d6a90fe0d5b580414f672ec03a5646b8c57fed733dd621c764477ea1d10500201ee05c99bf4aa0a19aaff8b1f877a3a88662bc14f3bbd025821a056d24b87a0a00206c52acaddce9acb2a0242f456c7027d236b8446c706cc86c0b1958eb5a341f6a0020d735ab3d37d8fd7afe6401a8699c0d8e0bda9efef3e73bbae9227e77c749b139002084430f6e8c80cd8c91c68f6f33c5a6c1acd03bdee235686b580897c4886823030020b36f40c2859b21ce7d5cc797fba3667c4b9cbd32d7bcc380421139df349c995a0100000000000000a87dbb62fa99ac81640b6ee5f84a3b0e2390a1f40ccfa6eb6151ff5e0a9850392351f33a2f14f92735e562dc658a5639279ddca3d5079a6d1242b2a588a9cbf44c00e1f50500000000b081e015aa6bd6a1c70d3b707418f349be6abcc08df5c850e68654fe1238c30b00000000000000000000000000000000000000000000000000000000000000007dbb62fa99ac81640b6ee5f84a3b0e2390a1f40ccfa6eb6151ff5e0a9850392300000000000000000000000000000000012f5d0500";
  const rawTx = RawTransaction.deserialize(Buffer.from(serialzeTx, "hex"));
  const tx = new Transaction("", 1);
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
  const signedTx = tx.post(
    "7dbb62fa99ac81640b6ee5f84a3b0e2390a1f40ccfa6eb6151ff5e0a98503923",
    1n
  );
  const result = Buffer.from(signedTx).toString("hex");

  console.log("result: ", result);
}

main();
