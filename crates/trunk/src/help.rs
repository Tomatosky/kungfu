// SPDX-License-Identifier: Apache-2.0
//
// Unified `--help` rendered from a declarative manifest (ADR-0046 stage 3/4).
//
// `kungfu --help` should list the whole command surface without waking a
// satellite — the front door stays usable (and fast) even when the domain
// runtime is broken (ADR-0046 driver 1). The command surface lives in the Python
// click tree, so it is introspected once at build time into a small tagged-line
// manifest shipped next to the binary (dist/kungfu/help-manifest.txt); the trunk
// reads and renders it here, initializing no Python.
//
// It degrades gracefully: when the manifest is absent (a dev checkout without the
// assembled product), `render` returns None and the caller falls through to the
// launch path, where the Python CLI prints its own help. The manifest is the
// single source of truth — generated from the live click tree, never hand-authored
// (see framework/core/src/python/kungfu/cli/help_manifest.py and the assemble leg
// in run-freeze.js), so it cannot drift from the real CLI.
//
// Manifest format (tab-separated, one record per line; `#` comments and blank
// lines ignored):
//   VERSION <version>
//   OPT     <flags>         <summary>
//   CMD     <name>  <summary>        <priority>
//   ROOTOPT <name>  <arity>  <envvar> <comma-separated flags> <choices>
// Records may arrive in any order; the trunk groups and sorts them.

use std::env;
use std::fs;
use std::path::PathBuf;

/// The generated manifest shipped next to the front-door binary.
const MANIFEST_FILE: &str = "help-manifest.txt";

/// Default help-ordering priority (mirrors the click PrioritizedCommandGroup
/// default) for commands whose record omits one.
const DEFAULT_PRIORITY: u32 = 100;

/// Help metadata for one command implemented by the Rust trunk. The caller
/// supplies this from the same table used for dispatch, so discovery cannot
/// drift from execution when another native command lands.
pub struct NativeCommandHelp {
    pub name: &'static str,
    pub summary: &'static str,
}

/// Machine-readable root option emitted from the live Click group. The trunk
/// uses these records only while routing to a native command; domain command
/// arguments remain opaque and are forwarded byte-for-byte.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RootOption {
    pub name: String,
    pub arity: usize,
    pub envvar: Option<String>,
    pub flags: Vec<String>,
    pub choices: Vec<String>,
}

struct Command {
    name: String,
    summary: String,
    priority: u32,
}

/// Render the unified `kungfu` help from the shipped manifest, or `None` if the
/// manifest is not present (the caller then falls through to the Python CLI help).
pub fn render(native_commands: &[NativeCommandHelp]) -> Option<String> {
    Some(render_from(&manifest_text()?, native_commands))
}

/// Return the product version recorded by the assembled runtime manifest.
/// A bare development trunk may not have a manifest; the caller owns that
/// informational fallback.
pub fn version() -> Option<String> {
    manifest_text()?.lines().find_map(|line| {
        let mut fields = line.trim_end_matches(['\r', '\n']).split('\t');
        (fields.next() == Some("VERSION"))
            .then(|| fields.next().map(str::to_string))
            .flatten()
    })
}

/// Load the generated root-routing contract. Absence is tolerated for a bare
/// development binary; assembled product builds make generation mandatory.
pub fn root_options() -> Option<Vec<RootOption>> {
    Some(parse_root_options(&manifest_text()?))
}

fn manifest_path() -> Option<PathBuf> {
    Some(env::current_exe().ok()?.parent()?.join(MANIFEST_FILE))
}

fn manifest_text() -> Option<String> {
    fs::read_to_string(manifest_path()?).ok()
}

fn parse_root_options(text: &str) -> Vec<RootOption> {
    text.lines()
        .filter_map(|line| {
            let mut fields = line.trim_end_matches(['\r', '\n']).split('\t');
            if fields.next() != Some("ROOTOPT") {
                return None;
            }
            let name = fields.next()?.to_string();
            let arity = fields.next()?.parse().ok()?;
            let envvar = fields
                .next()
                .filter(|value| !value.is_empty())
                .map(str::to_string);
            let flags = fields
                .next()
                .unwrap_or("")
                .split(',')
                .filter(|flag| !flag.is_empty())
                .map(str::to_string)
                .collect();
            let choices = fields
                .next()
                .unwrap_or("")
                .split(',')
                .filter(|choice| !choice.is_empty())
                .map(str::to_string)
                .collect();
            Some(RootOption {
                name,
                arity,
                envvar,
                flags,
                choices,
            })
        })
        .collect()
}

fn render_from(text: &str, native_commands: &[NativeCommandHelp]) -> String {
    let mut version: Option<String> = None;
    let mut options: Vec<(String, String)> = Vec::new();
    let mut commands: Vec<Command> = Vec::new();

    for line in text.lines() {
        let line = line.trim_end_matches(['\r', '\n']);
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let mut fields = line.split('\t');
        match fields.next() {
            Some("VERSION") => version = fields.next().map(str::to_string),
            Some("OPT") => {
                if let (Some(flags), summary) = (fields.next(), fields.next().unwrap_or("")) {
                    options.push((flags.to_string(), summary.to_string()));
                }
            }
            Some("CMD") => {
                if let Some(name) = fields.next() {
                    let summary = fields.next().unwrap_or("");
                    let priority = fields
                        .next()
                        .and_then(|p| p.parse().ok())
                        .unwrap_or(DEFAULT_PRIORITY);
                    commands.push(Command {
                        name: name.to_string(),
                        summary: summary.to_string(),
                        priority,
                    });
                }
            }
            _ => {}
        }
    }

    // Merge the native command table used by dispatch. `env` is also present in
    // the Click manifest as a forwarding compatibility surface; de-duplicate it.
    for native in native_commands {
        if !commands.iter().any(|c| c.name == native.name) {
            commands.push(Command {
                name: native.name.to_string(),
                summary: native.summary.to_string(),
                priority: DEFAULT_PRIORITY,
            });
        }
    }

    // Help order mirrors the click PrioritizedCommandGroup: by priority, then name.
    commands.sort_by(|a, b| {
        a.priority
            .cmp(&b.priority)
            .then_with(|| a.name.cmp(&b.name))
    });

    let mut out = String::new();
    match &version {
        Some(v) => out.push_str(&format!("kungfu {v}\n\n")),
        None => out.push_str("kungfu\n\n"),
    }
    out.push_str("usage: kungfu [options] <command> [<args>]\n");

    if !options.is_empty() {
        let width = options.iter().map(|(f, _)| f.len()).max().unwrap_or(0);
        out.push_str("\noptions:\n");
        for (flags, summary) in &options {
            out.push_str(&format!("  {flags:<width$}  {summary}\n"));
        }
    }

    if !commands.is_empty() {
        let width = commands.iter().map(|c| c.name.len()).max().unwrap_or(0);
        out.push_str("\ncommands:\n");
        for c in &commands {
            out.push_str(&format!(
                "  {name:<width$}  {summary}\n",
                name = c.name,
                summary = c.summary
            ));
        }
    }

    out.push_str("\nrun 'kungfu <command> --help' for command-specific help.\n");
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "\
# kungfu help manifest (generated; do not edit)
VERSION\t4.0.0-alpha.1
OPT\t-H, --home <path>\tkungfu runtime home folder
OPT\t-h, --help\tshow this help and exit
CMD\tenv\tmanage runtime environments\t10
CMD\ttrace\ttrace a running runtime\t100
CMD\tagent\tagent bridge\t100
ROOTOPT\thome\t1\tKF_HOME\t-H,--home\t
ROOTOPT\tenv_verify_location\t0\tKF_VERIFY_LOCATION\t-ENV-verify-location\t
";

    const NATIVE: &[NativeCommandHelp] = &[
        NativeCommandHelp {
            name: "env",
            summary: "manage runtime environments",
        },
        NativeCommandHelp {
            name: "doctor",
            summary: "read-only runtime inspection via the embedding membrane",
        },
        NativeCommandHelp {
            name: "prewarm",
            summary: "pre-fetch the pinned uv + satellite CPython",
        },
        NativeCommandHelp {
            name: "fsck",
            summary: "read-only storage integrity check via the embedding membrane",
        },
    ];

    #[test]
    fn renders_version_options_and_sorted_commands() {
        let out = render_from(SAMPLE, NATIVE);
        assert!(out.contains("kungfu 4.0.0-alpha.1"));
        assert!(out.contains("usage: kungfu [options] <command>"));
        assert!(out.contains("-H, --home <path>"));
        // env has priority 10, so it lists before the priority-100 commands.
        let env_at = out.find("\n  env ").unwrap();
        let trace_at = out.find("\n  trace ").unwrap();
        assert!(env_at < trace_at);
        // same priority (100) → alphabetical: agent before trace.
        let agent_at = out.find("\n  agent ").unwrap();
        assert!(agent_at < trace_at);
    }

    #[test]
    fn merges_trunk_only_commands() {
        let out = render_from(SAMPLE, NATIVE);
        // Every command in the dispatch table must be discoverable, including
        // fsck (the regression that prompted the shared source of truth).
        assert!(out.contains("\n  fsck "));
        assert!(out.contains("\n  doctor "));
        assert!(out.contains("\n  prewarm "));
    }

    #[test]
    fn does_not_duplicate_a_trunk_command_already_in_manifest() {
        let text = "CMD\tdoctor\tfrom manifest\t100\n";
        let out = render_from(text, NATIVE);
        assert_eq!(out.matches("\n  doctor ").count(), 1);
        assert!(out.contains("from manifest"));
    }

    #[test]
    fn ignores_comments_and_blank_lines() {
        let out = render_from("# just a comment\n\n\nVERSION\t1.2.3\n", NATIVE);
        assert!(out.contains("kungfu 1.2.3"));
    }

    #[test]
    fn parses_generated_root_routing_records() {
        assert_eq!(
            parse_root_options(SAMPLE),
            vec![
                RootOption {
                    name: "home".to_string(),
                    arity: 1,
                    envvar: Some("KF_HOME".to_string()),
                    flags: vec!["-H".to_string(), "--home".to_string()],
                    choices: vec![],
                },
                RootOption {
                    name: "env_verify_location".to_string(),
                    arity: 0,
                    envvar: Some("KF_VERIFY_LOCATION".to_string()),
                    flags: vec!["-ENV-verify-location".to_string()],
                    choices: vec![],
                },
            ]
        );
    }
}
