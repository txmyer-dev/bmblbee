//! User-chosen local checkouts for project repositories.
//!
//! [`super::project_repo_paths::find_local_repo_dir`] resolves a repository's
//! working copy by name under a repos root — a checkout has to live at
//! `<repos root>/<name derived from the dtag or clone URL>` to be found at
//! all. That covers everything Buzz cloned itself and nothing a developer
//! already had: an existing `C:\dev\myproject` or `~/src/thing` is invisible
//! no matter how the repos root is configured.
//!
//! This module is the escape hatch. The user picks a folder in the native file
//! dialog, the pick is validated as a git checkout and recorded here, and the
//! lookup in `project_repo_paths` consults these links before it falls back to
//! the by-name scan. Every existing project git command — snapshots, diffs,
//! sync status, push, terminal — then works against that path without any of
//! them changing.
//!
//! The store lives in the nest rather than the Tauri app-data dir on purpose:
//! `find_local_repo_dir` is a free function called from `spawn_blocking`
//! closures that hold no `AppHandle`, and [`nest_dir`] is reachable from all of
//! them.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

use crate::managed_agents::nest_dir;

/// One repository bound to a folder the user picked.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectLocalCheckout {
    /// `d` tag of the repository this checkout belongs to.
    pub dtag: String,
    /// Absolute, canonicalized path to the working tree.
    pub path: String,
    /// Clone URL the link was made against, when the caller knew one.
    ///
    /// Recorded so a lookup can require it to match. The dtag alone is
    /// relay-supplied, so without this binding a project that published a
    /// colliding dtag would resolve to a folder the user linked for a
    /// different repository.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub clone_url: Option<String>,
}

#[derive(Default, Serialize, Deserialize)]
struct LocalCheckoutStore {
    #[serde(default)]
    checkouts: Vec<ProjectLocalCheckout>,
}

fn store_path() -> Result<PathBuf, String> {
    let nest = nest_dir().ok_or_else(|| "could not resolve the Buzz nest directory".to_string())?;
    Ok(nest.join("local-checkouts.json"))
}

fn load_store() -> LocalCheckoutStore {
    // A missing or unreadable store means "no links", never an error: the
    // by-name fallback in project_repo_paths still resolves Buzz's own clones,
    // and failing the whole lookup here would break projects that never used
    // a link at all.
    let Ok(path) = store_path() else {
        return LocalCheckoutStore::default();
    };
    let Ok(raw) = std::fs::read_to_string(path) else {
        return LocalCheckoutStore::default();
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

fn save_store(store: &LocalCheckoutStore) -> Result<(), String> {
    use atomic_write_file::AtomicWriteFile;
    use std::io::Write;

    let path = store_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create {}: {error}", parent.display()))?;
    }
    let json = serde_json::to_string_pretty(store)
        .map_err(|error| format!("failed to serialize local checkouts: {error}"))?;
    let mut file = AtomicWriteFile::open(&path)
        .map_err(|error| format!("failed to open {}: {error}", path.display()))?;
    file.write_all(json.as_bytes())
        .map_err(|error| format!("failed to write local checkouts: {error}"))?;
    file.commit()
        .map_err(|error| format!("failed to save local checkouts: {error}"))?;
    Ok(())
}

/// Trailing `/` and `.git` carry no meaning when comparing two clone URLs for
/// the same repository. Mirrors `project_repo_paths::normalized_clone_url`.
fn normalized_clone_url(value: &str) -> &str {
    value.trim().trim_end_matches('/').trim_end_matches(".git")
}

/// A directory is usable as a checkout when it exists and carries a `.git`
/// entry — a directory for an ordinary clone, a file for a worktree or
/// submodule. Both are valid working trees for the git commands.
fn is_git_checkout(path: &Path) -> bool {
    path.is_dir() && path.join(".git").exists()
}

/// The linked checkout for `dtag`, when one is recorded and still valid.
///
/// `clone_url` is the URL the caller wants a checkout for. A link recorded
/// with a different URL is ignored rather than returned, so a relay-supplied
/// dtag cannot borrow a folder the user linked for another repository. A link
/// recorded without a URL (the caller had none at link time) matches any.
pub(crate) fn linked_checkout_dir(dtag: &str, clone_url: Option<&str>) -> Option<PathBuf> {
    let dtag = dtag.trim();
    if dtag.is_empty() {
        return None;
    }
    let link = load_store()
        .checkouts
        .into_iter()
        .find(|checkout| checkout.dtag == dtag)?;
    if let (Some(recorded), Some(requested)) = (link.clone_url.as_deref(), clone_url) {
        if normalized_clone_url(recorded) != normalized_clone_url(requested) {
            return None;
        }
    }
    // Re-validate on every read: the folder may have been moved, renamed, or
    // deleted since it was linked. A stale link resolves to nothing and the
    // by-name fallback takes over, rather than handing git a dead path.
    let path = PathBuf::from(&link.path);
    is_git_checkout(&path).then_some(path)
}

/// Open the OS folder picker and return the chosen directory, or `None` when
/// the user cancelled.
#[tauri::command]
pub async fn pick_directory(
    app: AppHandle,
    title: Option<String>,
) -> Result<Option<String>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    let mut dialog = app.dialog().file();
    if let Some(title) = title.as_deref().map(str::trim).filter(|t| !t.is_empty()) {
        dialog = dialog.set_title(title);
    }
    dialog.pick_folder(move |path| {
        let _ = tx.send(path);
    });

    let Some(selected) = rx.await.map_err(|_| "folder dialog closed".to_string())? else {
        return Ok(None);
    };
    let path = selected
        .as_path()
        .ok_or_else(|| "The folder dialog returned an unusable path.".to_string())?;
    Ok(Some(path.display().to_string()))
}

/// Bind a repository to a folder on this machine.
///
/// Validates the pick before recording it so a mistyped or non-repository
/// folder fails here, with a message naming the problem, instead of surfacing
/// later as an opaque git error on every project surface at once.
#[tauri::command]
pub async fn link_project_local_checkout(
    project_dtag: String,
    clone_url: Option<String>,
    path: String,
) -> Result<ProjectLocalCheckout, String> {
    let dtag = project_dtag.trim().to_string();
    if dtag.is_empty() {
        return Err("Missing repository identifier.".to_string());
    }

    let candidate = PathBuf::from(path.trim());
    if !candidate.is_absolute() {
        return Err("Choose a folder using an absolute path.".to_string());
    }
    let canonical = candidate
        .canonicalize()
        .map_err(|error| format!("That folder is not accessible: {error}"))?;
    if !canonical.is_dir() {
        return Err("That path is not a folder.".to_string());
    }
    if !is_git_checkout(&canonical) {
        return Err(
            "That folder is not a git repository — it has no .git entry. Pick the repository's top-level folder."
                .to_string(),
        );
    }

    let checkout = ProjectLocalCheckout {
        dtag: dtag.clone(),
        path: canonical.display().to_string(),
        clone_url: clone_url
            .map(|url| url.trim().to_string())
            .filter(|url| !url.is_empty()),
    };

    let mut store = load_store();
    store.checkouts.retain(|existing| existing.dtag != dtag);
    store.checkouts.push(checkout.clone());
    save_store(&store)?;
    Ok(checkout)
}

/// Drop the link for `project_dtag`, returning the repository to the by-name
/// lookup under the repos root. The folder itself is never touched.
#[tauri::command]
pub async fn unlink_project_local_checkout(project_dtag: String) -> Result<(), String> {
    let dtag = project_dtag.trim().to_string();
    let mut store = load_store();
    let before = store.checkouts.len();
    store.checkouts.retain(|existing| existing.dtag != dtag);
    if store.checkouts.len() == before {
        return Ok(());
    }
    save_store(&store)
}

/// Every recorded link, including ones whose folder has since disappeared —
/// the UI shows those as broken so the user can relink or remove them.
#[tauri::command]
pub async fn list_project_local_checkouts() -> Result<Vec<ProjectLocalCheckout>, String> {
    Ok(load_store().checkouts)
}

/// What a picked folder looks like as a repository: its directory name and
/// the `origin` remote recorded in its git config.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalRepositoryInfo {
    pub path: String,
    pub name: String,
    pub origin_url: Option<String>,
}

/// Read `origin`'s URL straight out of a checkout's git config.
///
/// Parses the file rather than shelling out to `git remote get-url`, so the
/// create-a-project flow still prefills correctly on a machine where the git
/// binary is missing or unresolvable — the case this whole area exists to
/// survive.
fn origin_url_from_config(repo_dir: &Path) -> Option<String> {
    let dot_git = repo_dir.join(".git");
    let git_dir = if dot_git.is_dir() {
        dot_git
    } else {
        let pointer = std::fs::read_to_string(&dot_git).ok()?;
        let recorded = PathBuf::from(pointer.trim().strip_prefix("gitdir:")?.trim());
        if recorded.is_absolute() {
            recorded
        } else {
            repo_dir.join(recorded)
        }
    };
    let config = std::fs::read_to_string(git_dir.join("config")).ok()?;
    let mut in_origin = false;
    for line in config.lines() {
        let line = line.trim();
        if line.starts_with('[') {
            in_origin = line == r#"[remote "origin"]"#;
            continue;
        }
        if in_origin {
            if let Some((key, value)) = line.split_once('=') {
                if key.trim() == "url" {
                    let url = value.trim();
                    if !url.is_empty() {
                        return Some(url.to_string());
                    }
                }
            }
        }
    }
    None
}

/// Describe a folder so the create-a-project form can prefill from it.
#[tauri::command]
pub async fn inspect_local_repository(path: String) -> Result<LocalRepositoryInfo, String> {
    let candidate = PathBuf::from(path.trim());
    let canonical = candidate
        .canonicalize()
        .map_err(|error| format!("That folder is not accessible: {error}"))?;
    if !is_git_checkout(&canonical) {
        return Err(
            "That folder is not a git repository — it has no .git entry. Pick the repository's top-level folder."
                .to_string(),
        );
    }
    let name = canonical
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_default();
    Ok(LocalRepositoryInfo {
        path: canonical.display().to_string(),
        name,
        origin_url: origin_url_from_config(&canonical),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalized_clone_url_ignores_trailing_slash_and_git_suffix() {
        assert_eq!(
            normalized_clone_url("https://github.com/block/buzz.git"),
            "https://github.com/block/buzz"
        );
        assert_eq!(
            normalized_clone_url("https://github.com/block/buzz/"),
            "https://github.com/block/buzz"
        );
    }

    #[test]
    fn is_git_checkout_accepts_dir_and_file_git_entries() {
        let dir = tempfile::tempdir().expect("tempdir");
        let repo = dir.path().join("repo");
        std::fs::create_dir_all(repo.join(".git")).expect("create .git dir");
        assert!(is_git_checkout(&repo));

        let worktree = dir.path().join("worktree");
        std::fs::create_dir_all(&worktree).expect("create worktree");
        std::fs::write(worktree.join(".git"), b"gitdir: ../repo/.git/worktrees/x")
            .expect("write .git file");
        assert!(is_git_checkout(&worktree));

        let plain = dir.path().join("plain");
        std::fs::create_dir_all(&plain).expect("create plain");
        assert!(!is_git_checkout(&plain));
    }

    #[test]
    fn origin_url_is_read_from_the_config_remote_section() {
        let dir = tempfile::tempdir().expect("tempdir");
        let repo = dir.path().join("repo");
        std::fs::create_dir_all(repo.join(".git")).expect("create .git");
        std::fs::write(
            repo.join(".git").join("config"),
            b"[core]\n\trepositoryformatversion = 0\n[remote \"upstream\"]\n\turl = https://example.test/other\n[remote \"origin\"]\n\turl = https://github.com/block/buzz.git\n",
        )
        .expect("write config");
        assert_eq!(
            origin_url_from_config(&repo).as_deref(),
            Some("https://github.com/block/buzz.git")
        );
    }

    #[test]
    fn origin_url_is_none_without_an_origin_remote() {
        let dir = tempfile::tempdir().expect("tempdir");
        let repo = dir.path().join("repo");
        std::fs::create_dir_all(repo.join(".git")).expect("create .git");
        std::fs::write(
            repo.join(".git").join("config"),
            b"[core]\n\tbare = false\n",
        )
        .expect("write config");
        assert_eq!(origin_url_from_config(&repo), None);
    }
}
