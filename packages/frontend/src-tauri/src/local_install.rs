use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

const CONTENT_KINDS: &[&str] = &["cards", "plugins", "scenes", "clothes", "softmods"];
const INSTANCE_JSON: &str = "instance.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GameInstance {
    pub instance_id: String,
    pub game_id: String,
    pub label: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ContentInstall {
    pub id: String,
    pub version_id: String,
    pub semver: String,
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

pub fn validate_instance_id(instance_id: &str) -> Result<(), String> {
    validate_game_id(instance_id)
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

fn games_root() -> PathBuf {
    echbox_root().join("games")
}

pub fn instance_dir(instance_id: &str) -> Result<PathBuf, String> {
    validate_instance_id(instance_id)?;
    Ok(games_root().join(instance_id))
}

pub fn game_dir(game_id: &str) -> Result<PathBuf, String> {
    instance_dir(game_id)
}

fn instance_json_path(instance_id: &str) -> Result<PathBuf, String> {
    Ok(instance_dir(instance_id)?.join(INSTANCE_JSON))
}

pub fn manifest_path(instance_id: &str, kind: &str) -> Result<PathBuf, String> {
    validate_kind(kind)?;
    Ok(instance_dir(instance_id)?
        .join(".echbox")
        .join(format!("{kind}.jsonl")))
}

fn now_iso8601() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("{ms}")
}

fn write_instance_json(instance: &GameInstance) -> Result<(), String> {
    let path = instance_json_path(&instance.instance_id)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let body = serde_json::to_string_pretty(instance).map_err(|e| e.to_string())?;
    fs::write(path, body).map_err(|e| e.to_string())
}

fn read_instance_json(instance_id: &str) -> Result<GameInstance, String> {
    let path = instance_json_path(instance_id)?;
    let text = fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&text).map_err(|e| e.to_string())
}

fn ensure_echbox_stubs(instance_id: &str) -> Result<(), String> {
    let base = instance_dir(instance_id)?.join(".echbox");
    fs::create_dir_all(&base).map_err(|e| e.to_string())?;
    for kind in CONTENT_KINDS {
        let path = base.join(format!("{kind}.jsonl"));
        if !path.exists() {
            fs::write(&path, "").map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn migrate_legacy_dir(dir_name: &str) -> Result<GameInstance, String> {
    validate_instance_id(dir_name)?;
    let dir = instance_dir(dir_name)?;
    let echbox = dir.join(".echbox");
    if !echbox.is_dir() {
        return Err("not a legacy install".into());
    }
    if instance_json_path(dir_name)?.exists() {
        return read_instance_json(dir_name);
    }
    let instance = GameInstance {
        instance_id: dir_name.to_string(),
        game_id: dir_name.to_string(),
        label: String::new(),
        created_at: now_iso8601(),
    };
    write_instance_json(&instance)?;
    ensure_echbox_stubs(dir_name)?;
    Ok(instance)
}

pub fn ensure_instance(instance_id: &str) -> Result<GameInstance, String> {
    validate_instance_id(instance_id)?;
    let json_path = instance_json_path(instance_id)?;
    if json_path.exists() {
        return read_instance_json(instance_id);
    }
    let dir = instance_dir(instance_id)?;
    if dir.join(".echbox").is_dir() {
        return migrate_legacy_dir(instance_id);
    }
    Err(format!("instance not found: {instance_id}"))
}

fn label_for_new_instance(game_id: &str) -> Result<String, String> {
    let existing = list_installed_instances()?;
    let count = existing
        .iter()
        .filter(|i| i.game_id == game_id)
        .count();
    Ok(match count {
        0 => String::new(),
        n => format!("#{}", n + 1),
    })
}

pub fn install_game(game_id: &str) -> Result<GameInstance, String> {
    validate_game_id(game_id)?;
    let instance_id = Uuid::new_v4().to_string();
    let label = label_for_new_instance(game_id)?;
    let instance = GameInstance {
        instance_id: instance_id.clone(),
        game_id: game_id.to_string(),
        label,
        created_at: now_iso8601(),
    };
    write_instance_json(&instance)?;
    ensure_echbox_stubs(&instance_id)?;
    Ok(instance)
}

pub fn list_installed_instances() -> Result<Vec<GameInstance>, String> {
    let games = games_root();
    if !games.exists() {
        return Ok(vec![]);
    }
    let mut instances = Vec::new();
    for entry in fs::read_dir(&games).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if !entry.file_type().map_err(|e| e.to_string())?.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if validate_instance_id(&name).is_err() {
            continue;
        }
        let path = entry.path();
        if !path.join(".echbox").is_dir() {
            continue;
        }
        let instance = if path.join(INSTANCE_JSON).exists() {
            read_instance_json(&name)?
        } else {
            migrate_legacy_dir(&name)?
        };
        instances.push(instance);
    }
    instances.sort_by(|a, b| {
        a.created_at
            .cmp(&b.created_at)
            .then_with(|| a.instance_id.cmp(&b.instance_id))
    });
    Ok(instances)
}

pub fn uninstall_instance(instance_id: &str) -> Result<(), String> {
    let dir = instance_dir(instance_id)?;
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(())
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
    instance_id: &str,
    kind: &str,
) -> Result<Vec<ContentInstall>, String> {
    ensure_instance(instance_id)?;
    let path = manifest_path(instance_id, kind)?;
    read_jsonl(&path)
}

pub fn install_content(
    instance_id: &str,
    kind: &str,
    row: ContentInstall,
) -> Result<(), String> {
    ensure_instance(instance_id)?;
    ensure_echbox_stubs(instance_id)?;
    let path = manifest_path(instance_id, kind)?;
    let mut rows = read_jsonl(&path)?;
    if let Some(existing) = rows.iter_mut().find(|r| r.id == row.id) {
        *existing = row;
    } else {
        rows.push(row);
    }
    write_jsonl(&path, &rows)
}

pub fn uninstall_content(
    instance_id: &str,
    kind: &str,
    content_id: &str,
) -> Result<(), String> {
    ensure_instance(instance_id)?;
    let path = manifest_path(instance_id, kind)?;
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

    fn sample_row(id: &str) -> ContentInstall {
        ContentInstall {
            id: id.into(),
            version_id: "vid-1".into(),
            semver: "1.0.0".into(),
            title: "One".into(),
            content_hash: Some("abc".into()),
            installed_at: "2026-01-01T00:00:00.000Z".into(),
        }
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
            let inst = install_game("game-1").unwrap();
            for kind in CONTENT_KINDS {
                let path = manifest_path(&inst.instance_id, kind).unwrap();
                assert!(path.exists());
                assert_eq!(fs::read_to_string(path).unwrap(), "");
            }
            assert_eq!(list_installed_instances().unwrap().len(), 1);
            assert!(instance_json_path(&inst.instance_id).unwrap().exists());
        });
    }

    #[test]
    fn install_game_twice_creates_two_instances() {
        with_temp_home(|_home| {
            let a = install_game("same-game").unwrap();
            let b = install_game("same-game").unwrap();
            assert_ne!(a.instance_id, b.instance_id);
            assert_eq!(a.game_id, "same-game");
            assert_eq!(b.game_id, "same-game");
            assert_eq!(a.label, "");
            assert_eq!(b.label, "#2");
            assert_eq!(list_installed_instances().unwrap().len(), 2);
        });
    }

    #[test]
    fn legacy_dir_migrates_on_list() {
        with_temp_home(|_home| {
            let legacy_id = "old-id";
            let base = games_root().join(legacy_id).join(".echbox");
            fs::create_dir_all(&base).unwrap();
            fs::write(base.join("cards.jsonl"), "").unwrap();
            let listed = list_installed_instances().unwrap();
            assert_eq!(listed.len(), 1);
            assert_eq!(listed[0].instance_id, legacy_id);
            assert_eq!(listed[0].game_id, legacy_id);
            assert!(instance_json_path(legacy_id).unwrap().exists());
        });
    }

    #[test]
    fn uninstall_one_instance_keeps_sibling() {
        with_temp_home(|_home| {
            let first = install_game("g").unwrap();
            install_content(&first.instance_id, "cards", sample_row("c1")).unwrap();
            let second = install_game("g").unwrap();
            install_content(&second.instance_id, "cards", sample_row("c2")).unwrap();
            uninstall_instance(&first.instance_id).unwrap();
            let remaining = list_installed_instances().unwrap();
            assert_eq!(remaining.len(), 1);
            assert_eq!(remaining[0].instance_id, second.instance_id);
            let cards = list_installed_content(&second.instance_id, "cards").unwrap();
            assert_eq!(cards.len(), 1);
            assert_eq!(cards[0].id, "c2");
        });
    }

    #[test]
    fn content_is_per_instance() {
        with_temp_home(|_home| {
            let a = install_game("game").unwrap();
            let b = install_game("game").unwrap();
            install_content(&a.instance_id, "cards", sample_row("card-a")).unwrap();
            assert_eq!(list_installed_content(&a.instance_id, "cards").unwrap().len(), 1);
            assert!(list_installed_content(&b.instance_id, "cards").unwrap().is_empty());
        });
    }

    #[test]
    fn install_content_upserts_by_id() {
        with_temp_home(|_home| {
            let inst = install_game("g").unwrap();
            let row = sample_row("c1");
            install_content(&inst.instance_id, "cards", row.clone()).unwrap();
            let mut updated = row;
            updated.version_id = "vid-2".into();
            updated.semver = "2.0.0".into();
            updated.title = "Two".into();
            install_content(&inst.instance_id, "cards", updated.clone()).unwrap();
            let listed = list_installed_content(&inst.instance_id, "cards").unwrap();
            assert_eq!(listed.len(), 1);
            assert_eq!(listed[0].semver, "2.0.0");
            assert_eq!(listed[0].version_id, "vid-2");
            assert_eq!(listed[0].title, "Two");
        });
    }

    #[test]
    fn uninstall_content_removes_row() {
        with_temp_home(|_home| {
            let inst = install_game("g").unwrap();
            install_content(
                &inst.instance_id,
                "plugins",
                ContentInstall {
                    id: "p1".into(),
                    version_id: "vid-p1".into(),
                    semver: "1.0.0".into(),
                    title: "P".into(),
                    content_hash: None,
                    installed_at: "t".into(),
                },
            )
            .unwrap();
            uninstall_content(&inst.instance_id, "plugins", "p1").unwrap();
            assert!(list_installed_content(&inst.instance_id, "plugins")
                .unwrap()
                .is_empty());
        });
    }
}
