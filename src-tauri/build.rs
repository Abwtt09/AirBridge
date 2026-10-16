fn main() {
    tauri_build::build();
    // Integration tests also link the updater's native Windows dialog code.
    // TaskDialogIndirect requires the same Common Controls v6 activation as the app.
    #[cfg(target_os = "windows")]
    println!("cargo:rustc-link-arg-tests=/MANIFESTDEPENDENCY:type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'");
}
