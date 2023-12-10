use ironfish_rust::errors::IronfishError;

pub struct WasmIoError(pub std::io::Error);
pub struct WasmIronfishError(pub IronfishError);

impl From<WasmIoError> for wasm_bindgen::JsValue {
    fn from(e: WasmIoError) -> Self {
        js_sys::Error::new(&e.0.to_string()).into()
    }
}

impl From<WasmIronfishError> for wasm_bindgen::JsValue {
    fn from(e: WasmIronfishError) -> Self {
        js_sys::Error::new(&e.0.to_string()).into()
    }
}
