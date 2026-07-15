use std::env;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

const VERSION: &str = env!("CARGO_PKG_VERSION");
const PRODUCT_CONTRACT: &str = include_str!("../contract/xinfa-product-v1.json");

fn json_string(value: &str) -> String {
    let mut output = String::with_capacity(value.len() + 2);
    output.push('"');
    for character in value.chars() {
        match character {
            '"' => output.push_str("\\\""),
            '\\' => output.push_str("\\\\"),
            '\n' => output.push_str("\\n"),
            '\r' => output.push_str("\\r"),
            '\t' => output.push_str("\\t"),
            control if control.is_control() => {
                output.push_str(&format!("\\u{:04x}", control as u32));
            }
            other => output.push(other),
        }
    }
    output.push('"');
    output
}

fn configured_path(key: &str, fallback: PathBuf) -> (PathBuf, &'static str) {
    match env::var_os(key) {
        Some(value) if !value.is_empty() => (PathBuf::from(value), "environment"),
        _ => (fallback, "workspace"),
    }
}

fn display_path(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn diagnose() -> Result<String, String> {
    let current_dir = env::current_dir().map_err(|error| format!("cannot resolve cwd: {error}"))?;
    let (state_home, state_source) =
        configured_path("XINFA_STATE_HOME", current_dir.join(".xinfa"));
    let (cache_home, cache_source) = configured_path("XINFA_CACHE_HOME", state_home.join("cache"));
    Ok(format!(
        "{{\"schema\":\"xinfa.diagnostic/v1\",\"product\":\"xinfa\",\"version\":{},\"stateHome\":{},\"stateSource\":{},\"cacheHome\":{},\"cacheSource\":{},\"writesState\":false}}",
        json_string(VERSION),
        json_string(&display_path(&state_home)),
        json_string(state_source),
        json_string(&display_path(&cache_home)),
        json_string(cache_source),
    ))
}
fn usage() -> &'static str {
    "Usage:\n  xinfa --version\n  xinfa contract --json\n  xinfa diagnose --json"
}

fn run() -> Result<(), String> {
    let arguments: Vec<String> = env::args().skip(1).collect();
    match arguments.as_slice() {
        [flag] if flag == "--version" || flag == "-V" => {
            println!("xinfa {VERSION}");
            Ok(())
        }
        [command, format] if command == "contract" && format == "--json" => {
            print!("{PRODUCT_CONTRACT}");
            Ok(())
        }
        [command, format] if command == "diagnose" && format == "--json" => {
            println!("{}", diagnose()?);
            Ok(())
        }
        [flag] if flag == "--help" || flag == "-h" => {
            println!("{}", usage());
            Ok(())
        }
        _ => Err(format!("unsupported arguments\n{}", usage())),
    }
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("xinfa: {error}");
            ExitCode::from(2)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::json_string;

    #[test]
    fn escapes_json_strings() {
        assert_eq!(json_string("a\n\"b\\c"), "\"a\\n\\\"b\\\\c\"");
    }
}
