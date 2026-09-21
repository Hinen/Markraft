mod atomic_write;
mod encoding;
mod files;
use files::FileState;
use tauri::{Emitter,Manager};
fn queue(app:&tauri::AppHandle,paths:impl Iterator<Item=std::path::PathBuf>) {
    let state=app.state::<FileState>();
    state.pending.lock().unwrap().extend(paths.filter(|p|p.is_file()));
    let _=app.emit("files-pending",());
    if let Some(window)=app.get_webview_window("main") {let _=window.unminimize();let _=window.set_focus();}
}
#[cfg_attr(mobile,tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(FileState::default())
        .plugin(tauri_plugin_single_instance::init(|app,args,cwd|{queue(app,args.into_iter().skip(1).map(|p|std::path::Path::new(&cwd).join(p)));}))
        .setup(|app|{queue(app.handle(),std::env::args_os().skip(1).map(std::path::PathBuf::from));Ok(())})
        .on_window_event(|window,event|{if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop{paths,..})=event {queue(window.app_handle(),paths.clone().into_iter());}})
        .invoke_handler(tauri::generate_handler![files::open_dialog,files::take_pending,files::read_document,files::check_document,files::save_document,files::local_image,files::open_link])
        .build(tauri::generate_context!()).expect("Unable to start Markraft")
        .run(|app,event|{#[cfg(target_os="macos")] if let tauri::RunEvent::Opened{urls}=event {queue(app,urls.into_iter().filter_map(|url|url.to_file_path().ok()));} #[cfg(not(target_os="macos"))] let _=(app,event);});
}
