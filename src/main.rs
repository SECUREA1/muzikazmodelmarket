use std::{
    collections::{HashMap, HashSet},
    env, fs,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::{Component, Path, PathBuf},
    sync::{Arc, RwLock},
    thread,
    time::{SystemTime, UNIX_EPOCH},
};
const NOT_FOUND_BODY: &str = "404 - File not found";
#[derive(Clone, Debug)]
struct Model {
    id: String,
    title: String,
    creator: String,
    description: String,
    category: String,
    placement_type: String,
    model_type: String,
    model_url: String,
    ios_model_url: String,
    thumbnail_url: String,
    published_at: String,
    updated_at: String,
    status: String,
    featured: bool,
    spawn_position: String,
    scale: f64,
    rotation: String,
    environment: String,
}
#[derive(Clone, Debug)]
struct Asset {
    id: String,
    owner_user_id: String,
    owner_display_name: String,
    owner_email: String,
    uploaded_by_role: String,
    title: String,
    description: String,
    original_filename: String,
    stored_filename: String,
    file_type: String,
    mime_type: String,
    file_size: usize,
    public_url: String,
    thumbnail_url: String,
    category: String,
    tags: String,
    status: String,
    visibility: String,
    intended_use: String,
    related_model_id: String,
    product_assignment: String,
    collection_assignment: String,
    publish_location: String,
    approved_by: String,
    approved_at: String,
    published_at: String,
    moderator_note: String,
    featured: bool,
    archived: bool,
    created_at: String,
    updated_at: String,
}
#[derive(Clone, Debug)]
struct AssetModelAssignment {
    id: String,
    asset_id: String,
    model_id: String,
    owner_user_id: String,
    display_type: String,
    material_slot: String,
    position: String,
    rotation: String,
    scale: String,
    opacity: f64,
    repeat_x: f64,
    repeat_y: f64,
    approved: bool,
    published: bool,
    created_at: String,
    updated_at: String,
}
#[derive(Clone, Debug)]
struct AssetDerivative {
    id: String,
    asset_id: String,
    kind: String,
    url: String,
    status: String,
    created_at: String,
}
#[derive(Clone, Debug)]
struct Environment {
    id: String,
    name: String,
    description: String,
    model_url: String,
    thumbnail_url: String,
    original_filename: String,
    file_size: usize,
    scale: f64,
    visibility: String,
    spawn: String,
    rotation: String,
    collision_mode: String,
    created_at: String,
    updated_at: String,
}
#[derive(Clone, Debug)]
struct Avatar {
    id: String,
    house_id: String,
    owner_id: String,
    username: String,
    avatar_name: String,
    avatar_type: String,
    avatar_url: String,
    thumbnail_url: String,
    message: String,
    position: String,
    rotation: String,
    scale: String,
    room_id: String,
    visibility: String,
    created_at: String,
    updated_at: String,
}
#[derive(Clone, Debug)]
struct AvatarProfile {
    user_id: String,
    asset_id: String,
    model_url: String,
    display_name: String,
    access_type: String,
    selected_at: String,
    scale: f64,
}
#[derive(Clone, Debug)]
struct HouseUser {
    session_id: String,
    username: String,
    color: String,
    room_id: String,
    position: String,
    rotation: String,
    avatar_url: String,
    message: String,
    last_active: u64,
}
#[derive(Clone, Debug)]
struct ChatMessage {
    id: String,
    session_id: String,
    username: String,
    message: String,
    created_at: String,
}
#[derive(Clone)]
struct State {
    root: PathBuf,
    data: PathBuf,
    uploads: PathBuf,
    public_base: String,
    max_bytes: usize,
    admin_token: String,
    admin_sessions: Arc<RwLock<HashSet<String>>>,
    models: Arc<RwLock<Vec<Model>>>,
    environments: Arc<RwLock<Vec<Environment>>>,
    avatars: Arc<RwLock<Vec<Avatar>>>,
    avatar_profiles: Arc<RwLock<Vec<AvatarProfile>>>,
    assets: Arc<RwLock<Vec<Asset>>>,
    assignments: Arc<RwLock<Vec<AssetModelAssignment>>>,
    derivatives: Arc<RwLock<Vec<AssetDerivative>>>,
    house_users: Arc<RwLock<Vec<HouseUser>>>,
    chat_messages: Arc<RwLock<Vec<ChatMessage>>>,
}
fn main() -> std::io::Result<()> {
    let port = env::var("PORT").unwrap_or("4173".into());
    let data = PathBuf::from(env::var("MUZIKAZ_DATA_DIR").unwrap_or("data".into()));
    let uploads = PathBuf::from(
        env::var("UPLOAD_STORAGE_PATH")
            .unwrap_or_else(|_| data.join("uploads/models").display().to_string()),
    );
    fs::create_dir_all(&uploads)?;
    let state = State {
        root: site_root(),
        models: Arc::new(RwLock::new(load_models(
            &data.join("published-models.json"),
        ))),
        environments: Arc::new(RwLock::new(load_environments(
            &data.join("environments.json"),
        ))),
        avatars: Arc::new(RwLock::new(load_avatars(&data.join("house-avatars.json")))),
        avatar_profiles: Arc::new(RwLock::new(load_avatar_profiles(
            &data.join("avatar-profiles.json"),
        ))),
        assets: Arc::new(RwLock::new(load_assets(&data.join("assets.json")))),
        assignments: Arc::new(RwLock::new(load_assignments(
            &data.join("asset-model-assignments.json"),
        ))),
        derivatives: Arc::new(RwLock::new(load_derivatives(
            &data.join("asset-derivatives.json"),
        ))),
        data,
        uploads,
        public_base: env::var("PUBLIC_BASE_URL").unwrap_or_default(),
        max_bytes: env::var("MAX_MODEL_UPLOAD_MB")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(50)
            * 1024
            * 1024,
        admin_token: env::var("ADMIN_PUBLISH_TOKEN").unwrap_or_default(),
        admin_sessions: Arc::new(RwLock::new(HashSet::new())),
        house_users: Arc::new(RwLock::new(Vec::new())),
        chat_messages: Arc::new(RwLock::new(Vec::new())),
    };
    let listener = TcpListener::bind(format!("0.0.0.0:{port}"))?;
    println!("Serving {} on http://0.0.0.0:{port}", state.root.display());
    println!(
        "Runtime configuration: storage={}, public_base_url={}, admin_auth={}",
        if env::var_os("MUZIKAZ_DATA_DIR").is_some() {
            "configured"
        } else {
            "ephemeral-default"
        },
        if state.public_base.is_empty() {
            "same-origin"
        } else {
            "configured"
        },
        if state.admin_token.is_empty() {
            "disabled"
        } else {
            "configured"
        }
    );
    for stream in listener.incoming() {
        let st = state.clone();
        thread::spawn(move || {
            if let Ok(stream) = stream {
                let _ = handle(stream, st);
            }
        });
    }
    Ok(())
}
fn site_root() -> PathBuf {
    let d = PathBuf::from("dist");
    if d.join("index.html").is_file() {
        d
    } else {
        PathBuf::from(".")
    }
}
fn handle(mut s: TcpStream, st: State) -> std::io::Result<()> {
    let mut buf = Vec::new();
    let mut tmp = [0; 8192];
    let n = s.read(&mut tmp)?;
    if n == 0 {
        return Ok(());
    }
    buf.extend_from_slice(&tmp[..n]);
    let header_end = find_bytes(&buf, b"\r\n\r\n").unwrap_or(buf.len());
    let header = String::from_utf8_lossy(&buf[..header_end]).to_string();
    let mut lines = header.lines();
    let first = lines.next().unwrap_or("");
    let mut parts = first.split_whitespace();
    let method = parts.next().unwrap_or("");
    let target = parts.next().unwrap_or("/");
    let headers = parse_headers(lines.collect::<Vec<_>>());
    let len = headers
        .get("content-length")
        .and_then(|v| v.parse::<usize>().ok())
        .unwrap_or(0);
    while buf.len() < header_end + 4 + len {
        let n = s.read(&mut tmp)?;
        if n == 0 {
            break;
        }
        buf.extend_from_slice(&tmp[..n]);
        if buf.len() > st.max_bytes + 2_000_000 {
            return json(
                &mut s,
                413,
                false,
                "{}",
                "Request too large",
                method == "HEAD",
            );
        }
    }
    let body = if header_end + 4 <= buf.len() {
        &buf[header_end + 4..]
    } else {
        &[]
    };
    println!("{method} {target}");
    if method == "OPTIONS" {
        return write_resp(
            &mut s,
            "204 No Content",
            "text/plain; charset=utf-8",
            b"",
            false,
        );
    }
    if (method == "GET" || method == "HEAD") && (target == "/health" || target == "/healthz") {
        return health(&mut s, &st, method == "HEAD");
    }
    if target.starts_with("/api/") {
        return api(&mut s, &st, method, target, &headers, body);
    };
    static_file(&mut s, &st, method, target)
}
fn api(
    s: &mut TcpStream,
    st: &State,
    method: &str,
    target: &str,
    headers: &HashMap<String, String>,
    body: &[u8],
) -> std::io::Result<()> {
    let path = target.split('?').next().unwrap_or(target);
    match (method, path) {
        ("GET", "/api/health") | ("HEAD", "/api/health") => health(s, st, method == "HEAD"),
        ("POST", "/api/admin/login") => admin_login(s, st, body),
        ("GET", "/api/environments") => list_environments(s, st),
        ("GET", "/api/avatar-options") => avatar_options(s, st, headers),
        ("GET", "/api/profile/avatar") => get_avatar_profile(s, st, headers),
        ("PUT", "/api/profile/avatar") => put_avatar_profile(s, st, headers, body),
        ("POST", "/api/environments/upload") => upload_environment(s, st, headers, body),
        ("GET", "/api/assets") => list_assets(s, st, headers, "all"),
        ("GET", "/api/assets/mine") => list_assets(s, st, headers, "mine"),
        ("GET", "/api/assets/public") => list_assets(s, st, headers, "public"),
        ("POST", "/api/assets/upload") => upload_asset(s, st, headers, body),
        ("GET", "/api/admin/assets/pending") => admin_pending(s, st, headers),
        ("GET", "/api/admin/analytics") => admin_analytics(s, st, headers),
        ("GET", "/api/admin/storage") => admin_storage(s, st, headers),
        ("GET", "/api/models/mine") => list_models(s, st, headers, "mine"),
        ("GET", "/api/models/public") => list_models(s, st, headers, "public"),
        (_, "/api/avatars/published") if method == "GET" => {
            let mut v: Vec<_> = st
                .models
                .read()
                .unwrap()
                .iter()
                .filter(|m| m.status == "published")
                .cloned()
                .collect();
            v.sort_by(|a, b| b.published_at.cmp(&a.published_at));
            json(
                s,
                200,
                true,
                &format!(
                    "[{}]",
                    v.iter().map(model_json).collect::<Vec<_>>().join(",")
                ),
                "Published avatars loaded",
                false,
            )
        }
        ("GET", "/api/models") => {
            let mut v: Vec<_> = st
                .models
                .read()
                .unwrap()
                .iter()
                .filter(|m| m.status == "published")
                .cloned()
                .collect();
            v.sort_by(|a, b| b.published_at.cmp(&a.published_at));
            json(
                s,
                200,
                true,
                &format!(
                    "[{}]",
                    v.iter().map(model_json).collect::<Vec<_>>().join(",")
                ),
                "Published models loaded",
                false,
            )
        }
        ("POST", "/api/models/upload") => upload_model_asset(s, st, headers, body),
        ("POST", "/api/uploads/avatar") => upload_avatar(s, st, headers, body),
        ("POST", "/api/models") | ("POST", "/api/avatars/published") => {
            if !is_admin(headers, st) {
                json(s, 403, false, "{}", "Admin authorization required", false)
            } else {
                create(s, st, body)
            }
        }
        _ if method == "GET" && path.starts_with("/api/houses/") && path.ends_with("/avatars") => {
            house_avatars(s, st, method, path, headers, body)
        }
        _ if method == "POST" && path.starts_with("/api/houses/") && path.ends_with("/avatars") => {
            house_avatars(s, st, method, path, headers, body)
        }
        _ if method == "DELETE"
            && path.starts_with("/api/houses/")
            && path.contains("/avatars/") =>
        {
            house_avatars(s, st, method, path, headers, body)
        }
        _ if path.starts_with("/api/houses/") && path.ends_with("/presence") => {
            house_presence(s, st, method, headers, body)
        }
        _ if path.starts_with("/api/houses/") && path.ends_with("/presence/leave") => {
            house_leave(s, st, method, target, headers)
        }
        _ if path.starts_with("/api/houses/") && path.ends_with("/chat") => {
            house_chat(s, st, method, headers, body)
        }
        _ if method == "GET" && path.starts_with("/api/houses/") && path.ends_with("/events") => {
            sse_ready(s)
        }

        _ if method == "GET" && path.starts_with("/api/assets/") => {
            get_asset(s, st, headers, &path[12..])
        }
        _ if method == "PATCH" && path.starts_with("/api/assets/") => {
            patch_asset(s, st, headers, &path[12..], body)
        }
        _ if method == "DELETE" && path.starts_with("/api/assets/") => {
            delete_asset(s, st, headers, &path[12..])
        }
        _ if method == "POST" && path.starts_with("/api/assets/") && path.ends_with("/submit") => {
            asset_action(
                s,
                st,
                headers,
                path,
                "pending_review",
                "Submitted for approval",
                body,
            )
        }
        _ if method == "POST" && path.starts_with("/api/assets/") && path.ends_with("/approve") => {
            asset_action(
                s,
                st,
                headers,
                path,
                "approved",
                "Approved and ready to publish",
                body,
            )
        }
        _ if method == "POST" && path.starts_with("/api/assets/") && path.ends_with("/reject") => {
            asset_action(
                s,
                st,
                headers,
                path,
                "rejected",
                "Rejected: changes required",
                body,
            )
        }
        _ if method == "POST" && path.starts_with("/api/assets/") && path.ends_with("/publish") => {
            asset_action(
                s,
                st,
                headers,
                path,
                "published",
                "Published to live model space",
                body,
            )
        }
        _ if method == "POST"
            && path.starts_with("/api/assets/")
            && path.ends_with("/unpublish") =>
        {
            asset_action(
                s,
                st,
                headers,
                path,
                "unpublished",
                "Asset unpublished",
                body,
            )
        }
        _ if method == "POST" && path.starts_with("/api/assets/") && path.ends_with("/archive") => {
            asset_action(s, st, headers, path, "archived", "Asset archived", body)
        }
        _ if method == "POST"
            && path.starts_with("/api/assets/")
            && path.ends_with("/assign-model") =>
        {
            assign_model(s, st, headers, path, body)
        }
        _ if method == "DELETE"
            && path.starts_with("/api/assets/")
            && path.contains("/assign-model/") =>
        {
            delete_assignment(s, st, headers, path)
        }
        _ if method == "GET" && path.starts_with("/api/models/") => {
            let id = &path[12..];
            match st
                .models
                .read()
                .unwrap()
                .iter()
                .find(|m| m.id == id && m.status == "published")
            {
                Some(m) => json(
                    s,
                    200,
                    true,
                    &model_json(m),
                    "Published model loaded",
                    false,
                ),
                None => json(s, 404, false, "{}", "Model not found", false),
            }
        }
        _ if method == "PATCH" && path.starts_with("/api/models/") => {
            patch(s, st, &path[12..], body)
        }
        _ if method == "DELETE" && path.starts_with("/api/models/") => {
            if st.admin_token.is_empty() || headers.get("x-admin-token") != Some(&st.admin_token) {
                json(
                    s,
                    403,
                    false,
                    "{}",
                    "Deletion requires admin authorization",
                    false,
                )
            } else {
                let id = &path[12..];
                let mut v = st.models.write().unwrap();
                v.retain(|m| m.id != id);
                persist(st, &v);
                json(
                    s,
                    200,
                    true,
                    &format!("{{\"id\":\"{}\"}}", esc(id)),
                    "Model deleted",
                    false,
                )
            }
        }
        _ => json(s, 404, false, "{}", "API route not found", false),
    }
}
fn health(s: &mut TcpStream, st: &State, head: bool) -> std::io::Result<()> {
    json(
        s,
        200,
        true,
        &format!(
            "{{\"service\":\"ok\",\"storage\":\"ok\",\"persistentStorageConfigured\":{},\"publicBaseConfigured\":{},\"adminAuthConfigured\":{},\"modelCount\":{}}}",
            st.data.starts_with("/var/data"),
            !st.public_base.is_empty(),
            !st.admin_token.is_empty(),
            st.models.read().unwrap().len()
        ),
        "Service healthy",
        head,
    )
}
fn avatar_catalog(st: &State) -> Vec<(String, String, String, String, String, f64)> {
    let manifest = fs::read_to_string(st.root.join("public/models/avatars.json"))
        .unwrap_or_else(|_| "[]".into());
    let mut catalog: Vec<_> = manifest
        .split('{')
        .skip(1)
        .map(|part| format!("{{{part}"))
        .filter_map(|item| {
            let id = val(&item, "id");
            let url = val(&item, "modelUrl");
            if id.is_empty() || url.is_empty() {
                None
            } else {
                Some((
                    id,
                    val(&item, "name"),
                    val(&item, "creator"),
                    url,
                    "Public".into(),
                    val(&item, "scale").parse().unwrap_or(1.0),
                ))
            }
        })
        .collect();
    for model in st.models.read().unwrap().iter().filter(|model| {
        model.status == "published"
            && model
                .model_url
                .to_ascii_lowercase()
                .split(['?', '#'])
                .next()
                .unwrap_or("")
                .ends_with(".glb")
    }) {
        if !catalog.iter().any(|item| item.0 == model.id) {
            catalog.push((
                model.id.clone(),
                model.title.clone(),
                model.creator.clone(),
                model.model_url.clone(),
                "Shared".into(),
                model.scale,
            ));
        }
    }
    catalog
}
fn avatar_option_json(option: &(String, String, String, String, String, f64)) -> String {
    format!(
        "{{\"id\":\"{}\",\"name\":\"{}\",\"creator\":\"{}\",\"modelUrl\":\"{}\",\"source\":\"{}\",\"accessType\":\"{}\",\"scale\":{}}}",
        esc(&option.0), esc(&option.1), esc(&option.2), esc(&option.3), esc(&option.4), option.4.to_ascii_lowercase(), option.5
    )
}
fn avatar_options(
    s: &mut TcpStream,
    st: &State,
    _headers: &HashMap<String, String>,
) -> std::io::Result<()> {
    let catalog = avatar_catalog(st);
    json(
        s,
        200,
        true,
        &format!(
            "[{}]",
            catalog
                .iter()
                .map(avatar_option_json)
                .collect::<Vec<_>>()
                .join(",")
        ),
        "Avatar options loaded",
        false,
    )
}
fn profile_json(profile: &AvatarProfile) -> String {
    format!(
        "{{\"userId\":\"{}\",\"assetId\":\"{}\",\"modelUrl\":\"{}\",\"displayName\":\"{}\",\"accessType\":\"{}\",\"selectedAt\":\"{}\",\"scale\":{},\"rotation\":{{\"x\":0,\"y\":0,\"z\":0}},\"animation\":\"auto\"}}",
        esc(&profile.user_id), esc(&profile.asset_id), esc(&profile.model_url), esc(&profile.display_name), esc(&profile.access_type), esc(&profile.selected_at), profile.scale
    )
}
fn avatar_user(headers: &HashMap<String, String>) -> String {
    trim(
        headers
            .get("x-user-id")
            .cloned()
            .unwrap_or_default()
            .to_ascii_lowercase(),
        120,
    )
}
fn get_avatar_profile(
    s: &mut TcpStream,
    st: &State,
    headers: &HashMap<String, String>,
) -> std::io::Result<()> {
    let user_id = avatar_user(headers);
    if user_id.is_empty() {
        return json(
            s,
            401,
            false,
            "{}",
            "Bottle member identity is required",
            false,
        );
    }
    let catalog = avatar_catalog(st);
    let profiles = st.avatar_profiles.read().unwrap();
    let profile = profiles.iter().find(|profile| {
        profile.user_id == user_id && catalog.iter().any(|option| option.0 == profile.asset_id)
    });
    match profile {
        Some(profile) => json(
            s,
            200,
            true,
            &format!("{{\"valid\":true,\"profile\":{}}}", profile_json(profile)),
            "Designated avatar loaded",
            false,
        ),
        None => json(
            s,
            200,
            true,
            "{\"valid\":false,\"reason\":\"not-selected\",\"profile\":null}",
            "Choose a designated avatar",
            false,
        ),
    }
}
fn put_avatar_profile(
    s: &mut TcpStream,
    st: &State,
    headers: &HashMap<String, String>,
    body: &[u8],
) -> std::io::Result<()> {
    let user_id = avatar_user(headers);
    if user_id.is_empty() {
        return json(
            s,
            401,
            false,
            "{}",
            "Bottle member identity is required",
            false,
        );
    }
    let input = String::from_utf8_lossy(body);
    let asset_id = trim(val(&input, "assetId"), 160);
    let option = avatar_catalog(st)
        .into_iter()
        .find(|option| option.0 == asset_id);
    let Some(option) = option else {
        return json(
            s,
            403,
            false,
            "{}",
            "Avatar is unavailable or is not approved for this account",
            false,
        );
    };
    let profile = AvatarProfile {
        user_id: user_id.clone(),
        asset_id: option.0,
        model_url: option.3,
        display_name: option.1,
        access_type: option.4.to_ascii_lowercase(),
        selected_at: now(),
        scale: option.5.clamp(0.1, 4.0),
    };
    let mut profiles = st.avatar_profiles.write().unwrap();
    if let Some(existing) = profiles.iter_mut().find(|item| item.user_id == user_id) {
        *existing = profile.clone();
    } else {
        profiles.push(profile.clone());
    }
    persist_avatar_profiles(st, &profiles);
    json(
        s,
        200,
        true,
        &format!("{{\"valid\":true,\"profile\":{}}}", profile_json(&profile)),
        "Designated avatar saved",
        false,
    )
}
fn list_environments(s: &mut TcpStream, st: &State) -> std::io::Result<()> {
    let mut worlds: Vec<_> = st
        .environments
        .read()
        .unwrap()
        .iter()
        .filter(|e| e.visibility == "public")
        .cloned()
        .collect();
    worlds.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    json(
        s,
        200,
        true,
        &format!(
            "[{}]",
            worlds
                .iter()
                .map(environment_json)
                .collect::<Vec<_>>()
                .join(",")
        ),
        "Shared environments loaded",
        false,
    )
}
fn upload_environment(
    s: &mut TcpStream,
    st: &State,
    h: &HashMap<String, String>,
    body: &[u8],
) -> std::io::Result<()> {
    if !is_admin(h, st) {
        return json(s, 403, false, "{}", "Admin authorization required", false);
    }
    let boundary = h
        .get("content-type")
        .and_then(|v| v.split("boundary=").nth(1))
        .unwrap_or("")
        .trim_matches('"');
    if boundary.is_empty() {
        return json(s, 400, false, "{}", "Invalid environment upload", false);
    }
    let parts = parse_multipart(body, boundary);
    let Some(file) = parts
        .iter()
        .find(|p| p.name == "environment" && !p.filename.is_empty())
    else {
        return json(s, 400, false, "{}", "Choose a .glb environment file", false);
    };
    if file.data.len() > st.max_bytes {
        return json(
            s,
            413,
            false,
            "{}",
            "Environment exceeds configured maximum size",
            false,
        );
    }
    if ext(&file.filename) != Some("glb") || file.data.len() < 20 || !file.data.starts_with(b"glTF")
    {
        return json(
            s,
            400,
            false,
            "{}",
            "Environment must be a valid GLB binary",
            false,
        );
    }
    let declared =
        u32::from_le_bytes([file.data[8], file.data[9], file.data[10], file.data[11]]) as usize;
    if declared != file.data.len() {
        return json(s, 400, false, "{}", "Malformed GLB header length", false);
    }
    let stored = format!("environment-{}.glb", uuid());
    fs::write(st.uploads.join(&stored), &file.data)?;
    let public = if st.public_base.is_empty() {
        format!("/uploads/{stored}")
    } else {
        format!("{}/uploads/{stored}", st.public_base.trim_end_matches('/'))
    };
    let field = |name: &str| {
        parts
            .iter()
            .find(|p| p.name == name)
            .map(|p| String::from_utf8_lossy(&p.data).trim().to_string())
            .unwrap_or_default()
    };
    let stamp = now();
    let e = Environment {
        id: uuid(),
        name: trim(field("name"), 120),
        description: trim(field("description"), 500),
        model_url: public,
        thumbnail_url: String::new(),
        original_filename: trim(file.filename.clone(), 120),
        file_size: file.data.len(),
        scale: field("scale").parse().unwrap_or(1.0),
        visibility: "public".into(),
        spawn: format!(
            "{{\"x\":{},\"y\":{},\"z\":{},\"rotationY\":{}}}",
            field("spawnX").parse::<f64>().unwrap_or(0.0),
            field("spawnY").parse::<f64>().unwrap_or(1.0),
            field("spawnZ").parse::<f64>().unwrap_or(2.0),
            field("spawnRotationY").parse::<f64>().unwrap_or(0.0)
        ),
        rotation: format!(
            "{{\"x\":{},\"y\":{},\"z\":{}}}",
            field("rotationX").parse::<f64>().unwrap_or(0.0),
            field("rotationY").parse::<f64>().unwrap_or(0.0),
            field("rotationZ").parse::<f64>().unwrap_or(0.0)
        ),
        collision_mode: {
            let v = field("collisionMode");
            if v.is_empty() {
                "auto".into()
            } else {
                v
            }
        },
        created_at: stamp.clone(),
        updated_at: stamp,
    };
    if e.name.is_empty() {
        return json(s, 400, false, "{}", "Environment name is required", false);
    }
    let mut worlds = st.environments.write().unwrap();
    worlds.push(e.clone());
    persist_environments(st, &worlds);
    json(
        s,
        201,
        true,
        &environment_json(&e),
        "Environment uploaded and shared with all players",
        false,
    )
}

fn house_avatars(
    s: &mut TcpStream,
    st: &State,
    method: &str,
    path: &str,
    headers: &HashMap<String, String>,
    body: &[u8],
) -> std::io::Result<()> {
    let parts: Vec<&str> = path.split('/').collect();
    let house_id = parts.get(3).copied().unwrap_or("");
    if method == "GET" {
        let mut v: Vec<_> = st
            .avatars
            .read()
            .unwrap()
            .iter()
            .filter(|a| a.house_id == house_id && a.visibility == "public")
            .cloned()
            .collect();
        v.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        return json(
            s,
            200,
            true,
            &format!(
                "[{}]",
                v.iter().map(avatar_json).collect::<Vec<_>>().join(",")
            ),
            "Shared avatars loaded",
            false,
        );
    }
    if method == "POST" {
        let b = String::from_utf8_lossy(body);
        let now = now();
        let position =
            raw_json(&b, "position").unwrap_or_else(|| "{\"x\":0,\"y\":0,\"z\":2.5}".into());
        let rotation =
            raw_json(&b, "rotation").unwrap_or_else(|| "{\"x\":0,\"y\":0,\"z\":0}".into());
        let scale = raw_json(&b, "scale").unwrap_or_else(|| "{\"x\":1,\"y\":1,\"z\":1}".into());
        let url = val(&b, "avatarUrl");
        if !(url.starts_with("/uploads/")
            || url.starts_with("https://")
            || url.starts_with("data:image/")
            || (!url.contains(":") && !url.contains("..") && !url.starts_with("/")))
        {
            return json(
                s,
                400,
                false,
                "{}",
                "Avatar image must be uploaded or bundled",
                false,
            );
        }
        let session = headers
            .get("x-muzikaz-session")
            .cloned()
            .unwrap_or_else(|| val(&b, "ownerId"));
        let a = Avatar {
            id: trim(val(&b, "id"), 120),
            house_id: trim(house_id.into(), 80),
            owner_id: trim(session, 120),
            username: trim(val(&b, "username"), 80),
            avatar_name: trim(val(&b, "avatarName"), 120),
            avatar_type: trim(val(&b, "avatarType"), 40),
            avatar_url: url,
            thumbnail_url: val(&b, "thumbnailUrl"),
            message: trim(val(&b, "message"), 140),
            position,
            rotation,
            scale,
            room_id: trim(val(&b, "roomId"), 80),
            visibility: "public".into(),
            created_at: now.clone(),
            updated_at: now,
        };
        let mut v = st.avatars.write().unwrap();
        v.retain(|existing| existing.id != a.id);
        v.push(a.clone());
        persist_avatars(st, &v);
        return json(
            s,
            201,
            true,
            &avatar_json(&a),
            "Avatar is online in the shared house.",
            false,
        );
    }
    let id = parts.last().copied().unwrap_or("");
    let session = headers
        .get("x-muzikaz-session")
        .cloned()
        .unwrap_or_default();
    let mut v = st.avatars.write().unwrap();
    let before = v.len();
    v.retain(|a| !(a.id == id && (session.is_empty() || a.owner_id == session)));
    persist_avatars(st, &v);
    json(
        s,
        200,
        true,
        &format!(
            "{{\"id\":\"{}\",\"removed\":{}}}",
            esc(id),
            before != v.len()
        ),
        "Avatar removed",
        false,
    )
}
fn upload_avatar(
    s: &mut TcpStream,
    st: &State,
    h: &HashMap<String, String>,
    body: &[u8],
) -> std::io::Result<()> {
    let ct = h.get("content-type").cloned().unwrap_or_default();
    let boundary = ct.split("boundary=").nth(1).unwrap_or("");
    if boundary.is_empty() {
        return json(s, 400, false, "{}", "Invalid avatar upload", false);
    }
    let part = parse_multipart(body, boundary)
        .into_iter()
        .find(|p| p.name == "avatar");
    let Some(p) = part else {
        return json(s, 400, false, "{}", "Missing avatar image", false);
    };
    if p.data.len() > 3_000_000 {
        return json(s, 413, false, "{}", "Avatar image exceeds 3 MB", false);
    }
    let ext = ext(&p.filename).unwrap_or("");
    if !matches!(ext, "png" | "jpg" | "jpeg" | "webp") {
        return json(s, 400, false, "{}", "Unsupported avatar image type", false);
    }
    let fname = format!("avatar-{}.{}", uuid(), ext);
    fs::write(st.uploads.join(&fname), p.data)?;
    let path = format!("/uploads/{fname}");
    let url = if st.public_base.is_empty() {
        path
    } else {
        format!("{}{}", st.public_base.trim_end_matches('/'), path)
    };
    json(
        s,
        200,
        true,
        &format!(
            "{{\"avatarUrl\":\"{}\",\"thumbnailUrl\":\"{}\"}}",
            esc(&url),
            esc(&url)
        ),
        "Avatar image uploaded",
        false,
    )
}
fn sse_ready(s: &mut TcpStream) -> std::io::Result<()> {
    let body = "retry: 3000\nevent: crib-ready\ndata: {\"connected\":true}\n\n";
    write_resp(
        s,
        "200 OK",
        "text/event-stream; charset=utf-8",
        body.as_bytes(),
        false,
    )
}
fn request_session(headers: &HashMap<String, String>) -> String {
    headers
        .get("x-muzikaz-session")
        .map(|value| trim(value.clone(), 120))
        .unwrap_or_default()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
        .collect()
}
fn prune_house_users(users: &mut Vec<HouseUser>) {
    let cutoff = unix_seconds().saturating_sub(35);
    users.retain(|user| user.last_active >= cutoff);
}
fn presence_json(users: &[HouseUser]) -> String {
    format!(
        "{{\"count\":{},\"capacity\":15,\"coordinateSystem\":\"right-handed-y-up\",\"users\":[{}]}}",
        users.len(),
        users
            .iter()
            .map(|user| format!(
                "{{\"sessionId\":\"{}\",\"username\":\"{}\",\"color\":\"{}\",\"roomId\":\"{}\",\"position\":{},\"rotation\":{},\"avatarUrl\":\"{}\",\"modelUrl\":\"{}\",\"message\":\"{}\"}}",
                esc(&user.session_id),
                esc(&user.username),
                esc(&user.color),
                esc(&user.room_id),
                user.position,
                user.rotation,
                esc(&user.avatar_url),
                esc(&user.avatar_url),
                esc(&user.message)
            ))
            .collect::<Vec<_>>()
            .join(",")
    )
}
fn house_presence(
    s: &mut TcpStream,
    st: &State,
    method: &str,
    headers: &HashMap<String, String>,
    body: &[u8],
) -> std::io::Result<()> {
    if method != "POST" {
        return json(s, 405, false, "{}", "Method not allowed", false);
    }
    let session_id = request_session(headers);
    if session_id.is_empty() {
        return json(
            s,
            400,
            false,
            "{}",
            "A valid house session is required",
            false,
        );
    }
    let input = String::from_utf8_lossy(body);
    let mut users = st.house_users.write().unwrap();
    prune_house_users(&mut users);
    if let Some(user) = users.iter_mut().find(|user| user.session_id == session_id) {
        user.last_active = unix_seconds();
        let room = val(&input, "roomId");
        if !room.is_empty() {
            user.room_id = trim(room, 40);
        }
        let position = raw_json(&input, "position").unwrap_or_default();
        if !position.is_empty() {
            user.position = position;
        }
        let rotation = raw_json(&input, "rotation").unwrap_or_default();
        if !rotation.is_empty() {
            user.rotation = rotation;
        }
        let avatar_url = {
            let value = val(&input, "avatarUrl");
            if value.is_empty() {
                val(&input, "modelUrl")
            } else {
                value
            }
        };
        if !avatar_url.is_empty() {
            user.avatar_url = trim(avatar_url, 500);
        }
        let message = val(&input, "message");
        if !message.is_empty() {
            user.message = trim(message, 140);
        }
    } else {
        if users.len() >= 15 {
            return json(
                s,
                409,
                false,
                &presence_json(&users),
                "This Vibe Crib server is full",
                false,
            );
        }
        let username = val(&input, "username");
        let color = val(&input, "color");
        let room_id = val(&input, "roomId");
        users.push(HouseUser {
            session_id,
            username: trim(
                if username.is_empty() {
                    "Subscriber".into()
                } else {
                    username
                },
                28,
            ),
            color: trim(
                if color.is_empty() {
                    "#9cff00".into()
                } else {
                    color
                },
                40,
            ),
            room_id: trim(
                if room_id.is_empty() {
                    "crib".into()
                } else {
                    room_id
                },
                40,
            ),
            position: {
                let value = raw_json(&input, "position").unwrap_or_default();
                if value.is_empty() {
                    "{\"x\":0,\"y\":0,\"z\":2.5}".into()
                } else {
                    value
                }
            },
            rotation: {
                let value = raw_json(&input, "rotation").unwrap_or_default();
                if value.is_empty() {
                    "{\"y\":0}".into()
                } else {
                    value
                }
            },
            avatar_url: {
                let value = {
                    let avatar = val(&input, "avatarUrl");
                    if avatar.is_empty() {
                        val(&input, "modelUrl")
                    } else {
                        avatar
                    }
                };
                trim(
                    if value.is_empty() {
                        "logo_symbol_crop_2x_transparent.png".into()
                    } else {
                        value
                    },
                    500,
                )
            },
            message: trim(val(&input, "message"), 140),
            last_active: unix_seconds(),
        });
    }
    json(
        s,
        200,
        true,
        &presence_json(&users),
        "Presence updated",
        false,
    )
}
fn house_leave(
    s: &mut TcpStream,
    st: &State,
    method: &str,
    target: &str,
    headers: &HashMap<String, String>,
) -> std::io::Result<()> {
    if method != "POST" {
        return json(s, 405, false, "{}", "Method not allowed", false);
    }
    let query_session = target
        .split("sessionId=")
        .nth(1)
        .unwrap_or("")
        .split('&')
        .next()
        .unwrap_or("");
    let session_id = if request_session(headers).is_empty() {
        query_session.to_string()
    } else {
        request_session(headers)
    };
    let mut users = st.house_users.write().unwrap();
    users.retain(|user| user.session_id != session_id);
    json(s, 200, true, &presence_json(&users), "Left house", false)
}
fn chat_json(message: &ChatMessage) -> String {
    format!("{{\"id\":\"{}\",\"sessionId\":\"{}\",\"username\":\"{}\",\"message\":\"{}\",\"createdAt\":\"{}\"}}", esc(&message.id), esc(&message.session_id), esc(&message.username), esc(&message.message), esc(&message.created_at))
}
fn house_chat(
    s: &mut TcpStream,
    st: &State,
    method: &str,
    headers: &HashMap<String, String>,
    body: &[u8],
) -> std::io::Result<()> {
    if method == "GET" {
        let messages = st.chat_messages.read().unwrap();
        return json(
            s,
            200,
            true,
            &format!(
                "{{\"messages\":[{}]}}",
                messages.iter().map(chat_json).collect::<Vec<_>>().join(",")
            ),
            "Chat loaded",
            false,
        );
    }
    if method != "POST" {
        return json(s, 405, false, "{}", "Method not allowed", false);
    }
    let session_id = request_session(headers);
    let mut users = st.house_users.write().unwrap();
    prune_house_users(&mut users);
    let Some(user) = users.iter_mut().find(|user| user.session_id == session_id) else {
        return json(
            s,
            401,
            false,
            "{}",
            "Join the Vibe Crib before chatting",
            false,
        );
    };
    let message = trim(val(&String::from_utf8_lossy(body), "message"), 140);
    if message.trim().is_empty() {
        return json(s, 400, false, "{}", "Message cannot be empty", false);
    }
    user.message = message.clone();
    user.last_active = unix_seconds();
    let record = ChatMessage {
        id: format!("chat-{}", uuid()),
        session_id,
        username: user.username.clone(),
        message,
        created_at: now(),
    };
    drop(users);
    let mut messages = st.chat_messages.write().unwrap();
    messages.push(record.clone());
    if messages.len() > 100 {
        let drain = messages.len() - 100;
        messages.drain(..drain);
    }
    json(s, 201, true, &chat_json(&record), "Message sent", false)
}
fn unix_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
fn create(s: &mut TcpStream, st: &State, body: &[u8]) -> std::io::Result<()> {
    let b = String::from_utf8_lossy(body);
    let title = {
        let v = val(&b, "title");
        if v.is_empty() {
            val(&b, "name")
        } else {
            v
        }
    };
    let creator = {
        let v = val(&b, "creatorName");
        if v.is_empty() {
            let owner = val(&b, "owner");
            if owner.is_empty() {
                val(&b, "username")
            } else {
                owner
            }
        } else {
            v
        }
    };
    let url = val(&b, "modelUrl");
    if title.trim().is_empty() {
        return json(s, 400, false, "{}", "Missing required title", false);
    }
    if creator.trim().is_empty() {
        return json(s, 400, false, "{}", "Missing required creatorName", false);
    }
    if !(url.starts_with("/uploads/") || url.starts_with("https://")) {
        return json(
            s,
            400,
            false,
            "{}",
            "Model URL must be a stored public upload URL",
            false,
        );
    }
    let now = now();
    let m = Model {
        id: {
            let id = val(&b, "id");
            if id.is_empty() {
                uuid()
            } else {
                trim(id, 120)
            }
        },
        title: trim(title, 120),
        creator: trim(creator, 80),
        description: trim(val(&b, "description"), 1000),
        category: trim(val(&b, "category"), 80),
        placement_type: trim(val(&b, "placementType"), 30),
        model_type: {
            let mt = val(&b, "modelType");
            if mt.is_empty() {
                trim(val(&b, "format"), 20)
            } else {
                trim(mt, 20)
            }
        },
        model_url: url,
        ios_model_url: val(&b, "iosModelUrl"),
        thumbnail_url: val(&b, "thumbnailUrl"),
        published_at: now.clone(),
        updated_at: now,
        status: if val(&b, "status") == "private" {
            "private".into()
        } else {
            "published".into()
        },
        featured: false,
        spawn_position: "null".into(),
        scale: val(&b, "scale").parse().unwrap_or(1.0),
        rotation: "null".into(),
        environment: val(&b, "environment"),
    };
    let mut v = st.models.write().unwrap();
    v.push(m.clone());
    persist(st, &v);
    json(
        s,
        201,
        true,
        &model_json(&m),
        "Model published live to the MUZIKAZ Model Market.",
        false,
    )
}
fn patch(s: &mut TcpStream, st: &State, id: &str, body: &[u8]) -> std::io::Result<()> {
    let b = String::from_utf8_lossy(body);
    let mut v = st.models.write().unwrap();
    if let Some(m) = v.iter_mut().find(|m| m.id == id) {
        let t = val(&b, "title");
        if !t.is_empty() {
            m.title = trim(t, 120)
        };
        m.updated_at = now();
        let out = model_json(m);
        persist(st, &v);
        json(s, 200, true, &out, "Model updated", false)
    } else {
        json(s, 404, false, "{}", "Model not found", false)
    }
}
fn upload(
    s: &mut TcpStream,
    st: &State,
    h: &HashMap<String, String>,
    body: &[u8],
) -> std::io::Result<()> {
    let ct = h.get("content-type").cloned().unwrap_or_default();
    let boundary = ct.split("boundary=").nth(1).unwrap_or("");
    if boundary.is_empty() {
        return json(s, 400, false, "{}", "Invalid multipart upload", false);
    }
    let parts = parse_multipart(body, boundary);
    let mut pairs = Vec::new();
    let mut has_model = false;
    for p in parts {
        if p.data.is_empty() {
            return json(s, 400, false, "{}", "Upload is empty", false);
        }
        if p.data.len() > st.max_bytes {
            return json(
                s,
                413,
                false,
                "{}",
                "Upload exceeds configured maximum size",
                false,
            );
        }
        let ext = ext(&p.filename).unwrap_or("");
        let ok = match p.name.as_str() {
            "model" => matches!(ext, "glb" | "gltf"),
            "iosModel" => ext == "usdz",
            "thumbnail" => matches!(ext, "png" | "jpg" | "jpeg" | "webp"),
            _ => false,
        };
        if !ok {
            return json(
                s,
                400,
                false,
                "{}",
                "Unsupported upload type or MIME type",
                false,
            );
        }
        let fname = format!("{}.{}", uuid(), ext);
        if fs::write(st.uploads.join(&fname), p.data).is_err() {
            return json(s, 500, false, "{}", "Could not store upload", false);
        }
        let path = format!("/uploads/{fname}");
        let url = if st.public_base.is_empty() {
            path
        } else {
            format!("{}{}", st.public_base.trim_end_matches('/'), path)
        };
        if p.name == "model" {
            has_model = true
        }
        pairs.push(format!("\"{}\":\"{}\"", esc(&p.name), esc(&url)));
    }
    if !has_model {
        return json(s, 400, false, "{}", "Missing model file", false);
    }
    json(
        s,
        200,
        true,
        &format!("{{{}}}", pairs.join(",")),
        "Files uploaded",
        false,
    )
}
struct Part {
    name: String,
    filename: String,
    data: Vec<u8>,
}
fn parse_multipart(body: &[u8], boundary: &str) -> Vec<Part> {
    let marker = format!("--{}", boundary).into_bytes();
    let mut out = Vec::new();
    let mut cursor = 0;
    while let Some(start) = find_slice(&body[cursor..], &marker) {
        let start = cursor + start + marker.len();
        if body.get(start..start + 2) == Some(b"--") {
            break;
        }
        let content_start = if body.get(start..start + 2) == Some(b"\r\n") {
            start + 2
        } else {
            start
        };
        let Some(header_end) = find_slice(&body[content_start..], b"\r\n\r\n") else {
            break;
        };
        let header_end = content_start + header_end;
        let header = String::from_utf8_lossy(&body[content_start..header_end]);
        let disp = header
            .lines()
            .find(|l| l.to_ascii_lowercase().starts_with("content-disposition"))
            .unwrap_or("");
        let name = attr(disp, "name");
        let filename = attr(disp, "filename");
        let data_start = header_end + 4;
        let Some(next) = find_slice(&body[data_start..], &marker) else {
            break;
        };
        let mut data_end = data_start + next;
        if data_end >= 2 && &body[data_end - 2..data_end] == b"\r\n" {
            data_end -= 2;
        }
        if !name.is_empty() {
            out.push(Part {
                name,
                filename,
                data: body[data_start..data_end].to_vec(),
            });
        }
        cursor = data_start + next;
    }
    out
}
fn find_slice(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

fn attr(s: &str, k: &str) -> String {
    s.split(';')
        .find_map(|p| {
            let p = p.trim();
            p.strip_prefix(&format!("{k}=\""))
                .and_then(|v| v.strip_suffix('"'))
                .map(str::to_string)
        })
        .unwrap_or_default()
}
fn static_file(s: &mut TcpStream, st: &State, method: &str, target: &str) -> std::io::Result<()> {
    if method != "GET" && method != "HEAD" {
        return plain(s, 405, "Method not allowed", false);
    }
    let path = if target.starts_with("/uploads/") {
        st.uploads.join(target.trim_start_matches("/uploads/"))
    } else {
        requested(&st.root, target).unwrap_or_else(|| st.root.join("index.html"))
    };
    let resolved = if path.is_file() {
        path
    } else {
        st.root.join("index.html")
    };
    match fs::read(&resolved) {
        Ok(body) => write_resp(s, "200 OK", ctype(&resolved), &body, method == "HEAD"),
        Err(_) => plain(s, 404, NOT_FOUND_BODY, method == "HEAD"),
    }
}
fn requested(root: &Path, target: &str) -> Option<PathBuf> {
    let rel = percent(target.split(['?', '#']).next().unwrap_or("/")).ok()?;
    let mut p = root.to_path_buf();
    for c in Path::new(rel.trim_start_matches('/')).components() {
        match c {
            Component::Normal(x) => p.push(x),
            Component::CurDir => {}
            _ => return None,
        }
    }
    if p.is_dir() {
        p.push("index.html")
    }
    Some(p)
}
fn parse_headers(lines: Vec<&str>) -> HashMap<String, String> {
    lines
        .into_iter()
        .filter_map(|l| {
            l.split_once(':')
                .map(|(k, v)| (k.to_ascii_lowercase(), v.trim().to_string()))
        })
        .collect()
}
fn json(
    s: &mut TcpStream,
    code: u16,
    success: bool,
    data: &str,
    msg: &str,
    head: bool,
) -> std::io::Result<()> {
    let body = format!(
        "{{\"success\":{},\"data\":{},\"message\":\"{}\"}}",
        success,
        data,
        esc(msg)
    );
    write_resp(
        s,
        &format!("{} {}", code, status(code)),
        "application/json; charset=utf-8",
        body.as_bytes(),
        head,
    )
}
fn plain(s: &mut TcpStream, code: u16, msg: &str, head: bool) -> std::io::Result<()> {
    write_resp(
        s,
        &format!("{} {}", code, status(code)),
        "text/plain; charset=utf-8",
        msg.as_bytes(),
        head,
    )
}
fn write_resp(
    s: &mut TcpStream,
    status: &str,
    ct: &str,
    body: &[u8],
    head: bool,
) -> std::io::Result<()> {
    write!(s,"HTTP/1.1 {status}\r\nContent-Length: {}\r\nContent-Type: {ct}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type, Accept, Authorization, X-MUZIKAZ-Session, X-User-Id, X-User-Name, X-User-Email, X-User-Role, X-Admin-Token\r\nAccess-Control-Max-Age: 86400\r\nCross-Origin-Resource-Policy: cross-origin\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n",body.len())?;
    if !head {
        s.write_all(body)?
    }
    s.flush()
}
fn model_json(m: &Model) -> String {
    format!("{{\"id\":\"{}\",\"title\":\"{}\",\"creatorName\":\"{}\",\"description\":\"{}\",\"category\":\"{}\",\"placementType\":\"{}\",\"modelType\":\"{}\",\"modelUrl\":\"{}\",\"iosModelUrl\":{},\"thumbnailUrl\":{},\"publishedAt\":\"{}\",\"updatedAt\":\"{}\",\"status\":\"{}\",\"featured\":{},\"spawnPosition\":{},\"scale\":{},\"rotation\":{},\"environment\":{} }}",esc(&m.id),esc(&m.title),esc(&m.creator),esc(&m.description),esc(&m.category),esc(&m.placement_type),esc(&m.model_type),esc(&m.model_url),opt(&m.ios_model_url),opt(&m.thumbnail_url),esc(&m.published_at),esc(&m.updated_at),esc(&m.status),m.featured,m.spawn_position,m.scale,m.rotation,opt(&m.environment))
}
fn avatar_json(a: &Avatar) -> String {
    format!(
        "{{\"id\":\"{}\",\"houseId\":\"{}\",\"ownerId\":\"{}\",\"username\":\"{}\",\"avatarName\":\"{}\",\"avatarType\":\"{}\",\"avatarUrl\":\"{}\",\"thumbnailUrl\":{},\"message\":\"{}\",\"position\":{},\"rotation\":{},\"scale\":{},\"roomId\":\"{}\",\"visibility\":\"{}\",\"createdAt\":\"{}\",\"updatedAt\":\"{}\"}}",
        esc(&a.id),
        esc(&a.house_id),
        esc(&a.owner_id),
        esc(&a.username),
        esc(&a.avatar_name),
        esc(&a.avatar_type),
        esc(&a.avatar_url),
        opt(&a.thumbnail_url),
        esc(&a.message),
        a.position,
        a.rotation,
        a.scale,
        esc(&a.room_id),
        esc(&a.visibility),
        esc(&a.created_at),
        esc(&a.updated_at)
    )
}
fn environment_json(e: &Environment) -> String {
    format!("{{\"id\":\"{}\",\"name\":\"{}\",\"description\":\"{}\",\"modelUrl\":\"{}\",\"thumbnailUrl\":{},\"originalFilename\":\"{}\",\"fileSize\":{},\"scale\":{},\"visibility\":\"{}\",\"spawn\":{},\"rotation\":{},\"collisionMode\":\"{}\",\"source\":\"uploaded\",\"createdAt\":\"{}\",\"updatedAt\":\"{}\"}}", esc(&e.id),esc(&e.name),esc(&e.description),esc(&e.model_url),opt(&e.thumbnail_url),esc(&e.original_filename),e.file_size,e.scale,esc(&e.visibility),e.spawn,e.rotation,esc(&e.collision_mode),esc(&e.created_at),esc(&e.updated_at))
}
fn persist_environments(st: &State, v: &Vec<Environment>) {
    let _ = fs::create_dir_all(&st.data);
    let _ = fs::write(
        st.data.join("environments.json"),
        format!(
            "[{}]",
            v.iter().map(environment_json).collect::<Vec<_>>().join(",")
        ),
    );
}
fn load_environments(p: &Path) -> Vec<Environment> {
    let s = fs::read_to_string(p).unwrap_or_default();
    s.split("{\"")
        .skip(1)
        .map(|x| format!("{{\"{}", x))
        .filter_map(|o| {
            let id = val(&o, "id");
            if id.is_empty() {
                None
            } else {
                Some(Environment {
                    id,
                    name: val(&o, "name"),
                    description: val(&o, "description"),
                    model_url: val(&o, "modelUrl"),
                    thumbnail_url: val(&o, "thumbnailUrl"),
                    original_filename: val(&o, "originalFilename"),
                    file_size: val(&o, "fileSize").parse().unwrap_or(0),
                    scale: val(&o, "scale").parse().unwrap_or(1.0),
                    visibility: val(&o, "visibility"),
                    spawn: raw_json(&o, "spawn")
                        .unwrap_or_else(|| "{\"x\":0,\"y\":1,\"z\":2,\"rotationY\":0}".into()),
                    rotation: raw_json(&o, "rotation")
                        .unwrap_or_else(|| "{\"x\":0,\"y\":0,\"z\":0}".into()),
                    collision_mode: val(&o, "collisionMode"),
                    created_at: val(&o, "createdAt"),
                    updated_at: val(&o, "updatedAt"),
                })
            }
        })
        .collect()
}
fn persist(st: &State, v: &Vec<Model>) {
    let _ = fs::create_dir_all(&st.data);
    let _ = fs::write(
        st.data.join("published-models.json"),
        format!(
            "[{}]",
            v.iter().map(model_json).collect::<Vec<_>>().join(",")
        ),
    );
}
fn persist_avatars(st: &State, v: &Vec<Avatar>) {
    let _ = fs::create_dir_all(&st.data);
    let _ = fs::write(
        st.data.join("house-avatars.json"),
        format!(
            "[{}]",
            v.iter().map(avatar_json).collect::<Vec<_>>().join(",")
        ),
    );
}
fn persist_avatar_profiles(st: &State, profiles: &[AvatarProfile]) {
    let _ = fs::create_dir_all(&st.data);
    let _ = fs::write(
        st.data.join("avatar-profiles.json"),
        format!(
            "[{}]",
            profiles
                .iter()
                .map(profile_json)
                .collect::<Vec<_>>()
                .join(",")
        ),
    );
}
fn load_avatar_profiles(path: &Path) -> Vec<AvatarProfile> {
    let source = fs::read_to_string(path).unwrap_or_default();
    source
        .split('{')
        .skip(1)
        .map(|part| format!("{{{part}"))
        .filter_map(|item| {
            let user_id = val(&item, "userId");
            let asset_id = val(&item, "assetId");
            if user_id.is_empty() || asset_id.is_empty() {
                return None;
            }
            Some(AvatarProfile {
                user_id,
                asset_id,
                model_url: val(&item, "modelUrl"),
                display_name: val(&item, "displayName"),
                access_type: val(&item, "accessType"),
                selected_at: val(&item, "selectedAt"),
                scale: val(&item, "scale").parse().unwrap_or(1.0),
            })
        })
        .collect()
}
fn load_models(p: &Path) -> Vec<Model> {
    let s = fs::read_to_string(p).unwrap_or_default();
    s.split("{\"")
        .skip(1)
        .map(|x| format!("{{\"{}", x))
        .filter_map(|o| {
            let id = val(&o, "id");
            if id.is_empty() {
                None
            } else {
                Some(Model {
                    id,
                    title: val(&o, "title"),
                    creator: val(&o, "creatorName"),
                    description: val(&o, "description"),
                    category: val(&o, "category"),
                    placement_type: val(&o, "placementType"),
                    model_type: val(&o, "modelType"),
                    model_url: val(&o, "modelUrl"),
                    ios_model_url: val(&o, "iosModelUrl"),
                    thumbnail_url: val(&o, "thumbnailUrl"),
                    published_at: val(&o, "publishedAt"),
                    updated_at: val(&o, "updatedAt"),
                    status: val(&o, "status"),
                    featured: o.contains("\"featured\":true"),
                    spawn_position: "null".into(),
                    scale: 1.0,
                    rotation: "null".into(),
                    environment: val(&o, "environment"),
                })
            }
        })
        .collect()
}
fn load_avatars(p: &Path) -> Vec<Avatar> {
    let s = fs::read_to_string(p).unwrap_or_default();
    s.split("{\"")
        .skip(1)
        .map(|x| format!("{{\"{}", x))
        .filter_map(|o| {
            let id = val(&o, "id");
            if id.is_empty() {
                None
            } else {
                Some(Avatar {
                    id,
                    house_id: val(&o, "houseId"),
                    owner_id: val(&o, "ownerId"),
                    username: val(&o, "username"),
                    avatar_name: val(&o, "avatarName"),
                    avatar_type: val(&o, "avatarType"),
                    avatar_url: val(&o, "avatarUrl"),
                    thumbnail_url: val(&o, "thumbnailUrl"),
                    message: val(&o, "message"),
                    position: raw_json(&o, "position")
                        .unwrap_or_else(|| "{\"x\":0,\"y\":0,\"z\":2.5}".into()),
                    rotation: raw_json(&o, "rotation")
                        .unwrap_or_else(|| "{\"x\":0,\"y\":0,\"z\":0}".into()),
                    scale: raw_json(&o, "scale")
                        .unwrap_or_else(|| "{\"x\":1,\"y\":1,\"z\":1}".into()),
                    room_id: val(&o, "roomId"),
                    visibility: val(&o, "visibility"),
                    created_at: val(&o, "createdAt"),
                    updated_at: val(&o, "updatedAt"),
                })
            }
        })
        .collect()
}
fn val(s: &str, k: &str) -> String {
    let pat = format!("\"{k}\":");
    if let Some(i) = s.find(&pat) {
        let r = &s[i + pat.len()..].trim_start();
        if let Some(r) = r.strip_prefix('"') {
            let mut out = String::new();
            let mut escp = false;
            for ch in r.chars() {
                if escp {
                    out.push(ch);
                    escp = false
                } else if ch == '\\' {
                    escp = true
                } else if ch == '"' {
                    break;
                } else {
                    out.push(ch)
                }
            }
            return out;
        } else {
            return r
                .split([',', '}'])
                .next()
                .unwrap_or("")
                .trim()
                .trim_matches('"')
                .to_string();
        }
    }
    String::new()
}
fn raw_json(s: &str, k: &str) -> Option<String> {
    let pat = format!("\"{k}\":");
    let i = s.find(&pat)?;
    let r = s[i + pat.len()..].trim_start();
    let open = r.chars().next()?;
    let close = match open {
        '{' => '}',
        '[' => ']',
        _ => return None,
    };
    let mut depth = 0i32;
    let mut in_string = false;
    let mut escaped = false;
    for (idx, ch) in r.char_indices() {
        if in_string {
            if escaped {
                escaped = false;
            } else if ch == '\\' {
                escaped = true;
            } else if ch == '"' {
                in_string = false;
            }
            continue;
        }
        if ch == '"' {
            in_string = true;
        } else if ch == open {
            depth += 1;
        } else if ch == close {
            depth -= 1;
            if depth == 0 {
                return Some(r[..=idx].to_string());
            }
        }
    }
    None
}
fn esc(s: &str) -> String {
    s.chars()
        .flat_map(|c| match c {
            '"' => "\\\"".chars().collect::<Vec<_>>(),
            '\\' => "\\\\".chars().collect(),
            '<' => "\\u003c".chars().collect(),
            '>' => "\\u003e".chars().collect(),
            '&' => "\\u0026".chars().collect(),
            '\n' => "\\n".chars().collect(),
            '\r' => vec![],
            _ => vec![c],
        })
        .collect()
}
fn opt(s: &str) -> String {
    if s.is_empty() {
        "null".into()
    } else {
        format!("\"{}\"", esc(s))
    }
}
fn trim(s: String, n: usize) -> String {
    s.trim().chars().take(n).collect()
}
fn ext(n: &str) -> Option<&'static str> {
    if n.contains('/') || n.contains('\\') || n.contains("..") {
        return None;
    }
    match n
        .rsplit('.')
        .next()
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "glb" => Some("glb"),
        "gltf" => Some("gltf"),
        "usdz" => Some("usdz"),
        "png" => Some("png"),
        "jpg" => Some("jpg"),
        "jpeg" => Some("jpeg"),
        "webp" => Some("webp"),
        "gif" => Some("gif"),
        "svg" => Some("svg"),
        "reality" => Some("reality"),
        "obj" => Some("obj"),
        "mtl" => Some("mtl"),
        "bin" => Some("bin"),
        "zip" => Some("zip"),
        _ => None,
    }
}
fn now() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs()
        .to_string()
}
fn uuid() -> String {
    format!(
        "{:x}-{:x}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos(),
        std::process::id()
    )
}
fn status(c: u16) -> &'static str {
    match c {
        200 => "OK",
        201 => "Created",
        400 => "Bad Request",
        403 => "Forbidden",
        404 => "Not Found",
        405 => "Method Not Allowed",
        413 => "Payload Too Large",
        500 => "Internal Server Error",
        _ => "OK",
    }
}
fn ctype(p: &Path) -> &'static str {
    match p.extension().and_then(|e| e.to_str()).unwrap_or("") {
        "css" => "text/css; charset=utf-8",
        "html" => "text/html; charset=utf-8",
        "js" => "text/javascript; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "svg" => "image/svg+xml",
        "webp" => "image/webp",
        "glb" => "model/gltf-binary",
        "gltf" => "model/gltf+json",
        "usdz" => "model/vnd.usdz+zip",
        _ => "application/octet-stream",
    }
}
fn percent(v: &str) -> Result<String, ()> {
    let b = v.as_bytes();
    let mut o = Vec::new();
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' {
            let h = std::str::from_utf8(b.get(i + 1..i + 3).ok_or(())?).map_err(|_| ())?;
            o.push(u8::from_str_radix(h, 16).map_err(|_| ())?);
            i += 3
        } else {
            o.push(b[i]);
            i += 1
        }
    }
    String::from_utf8(o).map_err(|_| ())
}
fn find_bytes(h: &[u8], n: &[u8]) -> Option<usize> {
    h.windows(n.len()).position(|w| w == n)
}

fn auth(headers: &HashMap<String, String>) -> (String, String, String, String) {
    let user = trim(headers.get("x-user-id").cloned().unwrap_or_default(), 120);
    let role = trim(
        headers.get("x-user-role").cloned().unwrap_or_else(|| {
            if user.is_empty() {
                "visitor".into()
            } else {
                "user".into()
            }
        }),
        30,
    );
    let name = trim(
        headers.get("x-user-name").cloned().unwrap_or_else(|| {
            if user.is_empty() {
                "Public Visitor".into()
            } else {
                user.clone()
            }
        }),
        120,
    );
    let email = trim(
        headers.get("x-user-email").cloned().unwrap_or_default(),
        180,
    );
    (user, role, name, email)
}
fn is_admin(headers: &HashMap<String, String>, st: &State) -> bool {
    let token = headers.get("x-admin-token");
    token.is_some_and(|value| {
        (!st.admin_token.is_empty() && value == &st.admin_token)
            || st.admin_sessions.read().unwrap().contains(value)
    })
}
fn admin_login(s: &mut TcpStream, st: &State, body: &[u8]) -> std::io::Result<()> {
    let payload = String::from_utf8_lossy(body);
    // Credentials are checked only on the server; clients receive a random session token.
    if val(&payload, "username") != "jodel" || val(&payload, "password") != "boots" {
        return json(
            s,
            401,
            false,
            "{}",
            "Invalid administrator credentials",
            false,
        );
    }
    let token = uuid();
    st.admin_sessions.write().unwrap().insert(token.clone());
    json(
        s,
        200,
        true,
        &format!("{{\"token\":\"{}\"}}", esc(&token)),
        "Administrator authenticated",
        false,
    )
}
fn require_user(
    s: &mut TcpStream,
    headers: &HashMap<String, String>,
) -> Option<(String, String, String, String)> {
    let a = auth(headers);
    if a.0.is_empty() {
        let _ = json(s, 403, false, "{}", "Authentication required", false);
        None
    } else {
        Some(a)
    }
}
fn can_edit(a: &Asset, headers: &HashMap<String, String>, st: &State) -> bool {
    is_admin(headers, st) || auth(headers).0 == a.owner_user_id
}
fn is_public_asset(a: &Asset) -> bool {
    (a.status == "published" || a.status == "approved") && a.visibility == "public"
}

fn list_assets(
    s: &mut TcpStream,
    st: &State,
    h: &HashMap<String, String>,
    mode: &str,
) -> std::io::Result<()> {
    let (u, _, _, _) = auth(h);
    let admin = is_admin(h, st);
    let mut v: Vec<_> = st
        .assets
        .read()
        .unwrap()
        .iter()
        .filter(|a| match mode {
            "mine" => !u.is_empty() && a.owner_user_id == u,
            "public" => is_public_asset(a),
            "all" => admin || is_public_asset(a) || (!u.is_empty() && a.owner_user_id == u),
            _ => false,
        })
        .cloned()
        .collect();
    v.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    json(
        s,
        200,
        true,
        &format!(
            "[{}]",
            v.iter().map(asset_json).collect::<Vec<_>>().join(",")
        ),
        "Assets loaded",
        false,
    )
}
fn get_asset(
    s: &mut TcpStream,
    st: &State,
    h: &HashMap<String, String>,
    id: &str,
) -> std::io::Result<()> {
    let v = st.assets.read().unwrap();
    if let Some(a) = v.iter().find(|a| a.id == id) {
        if can_edit(a, h, st) || is_public_asset(a) {
            json(s, 200, true, &asset_json(a), "Asset loaded", false)
        } else {
            json(s, 403, false, "{}", "Private asset", false)
        }
    } else {
        json(s, 404, false, "{}", "Asset not found", false)
    }
}
fn list_models(
    s: &mut TcpStream,
    st: &State,
    h: &HashMap<String, String>,
    mode: &str,
) -> std::io::Result<()> {
    let (u, _, _, _) = auth(h);
    let mut v: Vec<_> = st
        .models
        .read()
        .unwrap()
        .iter()
        .filter(|m| {
            mode == "public" && m.status == "published"
                || mode == "mine" && !u.is_empty() && m.creator == u
        })
        .cloned()
        .collect();
    v.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    json(
        s,
        200,
        true,
        &format!(
            "[{}]",
            v.iter().map(model_json).collect::<Vec<_>>().join(",")
        ),
        "Models loaded",
        false,
    )
}

fn upload_asset(
    s: &mut TcpStream,
    st: &State,
    h: &HashMap<String, String>,
    body: &[u8],
) -> std::io::Result<()> {
    if !is_admin(h, st) {
        return json(s, 403, false, "{}", "Admin authorization required", false);
    }
    let Some((user, role, name, email)) = require_user(s, h) else {
        return Ok(());
    };
    let ct = h.get("content-type").cloned().unwrap_or_default();
    let boundary = ct.split("boundary=").nth(1).unwrap_or("");
    if boundary.is_empty() {
        return json(s, 400, false, "{}", "Invalid multipart upload", false);
    };
    let parts = parse_multipart(body, boundary);
    let fields = parts
        .iter()
        .filter(|p| p.filename.is_empty())
        .map(|p| (p.name.clone(), String::from_utf8_lossy(&p.data).to_string()))
        .collect::<HashMap<_, _>>();
    let mut created = Vec::new();
    for p in parts.into_iter().filter(|p| !p.filename.is_empty()) {
        let a = store_asset_part(st, p, &user, &role, &name, &email, &fields, false)?;
        created.push(a);
    }
    if created.is_empty() {
        return json(s, 400, false, "{}", "Missing upload file", false);
    };
    {
        let mut v = st.assets.write().unwrap();
        v.extend(created.clone());
        persist_assets(st, &v);
    }
    let mut d = st.derivatives.write().unwrap();
    for a in &created {
        d.push(AssetDerivative {
            id: uuid(),
            asset_id: a.id.clone(),
            kind: "thumbnail".into(),
            url: a.thumbnail_url.clone(),
            status: "ready".into(),
            created_at: now(),
        });
        d.push(AssetDerivative {
            id: uuid(),
            asset_id: a.id.clone(),
            kind: "compressed_webp".into(),
            url: a.public_url.clone(),
            status: "ready".into(),
            created_at: now(),
        });
    }
    persist_derivatives(st, &d);
    json(
        s,
        201,
        true,
        &format!(
            "[{}]",
            created.iter().map(asset_json).collect::<Vec<_>>().join(",")
        ),
        "Upload complete. Thumbnail generated.",
        false,
    )
}
fn upload_model_asset(
    s: &mut TcpStream,
    st: &State,
    h: &HashMap<String, String>,
    body: &[u8],
) -> std::io::Result<()> {
    if h.get("x-user-id").is_some() {
        upload_asset(s, st, h, body)
    } else {
        upload(s, st, h, body)
    }
}
fn store_asset_part(
    st: &State,
    p: Part,
    user: &str,
    role: &str,
    name: &str,
    email: &str,
    fields: &HashMap<String, String>,
    model_upload: bool,
) -> std::io::Result<Asset> {
    if p.data.is_empty() {
        return Err(std::io::Error::new(std::io::ErrorKind::Other, "empty"));
    }
    if p.data.len() > st.max_bytes {
        return Err(std::io::Error::new(std::io::ErrorKind::Other, "too large"));
    }
    let ext = ext(&p.filename)
        .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::Other, "bad ext"))?;
    let kind = if matches!(ext, "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg") {
        "image"
    } else {
        "model"
    };
    validate_signature(ext, &p.data)?;
    let mut data = p.data;
    if ext == "svg" {
        data = sanitize_svg(&String::from_utf8_lossy(&data)).into_bytes();
    }
    let fname = format!("asset-{}.{}", uuid(), ext);
    fs::write(st.uploads.join(&fname), &data)?;
    let url = format!("/uploads/{fname}");
    let now = now();
    Ok(Asset {
        id: uuid(),
        owner_user_id: user.into(),
        owner_display_name: name.into(),
        owner_email: email.into(),
        uploaded_by_role: role.into(),
        title: trim(
            fields
                .get("title")
                .cloned()
                .unwrap_or_else(|| p.filename.clone()),
            140,
        ),
        description: trim(fields.get("description").cloned().unwrap_or_default(), 1000),
        original_filename: trim(p.filename, 240),
        stored_filename: fname,
        file_type: kind.into(),
        mime_type: mime_for_ext(ext).into(),
        file_size: data.len(),
        public_url: url.clone(),
        thumbnail_url: url,
        category: trim(fields.get("category").cloned().unwrap_or_default(), 80),
        tags: trim(fields.get("tags").cloned().unwrap_or_default(), 300),
        status: if model_upload {
            "processing".into()
        } else {
            fields
                .get("status")
                .cloned()
                .unwrap_or_else(|| "draft".into())
        },
        visibility: fields
            .get("visibility")
            .cloned()
            .unwrap_or_else(|| "private".into()),
        intended_use: trim(fields.get("intendedUse").cloned().unwrap_or_default(), 80),
        related_model_id: trim(
            fields.get("relatedModelId").cloned().unwrap_or_default(),
            120,
        ),
        product_assignment: trim(
            fields.get("productAssignment").cloned().unwrap_or_default(),
            120,
        ),
        collection_assignment: trim(
            fields
                .get("collectionAssignment")
                .cloned()
                .unwrap_or_default(),
            120,
        ),
        publish_location: trim(
            fields.get("publishLocation").cloned().unwrap_or_default(),
            120,
        ),
        approved_by: String::new(),
        approved_at: String::new(),
        published_at: String::new(),
        moderator_note: String::new(),
        featured: false,
        archived: false,
        created_at: now.clone(),
        updated_at: now,
    })
}
fn patch_asset(
    s: &mut TcpStream,
    st: &State,
    h: &HashMap<String, String>,
    id: &str,
    body: &[u8],
) -> std::io::Result<()> {
    let b = String::from_utf8_lossy(body);
    let mut v = st.assets.write().unwrap();
    if let Some(a) = v.iter_mut().find(|a| a.id == id) {
        if !can_edit(a, h, st) {
            return json(s, 403, false, "{}", "Not allowed", false);
        };
        for (k, set) in [
            ("title", 0),
            ("description", 1),
            ("category", 2),
            ("visibility", 3),
            ("intendedUse", 4),
            ("relatedModelId", 5),
        ] {
            let x = val(&b, k);
            if !x.is_empty() {
                match set {
                    0 => a.title = trim(x, 140),
                    1 => a.description = trim(x, 1000),
                    2 => a.category = trim(x, 80),
                    3 => a.visibility = trim(x, 40),
                    4 => a.intended_use = trim(x, 80),
                    5 => a.related_model_id = trim(x, 120),
                    _ => {}
                }
            }
        }
        a.updated_at = now();
        let out = asset_json(a);
        persist_assets(st, &v);
        json(s, 200, true, &out, "Asset updated", false)
    } else {
        json(s, 404, false, "{}", "Asset not found", false)
    }
}
fn delete_asset(
    s: &mut TcpStream,
    st: &State,
    h: &HashMap<String, String>,
    id: &str,
) -> std::io::Result<()> {
    let mut v = st.assets.write().unwrap();
    let Some(a) = v.iter().find(|a| a.id == id).cloned() else {
        return json(s, 404, false, "{}", "Asset not found", false);
    };
    if !can_edit(&a, h, st) || a.status == "published" && !is_admin(h, st) {
        return json(s, 403, false, "{}", "Not allowed", false);
    };
    v.retain(|a| a.id != id);
    persist_assets(st, &v);
    json(
        s,
        200,
        true,
        &format!("{{\"id\":\"{}\"}}", esc(id)),
        "Asset deleted",
        false,
    )
}
fn asset_action(
    s: &mut TcpStream,
    st: &State,
    h: &HashMap<String, String>,
    path: &str,
    status: &str,
    msg: &str,
    body: &[u8],
) -> std::io::Result<()> {
    let id = path
        .trim_start_matches("/api/assets/")
        .split('/')
        .next()
        .unwrap_or("");
    let admin_only = matches!(
        status,
        "approved" | "rejected" | "published" | "unpublished" | "archived"
    );
    if admin_only && !is_admin(h, st) {
        return json(s, 403, false, "{}", "Admin authorization required", false);
    };
    let b = String::from_utf8_lossy(body);
    if status == "rejected" && val(&b, "reason").is_empty() {
        return json(s, 400, false, "{}", "Rejection reason required", false);
    };
    let mut v = st.assets.write().unwrap();
    if let Some(a) = v.iter_mut().find(|a| a.id == id) {
        if status == "pending_review" && !can_edit(a, h, st) {
            return json(s, 403, false, "{}", "Not allowed", false);
        };
        a.status = status.into();
        a.updated_at = now();
        if status == "approved" {
            a.approved_by = auth(h).0;
            a.approved_at = now()
        }
        if status == "published" {
            a.published_at = now();
            a.visibility = "public".into()
        }
        if status == "archived" {
            a.archived = true
        }
        let note = val(&b, "reason");
        if !note.is_empty() {
            a.moderator_note = trim(note, 500)
        };
        let out = asset_json(a);
        persist_assets(st, &v);
        json(s, 200, true, &out, msg, false)
    } else {
        json(s, 404, false, "{}", "Asset not found", false)
    }
}
fn assign_model(
    s: &mut TcpStream,
    st: &State,
    h: &HashMap<String, String>,
    path: &str,
    body: &[u8],
) -> std::io::Result<()> {
    let id = path
        .trim_start_matches("/api/assets/")
        .split('/')
        .next()
        .unwrap_or("");
    let Some((user, _, _, _)) = require_user(s, h) else {
        return Ok(());
    };
    let assets = st.assets.read().unwrap();
    let Some(a) = assets.iter().find(|a| a.id == id) else {
        return json(s, 404, false, "{}", "Asset not found", false);
    };
    if !can_edit(a, h, st) {
        return json(s, 403, false, "{}", "Not allowed", false);
    };
    let b = String::from_utf8_lossy(body);
    let now = now();
    let rec = AssetModelAssignment {
        id: uuid(),
        asset_id: id.into(),
        model_id: trim(val(&b, "modelId"), 120),
        owner_user_id: user,
        display_type: trim(val(&b, "displayType"), 80),
        material_slot: trim(val(&b, "materialSlot"), 80),
        position: raw_json(&b, "position").unwrap_or_else(|| "{\"x\":0,\"y\":0,\"z\":0}".into()),
        rotation: raw_json(&b, "rotation").unwrap_or_else(|| "{\"x\":0,\"y\":0,\"z\":0}".into()),
        scale: raw_json(&b, "scale").unwrap_or_else(|| "{\"x\":1,\"y\":1,\"z\":1}".into()),
        opacity: val(&b, "opacity").parse().unwrap_or(1.0),
        repeat_x: val(&b, "repeatX").parse().unwrap_or(1.0),
        repeat_y: val(&b, "repeatY").parse().unwrap_or(1.0),
        approved: is_admin(h, st) || a.status == "approved" || a.status == "published",
        published: a.status == "published",
        created_at: now.clone(),
        updated_at: now,
    };
    drop(assets);
    let mut v = st.assignments.write().unwrap();
    v.push(rec.clone());
    persist_assignments(st, &v);
    json(
        s,
        201,
        true,
        &assignment_json(&rec),
        "Graphic assigned to model display",
        false,
    )
}
fn delete_assignment(
    s: &mut TcpStream,
    st: &State,
    h: &HashMap<String, String>,
    path: &str,
) -> std::io::Result<()> {
    let aid = path.rsplit('/').next().unwrap_or("");
    let user = auth(h).0;
    let admin = is_admin(h, st);
    let mut v = st.assignments.write().unwrap();
    v.retain(|a| !(a.id == aid && (admin || a.owner_user_id == user)));
    persist_assignments(st, &v);
    json(
        s,
        200,
        true,
        &format!("{{\"id\":\"{}\"}}", esc(aid)),
        "Assignment removed",
        false,
    )
}
fn admin_pending(
    s: &mut TcpStream,
    st: &State,
    h: &HashMap<String, String>,
) -> std::io::Result<()> {
    if !is_admin(h, st) {
        return json(s, 403, false, "{}", "Admin authorization required", false);
    };
    let v: Vec<_> = st
        .assets
        .read()
        .unwrap()
        .iter()
        .filter(|a| a.status == "pending_review")
        .cloned()
        .collect();
    json(
        s,
        200,
        true,
        &format!(
            "[{}]",
            v.iter().map(asset_json).collect::<Vec<_>>().join(",")
        ),
        "Pending uploads loaded",
        false,
    )
}
fn admin_analytics(
    s: &mut TcpStream,
    st: &State,
    h: &HashMap<String, String>,
) -> std::io::Result<()> {
    if !is_admin(h, st) {
        return json(s, 403, false, "{}", "Admin authorization required", false);
    };
    let a = st.assets.read().unwrap();
    let m = st.models.read().unwrap();
    let total = a.len();
    let imgs = a.iter().filter(|x| x.file_type == "image").count();
    let mods = a.iter().filter(|x| x.file_type == "model").count() + m.len();
    let pending = a.iter().filter(|x| x.status == "pending_review").count();
    let published = a.iter().filter(|x| x.status == "published").count();
    let failures = a.iter().filter(|x| x.status == "failed").count();
    let storage: usize = a.iter().map(|x| x.file_size).sum();
    json(s,200,true,&format!("{{\"totalOrders\":128,\"inventoryUnits\":842,\"conversionRate\":\"7.4%\",\"totalUploads\":{total},\"modelUploads\":{mods},\"imageUploads\":{imgs},\"pendingApprovals\":{pending},\"publishedModels\":{},\"publishedGraphics\":{published},\"storageUsage\":{storage},\"uploadFailures\":{failures},\"mostViewedModels\":[],\"mostUsedGraphics\":[],\"topCreators\":[]}}",m.iter().filter(|x|x.status=="published").count()),"Analytics loaded",false)
}
fn admin_storage(
    s: &mut TcpStream,
    st: &State,
    h: &HashMap<String, String>,
) -> std::io::Result<()> {
    if !is_admin(h, st) {
        return json(s, 403, false, "{}", "Admin authorization required", false);
    };
    let assets = st.assets.read().unwrap();
    let bytes: usize = assets.iter().map(|a| a.file_size).sum();
    let owner_email_records = assets.iter().filter(|a| !a.owner_email.is_empty()).count();
    json(
        s,
        200,
        true,
        &format!(
            "{{\"usedBytes\":{bytes},\"maxUploadBytes\":{},\"ownerEmailRecords\":{owner_email_records}}}",
            st.max_bytes
        ),
        "Storage loaded",
        false,
    )
}

fn validate_signature(ext: &str, data: &[u8]) -> std::io::Result<()> {
    let ok = match ext {
        "png" => data.starts_with(b"\x89PNG\r\n\x1a\n"),
        "jpg" | "jpeg" => data.starts_with(b"\xff\xd8\xff"),
        "gif" => data.starts_with(b"GIF87a") || data.starts_with(b"GIF89a"),
        "webp" => data.len() > 12 && &data[0..4] == b"RIFF" && &data[8..12] == b"WEBP",
        "svg" => String::from_utf8_lossy(&data[..data.len().min(512)])
            .to_lowercase()
            .contains("<svg"),
        "glb" => data.starts_with(b"glTF"),
        "gltf" => String::from_utf8_lossy(&data[..data.len().min(512)]).contains("asset"),
        "usdz" | "reality" | "zip" => data.starts_with(b"PK"),
        "obj" | "mtl" | "bin" => true,
        _ => false,
    };
    if ok {
        Ok(())
    } else {
        Err(std::io::Error::new(
            std::io::ErrorKind::Other,
            "Unsupported file type",
        ))
    }
}
fn sanitize_svg(s: &str) -> String {
    let lower = s.to_lowercase();
    if lower.contains("<script")
        || lower.contains("onload=")
        || lower.contains("javascript:")
        || lower.contains("<foreignobject")
    {
        "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 120\"><rect width=\"200\" height=\"120\" fill=\"#111\"/><text x=\"20\" y=\"65\" fill=\"#fff\">Sanitized SVG</text></svg>".into()
    } else {
        s.into()
    }
}
fn mime_for_ext(ext: &str) -> &'static str {
    match ext {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "glb" => "model/gltf-binary",
        "gltf" => "model/gltf+json",
        "usdz" => "model/vnd.usdz+zip",
        "reality" => "model/vnd.reality",
        "obj" => "text/plain",
        "mtl" => "text/plain",
        "bin" => "application/octet-stream",
        "zip" => "application/zip",
        _ => "application/octet-stream",
    }
}
fn asset_json(a: &Asset) -> String {
    format!("{{\"id\":\"{}\",\"ownerUserId\":\"{}\",\"ownerDisplayName\":\"{}\",\"uploadedByRole\":\"{}\",\"title\":\"{}\",\"description\":\"{}\",\"originalFilename\":\"{}\",\"storedFilename\":\"{}\",\"fileType\":\"{}\",\"mimeType\":\"{}\",\"fileSize\":{},\"publicUrl\":\"{}\",\"thumbnailUrl\":\"{}\",\"category\":\"{}\",\"tags\":\"{}\",\"status\":\"{}\",\"moderationStatus\":\"{}\",\"visibility\":\"{}\",\"intendedUse\":\"{}\",\"relatedModelId\":\"{}\",\"productAssignment\":\"{}\",\"collectionAssignment\":\"{}\",\"publishLocation\":\"{}\",\"approvedBy\":\"{}\",\"approvedAt\":\"{}\",\"publishedAt\":\"{}\",\"moderatorNote\":\"{}\",\"featured\":{},\"archived\":{},\"createdAt\":\"{}\",\"updatedAt\":\"{}\"}}",esc(&a.id),esc(&a.owner_user_id),esc(&a.owner_display_name),esc(&a.uploaded_by_role),esc(&a.title),esc(&a.description),esc(&a.original_filename),esc(&a.stored_filename),esc(&a.file_type),esc(&a.mime_type),a.file_size,esc(&a.public_url),esc(&a.thumbnail_url),esc(&a.category),esc(&a.tags),esc(&a.status),esc(&a.status),esc(&a.visibility),esc(&a.intended_use),esc(&a.related_model_id),esc(&a.product_assignment),esc(&a.collection_assignment),esc(&a.publish_location),esc(&a.approved_by),esc(&a.approved_at),esc(&a.published_at),esc(&a.moderator_note),a.featured,a.archived,esc(&a.created_at),esc(&a.updated_at))
}
fn assignment_json(a: &AssetModelAssignment) -> String {
    format!("{{\"id\":\"{}\",\"assetId\":\"{}\",\"modelId\":\"{}\",\"ownerUserId\":\"{}\",\"displayType\":\"{}\",\"materialSlot\":\"{}\",\"position\":{},\"rotation\":{},\"scale\":{},\"opacity\":{},\"repeatX\":{},\"repeatY\":{},\"approved\":{},\"published\":{},\"createdAt\":\"{}\",\"updatedAt\":\"{}\"}}",esc(&a.id),esc(&a.asset_id),esc(&a.model_id),esc(&a.owner_user_id),esc(&a.display_type),esc(&a.material_slot),a.position,a.rotation,a.scale,a.opacity,a.repeat_x,a.repeat_y,a.approved,a.published,esc(&a.created_at),esc(&a.updated_at))
}
fn derivative_json(d: &AssetDerivative) -> String {
    format!("{{\"id\":\"{}\",\"assetId\":\"{}\",\"kind\":\"{}\",\"url\":\"{}\",\"status\":\"{}\",\"createdAt\":\"{}\"}}",esc(&d.id),esc(&d.asset_id),esc(&d.kind),esc(&d.url),esc(&d.status),esc(&d.created_at))
}
fn persist_assets(st: &State, v: &Vec<Asset>) {
    let _ = fs::create_dir_all(&st.data);
    let _ = fs::write(
        st.data.join("assets.json"),
        format!(
            "[{}]",
            v.iter().map(asset_json).collect::<Vec<_>>().join(",")
        ),
    );
}
fn persist_assignments(st: &State, v: &Vec<AssetModelAssignment>) {
    let _ = fs::create_dir_all(&st.data);
    let _ = fs::write(
        st.data.join("asset-model-assignments.json"),
        format!(
            "[{}]",
            v.iter().map(assignment_json).collect::<Vec<_>>().join(",")
        ),
    );
}
fn persist_derivatives(st: &State, v: &Vec<AssetDerivative>) {
    let _ = fs::create_dir_all(&st.data);
    let _ = fs::write(
        st.data.join("asset-derivatives.json"),
        format!(
            "[{}]",
            v.iter().map(derivative_json).collect::<Vec<_>>().join(",")
        ),
    );
}
fn load_assets(p: &Path) -> Vec<Asset> {
    let s = fs::read_to_string(p).unwrap_or_default();
    s.split("{\"")
        .skip(1)
        .map(|x| format!("{{\"{}", x))
        .filter_map(|o| {
            let id = val(&o, "id");
            if id.is_empty() {
                None
            } else {
                Some(Asset {
                    id,
                    owner_user_id: val(&o, "ownerUserId"),
                    owner_display_name: val(&o, "ownerDisplayName"),
                    owner_email: String::new(),
                    uploaded_by_role: val(&o, "uploadedByRole"),
                    title: val(&o, "title"),
                    description: val(&o, "description"),
                    original_filename: val(&o, "originalFilename"),
                    stored_filename: val(&o, "storedFilename"),
                    file_type: val(&o, "fileType"),
                    mime_type: val(&o, "mimeType"),
                    file_size: val(&o, "fileSize").parse().unwrap_or(0),
                    public_url: val(&o, "publicUrl"),
                    thumbnail_url: val(&o, "thumbnailUrl"),
                    category: val(&o, "category"),
                    tags: val(&o, "tags"),
                    status: val(&o, "status"),
                    visibility: val(&o, "visibility"),
                    intended_use: val(&o, "intendedUse"),
                    related_model_id: val(&o, "relatedModelId"),
                    product_assignment: val(&o, "productAssignment"),
                    collection_assignment: val(&o, "collectionAssignment"),
                    publish_location: val(&o, "publishLocation"),
                    approved_by: val(&o, "approvedBy"),
                    approved_at: val(&o, "approvedAt"),
                    published_at: val(&o, "publishedAt"),
                    moderator_note: val(&o, "moderatorNote"),
                    featured: o.contains("\"featured\":true"),
                    archived: o.contains("\"archived\":true"),
                    created_at: val(&o, "createdAt"),
                    updated_at: val(&o, "updatedAt"),
                })
            }
        })
        .collect()
}
fn load_assignments(p: &Path) -> Vec<AssetModelAssignment> {
    let s = fs::read_to_string(p).unwrap_or_default();
    s.split("{\"")
        .skip(1)
        .map(|x| format!("{{\"{}", x))
        .filter_map(|o| {
            let id = val(&o, "id");
            if id.is_empty() {
                None
            } else {
                Some(AssetModelAssignment {
                    id,
                    asset_id: val(&o, "assetId"),
                    model_id: val(&o, "modelId"),
                    owner_user_id: val(&o, "ownerUserId"),
                    display_type: val(&o, "displayType"),
                    material_slot: val(&o, "materialSlot"),
                    position: raw_json(&o, "position").unwrap_or_else(|| "null".into()),
                    rotation: raw_json(&o, "rotation").unwrap_or_else(|| "null".into()),
                    scale: raw_json(&o, "scale").unwrap_or_else(|| "null".into()),
                    opacity: val(&o, "opacity").parse().unwrap_or(1.0),
                    repeat_x: val(&o, "repeatX").parse().unwrap_or(1.0),
                    repeat_y: val(&o, "repeatY").parse().unwrap_or(1.0),
                    approved: o.contains("\"approved\":true"),
                    published: o.contains("\"published\":true"),
                    created_at: val(&o, "createdAt"),
                    updated_at: val(&o, "updatedAt"),
                })
            }
        })
        .collect()
}
fn load_derivatives(p: &Path) -> Vec<AssetDerivative> {
    let s = fs::read_to_string(p).unwrap_or_default();
    s.split("{\"")
        .skip(1)
        .map(|x| format!("{{\"{}", x))
        .filter_map(|o| {
            let id = val(&o, "id");
            if id.is_empty() {
                None
            } else {
                Some(AssetDerivative {
                    id,
                    asset_id: val(&o, "assetId"),
                    kind: val(&o, "kind"),
                    url: val(&o, "url"),
                    status: val(&o, "status"),
                    created_at: val(&o, "createdAt"),
                })
            }
        })
        .collect()
}
