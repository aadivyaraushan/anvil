use std::path::Path;

fn main() {
    // Tauri 2 capabilities are loaded at build time from `capabilities/*.json`.
    // We can't feature-gate inside JSON, so generate the active e2e capability
    // from a template only when the `e2e` Cargo feature is enabled. The active
    // file is gitignored so regular production builds don't churn the tree.
    let active = Path::new("capabilities/e2e.json");
    let template = Path::new("capabilities/e2e.json.template");
    let feature_on = std::env::var_os("CARGO_FEATURE_E2E").is_some();

    if feature_on {
        if template.exists() {
            std::fs::copy(template, active).expect("activate e2e capability");
        }
    } else if active.exists() {
        std::fs::remove_file(active).expect("remove generated e2e capability");
    }

    println!("cargo:rerun-if-env-changed=CARGO_FEATURE_E2E");
    println!("cargo:rerun-if-changed=capabilities/e2e.json.template");

    tauri_build::build()
}
