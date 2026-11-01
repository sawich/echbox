use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

const CONTENT_KINDS: &[&str] = &["cards", "plugins", "scenes", "softmods"];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ContentInstall {
    pub id: String,
    pub version: i32,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_hash: Option<String>,
    pub installed_at: String,
}

pub fn validate_game_id(game_id: &str) -> Result<(), String> {
    if game_id.is_empty()
        || game_id.contains('/')
        || game_id.contains('\\')
        || game_id.contains("..")
    {
        return Err("invalid game id".into());
    }
    Ok(())
}

pub fn validate_kind(kind: &str) -> Result<(), String> {
    if CONTENT_KINDS.contains(&kind) {
        Ok(())
    } else {
        Err(format!("invalid content kind: {kind}"))
    }
}

pub fn echbox_root() -> PathBuf {
    dirs_home()
        .map(|h| h.join(".echbox"))
        .unwrap_or_else(|| PathBuf::from(".echbox"))
}

fn dirs_home() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

pub fn game_dir(game_id: &str) -> Result<PathBuf, String> {
    validate_game_id(game_id)?;
    Ok(echbox_root().join("games").join(game_id))
}

pub fn manifest_path(game_id: &str, kind: &str) -> Result<PathBuf, String> {
    validate_kind(kind)?;
    Ok(game_dir(game_id)?.join(".echbox").join(format!("{kind}.jsonl")))
}

pub fn install_game(game_id: &str) -> Result<(), String> {
    let base = game_dir(game_id)?.join(".echbox");
    fs::create_dir_all(&base).map_err(|e| e.to_string())?;
    for kind in CONTENT_KINDS {
        let path = base.join(format!("{kind}.jsonl"));
        if !path.exists() {
            fs::write(&path, "").map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

pub fn uninstall_game(game_id: &str) -> Result<(), String> {
    let dir = game_dir(game_id)?;
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn list_installed_games() -> Result<Vec<String>, String> {
    let games = echbox_root().join("games");
    if !games.exists() {
        return Ok(vec![]);
    }
    let mut ids = Vec::new();
    for entry in fs::read_dir(&games).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if !entry.file_type().map_err(|e| e.to_string())?.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if validate_game_id(&name).is_err() {
            continue;
        }
        let marker = entry.path().join(".echbox");
        if marker.is_dir() {
            ids.push(name);
        }
    }
    ids.sort();
    Ok(ids)
}

fn read_jsonl(path: &Path) -> Result<Vec<ContentInstall>, String> {
    if !path.exists() {
        return Ok(vec![]);
    }
    let text = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let row: ContentInstall =
            serde_json::from_str(trimmed).map_err(|e| e.to_string())?;
        out.push(row);
    }
    Ok(out)
}

fn write_jsonl(path: &Path, rows: &[ContentInstall]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut body = String::new();
    for row in rows {
        body.push_str(&serde_json::to_string(row).map_err(|e| e.to_string())?);
        body.push('\n');
    }
    fs::write(path, body).map_err(|e| e.to_string())
}

pub fn list_installed_content(
    game_id: &str,
    kind: &str,
) -> Result<Vec<ContentInstall>, String> {
    let path = manifest_path(game_id, kind)?;
    read_jsonl(&path)
}

pub fn install_content(
    game_id: &str,
    kind: &str,
    row: ContentInstall,
) -> Result<(), String> {
    install_game(game_id)?;
    let path = manifest_path(game_id, kind)?;
    let mut rows = read_jsonl(&path)?;
    if let Some(existing) = rows.iter_mut().find(|r| r.id == row.id) {
        *existing = row;
    } else {
        rows.push(row);
    }
    write_jsonl(&path, &rows)
}

pub fn uninstall_content(
    game_id: &str,
    kind: &str,
    content_id: &str,
) -> Result<(), String> {
    let path = manifest_path(game_id, kind)?;
    let rows: Vec<_> = read_jsonl(&path)?
        .into_iter()
        .filter(|r| r.id != content_id)
        .collect();
    write_jsonl(&path, &rows)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    static ENV_LOCK: Mutex<()> = Mutex::new(());

    fn with_temp_home<F: FnOnce(PathBuf)>(f: F) {
        let _guard = ENV_LOCK.lock().unwrap();
        let dir = std::env::temp_dir().join(format!(
            "echbox-local-install-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        // SAFETY: serialized by ENV_LOCK for tests only
        unsafe {
            std::env::set_var("HOME", &dir);
        }
        f(dir.clone());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn rejects_path_traversal_game_id() {
        assert!(validate_game_id("..").is_err());
        assert!(validate_game_id("../x").is_err());
        assert!(validate_game_id("a/b").is_err());
        assert!(validate_game_id("ok-uuid").is_ok());
    }

    #[test]
    fn install_game_creates_empty_jsonl() {
        with_temp_home(|_home| {
            install_game("game-1").unwrap();
            for kind in CONTENT_KINDS {
                let path = manifest_path("game-1", kind).unwrap();
                assert!(path.exists());
                assert_eq!(fs::read_to_string(path).unwrap(), "");
            }
            assert_eq!(list_installed_games().unwrap(), vec!["game-1".to_string()]);
        });
    }

    #[test]
    fn install_content_upserts_by_id() {
        with_temp_home(|_home| {
            install_game("g").unwrap();
            let row = ContentInstall {
                id: "c1".into(),
                version: 1,
                title: "One".into(),
                content_hash: Some("abc".into()),
                installed_at: "2026-01-01T00:00:00.000Z".into(),
            };
            install_content("g", "cards", row.clone()).unwrap();
            let mut updated = row;
            updated.version = 2;
            updated.title = "Two".into();
            install_content("g", "cards", updated.clone()).unwrap();
            let listed = list_installed_content("g", "cards").unwrap();
            assert_eq!(listed.len(), 1);
            assert_eq!(listed[0].version, 2);
            assert_eq!(listed[0].title, "Two");
        });
    }

    #[test]
    fn uninstall_content_removes_row() {
        with_temp_home(|_home| {
            install_game("g").unwrap();
            install_content(
                "g",
                "plugins",
                ContentInstall {
                    id: "p1".into(),
                    version: 1,
                    title: "P".into(),
                    content_hash: None,
                    installed_at: "t".into(),
                },
            )
            .unwrap();
            uninstall_content("g", "plugins", "p1").unwrap();
            assert!(list_installed_content("g", "plugins").unwrap().is_empty());
        });
    }
}
