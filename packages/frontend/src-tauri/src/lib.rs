mod exe_icon;
mod local_install;

use local_install::ContentInstall;

#[tauri::command]
fn extract_exe_icon(path: String) -> Result<Vec<u8>, String> {
    exe_icon::extract_largest_icon_png(&path)
}

#[tauri::command]
fn list_installed_games() -> Result<Vec<String>, String> {
    local_install::list_installed_games()
}

#[tauri::command]
fn install_game(game_id: String) -> Result<(), String> {
    local_install::install_game(&game_id)
}

#[tauri::command]
fn uninstall_game(game_id: String) -> Result<(), String> {
    local_install::uninstall_game(&game_id)
}

#[tauri::command]
fn list_installed_content(
    game_id: String,
    kind: String,
) -> Result<Vec<ContentInstall>, String> {
    local_install::list_installed_content(&game_id, &kind)
}

#[tauri::command]
fn install_content(
    game_id: String,
    kind: String,
    row: ContentInstall,
) -> Result<(), String> {
    local_install::install_content(&game_id, &kind, row)
}

#[tauri::command]
fn uninstall_content(
    game_id: String,
    kind: String,
    content_id: String,
) -> Result<(), String> {
    local_install::uninstall_content(&game_id, &kind, &content_id)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(any(target_os = "macos", windows, target_os = "linux"))]
    {
        use tauri::Manager;
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }));
    }

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            extract_exe_icon,
            list_installed_games,
            install_game,
            uninstall_game,
            list_installed_content,
            install_content,
            uninstall_content,
        ])
        .setup(|app| {
            #[cfg(desktop)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                // Dev / AppImage: register scheme at runtime when installers did not.
                let _ = app.deep_link().register_all();
            }

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
