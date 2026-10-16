use serde_json::json;
use std::path::PathBuf;
use tauri_plugin_updater::UpdaterExt;

/// Runs against the exact installer and signature selected for publication.
#[test]
#[ignore = "release artifact is required; run with AIRBRIDGE_UPDATE_INSTALLER set"]
fn signed_installer_accepts_authentic_bytes_and_rejects_tampering() {
    let path = PathBuf::from(std::env::var("AIRBRIDGE_UPDATE_INSTALLER").expect("installer path"));
    let bytes = std::fs::read(&path).unwrap();
    let signature = std::fs::read_to_string(format!("{}.sig", path.display())).unwrap();
    let config: serde_json::Value =
        serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
    let mut context = tauri::test::mock_context(tauri::test::noop_assets());
    context
        .config_mut()
        .plugins
        .0
        .insert("updater".into(), config["plugins"]["updater"].clone());
    let app = tauri::test::mock_builder()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .build(context)
        .unwrap();
    let updater = app
        .updater_builder()
        .endpoints(vec![
            "https://github.com/Abwtt09/AirBridge/releases/latest/download/latest.json"
                .parse()
                .unwrap(),
        ])
        .unwrap()
        .target("windows-x86_64")
        .version_comparator(|_, _| true)
        .build()
        .unwrap();
    let mut manifest = json!({
        "version": env!("CARGO_PKG_VERSION"),
        "platforms": { "windows-x86_64": {
            "url": "https://github.com/Abwtt09/AirBridge/releases/download/v0.1.0/AirBridge_0.1.0_x64-setup.exe",
            "signature": signature.trim()
        }}
    });
    let update = updater.restore_update(manifest.clone()).unwrap().unwrap();
    update
        .verify(&bytes)
        .expect("The release installer must verify with the embedded public key");
    manifest["version"] = json!("999.0.0");
    let falsely_announced = updater.restore_update(manifest).unwrap().unwrap();
    assert!(
        falsely_announced.verify(&bytes).is_err(),
        "A manifest cannot relabel an old signed artifact as a new version"
    );
    let mut tampered = bytes;
    let index = tampered.len() / 2;
    tampered[index] ^= 1;
    assert!(
        update.verify(&tampered).is_err(),
        "A changed byte must invalidate the signature"
    );
}
