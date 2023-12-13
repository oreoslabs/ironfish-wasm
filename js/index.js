import init, { generateKey } from "ironfish_wasm";

async function main() {
  await init();
  // const module = await import("../pkg/ironfish_wasm.js");
  // console.log(module.send_obj_to_js());
  // console.log(module.send_array_to_js());
  // console.log(module.test_point());
  const pk = generateKey();
  console.log("pk ", pk.spending_key);

  const root = document.getElementById("root");
  root.innerHTML = pk.spending_key;
}

main();
