async function main() {
    const module = await import('../pkg/index');
    console.log(module.send_obj_to_js());
    console.log(module.send_array_to_js());
    console.log(module.test_point());
  }
  
  main();