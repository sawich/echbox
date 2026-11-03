use std::io::Cursor;
use std::path::Path;

use pelite::FileMap;

/// Extract the largest embedded icon from a Windows PE `.exe` as PNG bytes.
pub fn extract_largest_icon_png(path: &str) -> Result<Vec<u8>, String> {
    let path = Path::new(path);
    if !path.is_file() {
        return Err("file not found".into());
    }
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase());
    if ext.as_deref() != Some("exe") {
        return Err("expected an .exe file".into());
    }

    let map = FileMap::open(path).map_err(|e| format!("open pe: {e}"))?;
    let resources = load_resources(map.as_ref())?;

    let mut best: Option<(u32, Vec<u8>)> = None;
    let mut saw_group = false;

    for (_name, group) in resources.icons().filter_map(Result::ok) {
        saw_group = true;
        let mut ico_bytes = Vec::new();
        group
            .write(&mut ico_bytes)
            .map_err(|e| format!("assemble ico: {e}"))?;

        let icon_dir =
            ico::IconDir::read(Cursor::new(&ico_bytes)).map_err(|e| format!("parse ico: {e}"))?;

        for entry in icon_dir.entries() {
            let img = entry.decode().map_err(|e| format!("decode icon: {e}"))?;
            let w = img.width();
            let h = img.height();
            let area = w.saturating_mul(h);
            if best.as_ref().map(|(a, _)| area > *a).unwrap_or(true) {
                let png = encode_png_rgba(w, h, img.rgba_data())?;
                best = Some((area, png));
            }
        }
    }

    if !saw_group {
        return Err("no icons found in executable".into());
    }
    best.map(|(_, png)| png)
        .ok_or_else(|| "no decodable icon images".into())
}

fn load_resources(
    bytes: &[u8],
) -> Result<pelite::resources::Resources<'_>, String> {
    match pelite::pe64::PeFile::from_bytes(bytes) {
        Ok(pe) => {
            use pelite::pe64::Pe;
            pe.resources().map_err(map_pe_err)
        }
        Err(_) => {
            use pelite::pe32::Pe;
            let pe = pelite::pe32::PeFile::from_bytes(bytes).map_err(map_pe_err)?;
            pe.resources().map_err(map_pe_err)
        }
    }
}

fn map_pe_err(err: impl std::fmt::Display) -> String {
    format!("pe: {err}")
}

fn encode_png_rgba(width: u32, height: u32, rgba: &[u8]) -> Result<Vec<u8>, String> {
    let mut png = Vec::new();
    {
        let mut enc = png::Encoder::new(&mut png, width, height);
        enc.set_color(png::ColorType::Rgba);
        enc.set_depth(png::BitDepth::Eight);
        let mut writer = enc
            .write_header()
            .map_err(|e| format!("png header: {e}"))?;
        writer
            .write_image_data(rgba)
            .map_err(|e| format!("png data: {e}"))?;
    }
    Ok(png)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_largest_from_koikatu_fixture() {
        let path = "/home/sawich/ownCloud/Other/Koikatu.exe";
        if !Path::new(path).is_file() {
            return;
        }
        let png = extract_largest_icon_png(path).expect("extract");
        assert!(png.starts_with(b"\x89PNG"));
        assert!(png.len() > 1000);
    }
}
