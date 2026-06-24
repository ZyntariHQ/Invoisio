use std::{env, path::PathBuf, process};

use soroban_spec_rust::{generate_from_file, ToFormattedString};

fn main() {
    let wasm_path = parse_wasm_path().unwrap_or_else(|err| {
        eprintln!("{err}");
        eprintln!(
            "usage: cargo run --manifest-path soroban/tools/bindings-gen/Cargo.toml -- --wasm <path>"
        );
        process::exit(2);
    });

    let bindings = generate_from_file(wasm_path.to_string_lossy().as_ref(), None).unwrap_or_else(
        |err| {
            eprintln!("failed to read contract spec from {}: {err}", wasm_path.display());
            process::exit(1);
        },
    );

    let rendered = bindings.to_formatted_string().unwrap_or_else(|err| {
        eprintln!("failed to format generated bindings: {err}");
        process::exit(1);
    });

    print!("{rendered}");
}

fn parse_wasm_path() -> Result<PathBuf, String> {
    let mut args = env::args().skip(1);

    while let Some(arg) = args.next() {
        if arg == "--wasm" {
            let path = args
                .next()
                .ok_or_else(|| String::from("missing value after --wasm"))?;
            return Ok(PathBuf::from(path));
        }
    }

    Err(String::from("missing required --wasm <path> argument"))
}
