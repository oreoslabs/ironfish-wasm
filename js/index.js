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
        hashOfSibling: () => Buffer.from(hashOfSibling, "hex"),
      };
    });
    this._treeSize = data.treeSize;
    this._rootHash = Buffer.from(data.rootHash, "hex");
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
    "01000000000000000200000000000000a87dbb62fa99ac81640b6ee5f84a3b0e2390a1f40ccfa6eb6151ff5e0a9850392351f33a2f14f92735e562dc658a5639279ddca3d5079a6d1242b2a588a9cbf44c801a060000000000e2356c0059b4bf97a25614a3eab2c09a3928b1404d23a007f06f483b5ee58e0a00000000000000000000000000000000000000000000000000000000000000007dbb62fa99ac81640b6ee5f84a3b0e2390a1f40ccfa6eb6151ff5e0a98503923b2bb820000000000206095b0ff1d3b0ee24d756d05fec804c8eb6f1d2db48d9e05198e335f216e3a45200000000000000000203d62958285a82092c963e288be8a0a1086e4f9cbdb3289d688f43320ba0f2d5f0120d66ebfdab32692b3593dcb7ad6ba30946e833243389121ff723e03385213a1260120e15d261b8c364ab802d968021b41eda5d56f37d76d80f2a22d3fee0929d4183b01202826a6fa85687319d1689297c05084c1b91684be660b1d148d0d1cab7c11e32e0120b44afaa21a3f0c5f0db75996699dd8971f6be6a134f4cac9aa61e213a6de134c01201ff744f1163266c9ef2d3d1820fca18e50e60a1aa878c69988417ee0c37488080020bc1a8955c52e2a46a18da03c130f7b4a9fa1d57b649f4104b2708a955f2dac2c012050b946880feeb428bab68a1b1bf602ad4bfc5fa4e5ab7c25a1a01d40bdd57f3a00201bef884c59b5d0757dbcbaf296b5540eaa6bdd35b54cdbaf4df412d1cea3f7290120acab1759ab25486d1aff1f2df3fe30d69cb9ebb2e31f6f43b41da2a5f703af4a0020851ddc34263cdae4e7e4c1b68cf1247afafb984df2ddefc7439bf16ae1dcd7020120f2daabd12bf04a6034362bdaed295ac0e23912de4bc13de2630a5cb4a31d104f01204aeaf18627d357af1cab212260297568336e3341ada6c85b885782f1cb57c1440020a81c175d1f9bac5f9737b1b3d449c3e1e439ac4a96c1d2c58a0f1d5ef6187f6100208e985329e54a18bb7d635c87ae8d94eb94c80ba66f5751b34885c2179ae59f020120c933e68110ccf682594a57844723b1a716610976e259f6818633015587c8106801209167219e21c567d3e18f06eee7f0e6a9b77b9c65eb9c30b741b1b4e91177715e0020176fe90f7d7ce879cb8c9b671142a7458778e7f2e21a1d66f83044777971992f01202c1335438ee7c878e5b81ef38ad0a5d163a43743cad72bcd06477a300c0f976600205b1bb78bd820d1c58e602e6394ab1e37d2c6cb3a4a13095725a4f44a9f644c4d00208cdf3b5cab126143c389c9976589275aa17a3c6d2a859a17f444169cf29a16120120f9ad0bbadf4d83c96c9810868e3444243492db6d0a9e68f4156853125e4097590120da3931bc816ac0e6553494e78117f5d103b74d71963a9040f73b71a6e37f9d0000204602e46ea7ef094ad0eebe38cf1110e94352ade05b4cce6526386f311439631a002059761543585aaa85e1719bf95c2ba7459a94a0b238cd840167545fe6815f7945002013d7218cf989729c801278583048821623b79cfab7ae67cff6f67c2e03629a2f0020966a7a793a39575ae9ff017ae5322ee7896792a09a2f878152571574a6b8850c00208c13684a0fe4fc9aba9b331be7d51db0c7b756f425fda1a7d2be2b6324937c3a00204aacb237ccf91c06d74c910b492edb0871362e837ecc3945c3ff802090c8a333002041a2afaebfe2f66aa9911c52882d31e0828b0ea9c00d9de556b0bd3c4116ce710020d4aeaf669a1cc510a781b8f44bfa1fbdc77fa2b1903d9fd558bf61bbc0665d3b00207e0bdef5426d701eb2ec3674b35f4931a632960b567d5240aa88dba6a5a72358a87dbb62fa99ac81640b6ee5f84a3b0e2390a1f40ccfa6eb6151ff5e0a9850392351f33a2f14f92735e562dc658a5639279ddca3d5079a6d1242b2a588a9cbf44c8374bc0b000000009b427ebe64bd669e14da993c3e74b9a6f15097b36cb63b96fff4d356ee13b30c00000000000000000000000000000000000000000000000000000000000000007dbb62fa99ac81640b6ee5f84a3b0e2390a1f40ccfa6eb6151ff5e0a98503923b2bb820000000000206095b0ff1d3b0ee24d756d05fec804c8eb6f1d2db48d9e05198e335f216e3a452000000000000000012045cc5230efab1357bd500e999281d56442c55c4b07641b9a7e4ea860e89d08430120d66ebfdab32692b3593dcb7ad6ba30946e833243389121ff723e03385213a1260120e15d261b8c364ab802d968021b41eda5d56f37d76d80f2a22d3fee0929d4183b01202826a6fa85687319d1689297c05084c1b91684be660b1d148d0d1cab7c11e32e0120b44afaa21a3f0c5f0db75996699dd8971f6be6a134f4cac9aa61e213a6de134c01201ff744f1163266c9ef2d3d1820fca18e50e60a1aa878c69988417ee0c37488080020bc1a8955c52e2a46a18da03c130f7b4a9fa1d57b649f4104b2708a955f2dac2c012050b946880feeb428bab68a1b1bf602ad4bfc5fa4e5ab7c25a1a01d40bdd57f3a00201bef884c59b5d0757dbcbaf296b5540eaa6bdd35b54cdbaf4df412d1cea3f7290120acab1759ab25486d1aff1f2df3fe30d69cb9ebb2e31f6f43b41da2a5f703af4a0020851ddc34263cdae4e7e4c1b68cf1247afafb984df2ddefc7439bf16ae1dcd7020120f2daabd12bf04a6034362bdaed295ac0e23912de4bc13de2630a5cb4a31d104f01204aeaf18627d357af1cab212260297568336e3341ada6c85b885782f1cb57c1440020a81c175d1f9bac5f9737b1b3d449c3e1e439ac4a96c1d2c58a0f1d5ef6187f6100208e985329e54a18bb7d635c87ae8d94eb94c80ba66f5751b34885c2179ae59f020120c933e68110ccf682594a57844723b1a716610976e259f6818633015587c8106801209167219e21c567d3e18f06eee7f0e6a9b77b9c65eb9c30b741b1b4e91177715e0020176fe90f7d7ce879cb8c9b671142a7458778e7f2e21a1d66f83044777971992f01202c1335438ee7c878e5b81ef38ad0a5d163a43743cad72bcd06477a300c0f976600205b1bb78bd820d1c58e602e6394ab1e37d2c6cb3a4a13095725a4f44a9f644c4d00208cdf3b5cab126143c389c9976589275aa17a3c6d2a859a17f444169cf29a16120120f9ad0bbadf4d83c96c9810868e3444243492db6d0a9e68f4156853125e4097590120da3931bc816ac0e6553494e78117f5d103b74d71963a9040f73b71a6e37f9d0000204602e46ea7ef094ad0eebe38cf1110e94352ade05b4cce6526386f311439631a002059761543585aaa85e1719bf95c2ba7459a94a0b238cd840167545fe6815f7945002013d7218cf989729c801278583048821623b79cfab7ae67cff6f67c2e03629a2f0020966a7a793a39575ae9ff017ae5322ee7896792a09a2f878152571574a6b8850c00208c13684a0fe4fc9aba9b331be7d51db0c7b756f425fda1a7d2be2b6324937c3a00204aacb237ccf91c06d74c910b492edb0871362e837ecc3945c3ff802090c8a333002041a2afaebfe2f66aa9911c52882d31e0828b0ea9c00d9de556b0bd3c4116ce710020d4aeaf669a1cc510a781b8f44bfa1fbdc77fa2b1903d9fd558bf61bbc0665d3b00207e0bdef5426d701eb2ec3674b35f4931a632960b567d5240aa88dba6a5a723580100000000000000a87dbb62fa99ac81640b6ee5f84a3b0e2390a1f40ccfa6eb6151ff5e0a9850392351f33a2f14f92735e562dc658a5639279ddca3d5079a6d1242b2a588a9cbf44c80f0fa02000000006c1bf9fd195798c035ce3141d9690647396b5adc290ff0130d75b4b1f9972d0000000000000000000000000000000000000000000000000000000000000000007dbb62fa99ac81640b6ee5f84a3b0e2390a1f40ccfa6eb6151ff5e0a9850392300000000000000000000000000000000010c410500";
  const rawTx = RawTransaction.deserialize(Buffer.from(serialzeTx, "hex"));
  const tx = new WasmTransaction(
    "46eb4ae291ed28fc62c44e977f7153870030b3af9658b8e77590ac22d1417ab5",
    1,
    wasm
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
  const signedTx = tx.post(
    "d63ba13d7c35caf942c64d5139b948b885ec931977a3f248c13e7f3c1bd0aa64",
    1n
  );
  const result = Buffer.from(signedTx.serialize()).toString("hex");
  const root = document.getElementById("root");
  root.innerHTML = JSON.stringify(result);
}

main();
