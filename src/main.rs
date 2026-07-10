use std::{
    collections::HashMap,
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
#[derive(Clone)]
struct State {
    root: PathBuf,
    data: PathBuf,
    uploads: PathBuf,
    public_base: String,
    max_bytes: usize,
    admin_token: String,
    models: Arc<RwLock<Vec<Model>>>,
    avatars: Arc<RwLock<Vec<Avatar>>>,
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
        avatars: Arc::new(RwLock::new(load_avatars(&data.join("house-avatars.json")))),
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
    };
    let listener = TcpListener::bind(format!("0.0.0.0:{port}"))?;
    println!("Serving {} on http://0.0.0.0:{port}", state.root.display());
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
        ("GET", "/api/health") => json(
            s,
            200,
            true,
            &format!(
                "{{\"service\":\"ok\",\"storage\":\"ok\",\"modelCount\":{}}}",
                st.models.read().unwrap().len()
            ),
            "Service healthy",
            false,
        ),
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
        ("POST", "/api/models/upload") => upload(s, st, headers, body),
        ("POST", "/api/uploads/avatar") => upload_avatar(s, st, headers, body),
        ("POST", "/api/models") => create(s, st, body),
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
        _ if method == "POST"
            && path.starts_with("/api/houses/")
            && path.ends_with("/presence") =>
        {
            json(s, 200, true, "{}", "Presence updated", false)
        }
        _ if method == "GET" && path.starts_with("/api/houses/") && path.ends_with("/events") => {
            sse_ready(s)
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
    let body = "event: house-presence-updated\ndata: {\"count\":1}\n\n";
    write_resp(
        s,
        "200 OK",
        "text/event-stream; charset=utf-8",
        body.as_bytes(),
        false,
    )
}
fn create(s: &mut TcpStream, st: &State, body: &[u8]) -> std::io::Result<()> {
    let b = String::from_utf8_lossy(body);
    let title = val(&b, "title");
    let creator = val(&b, "creatorName");
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
        id: uuid(),
        title: trim(title, 120),
        creator: trim(creator, 80),
        description: trim(val(&b, "description"), 1000),
        category: trim(val(&b, "category"), 80),
        model_type: trim(val(&b, "modelType"), 20),
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
    let marker = format!("--{}", boundary);
    let text = String::from_utf8_lossy(body);
    let mut out = Vec::new();
    for seg in text.split(&marker).skip(1) {
        if seg.starts_with("--") {
            break;
        }
        let seg = seg.trim_start_matches("\r\n");
        if let Some(i) = seg.find("\r\n\r\n") {
            let head = &seg[..i];
            let mut data = seg.as_bytes()[i + 4..].to_vec();
            if data.ends_with(b"\r\n") {
                data.truncate(data.len() - 2)
            };
            let disp = head
                .lines()
                .find(|l| l.to_lowercase().starts_with("content-disposition"))
                .unwrap_or("");
            let name = attr(disp, "name");
            let filename = attr(disp, "filename");
            if !name.is_empty() {
                out.push(Part {
                    name,
                    filename,
                    data,
                })
            }
        }
    }
    out
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
    write!(s,"HTTP/1.1 {status}\r\nContent-Length: {}\r\nContent-Type: {ct}\r\nConnection: close\r\n\r\n",body.len())?;
    if !head {
        s.write_all(body)?
    }
    s.flush()
}
fn model_json(m: &Model) -> String {
    format!("{{\"id\":\"{}\",\"title\":\"{}\",\"creatorName\":\"{}\",\"description\":\"{}\",\"category\":\"{}\",\"modelType\":\"{}\",\"modelUrl\":\"{}\",\"iosModelUrl\":{},\"thumbnailUrl\":{},\"publishedAt\":\"{}\",\"updatedAt\":\"{}\",\"status\":\"{}\",\"featured\":{},\"spawnPosition\":{},\"scale\":{},\"rotation\":{},\"environment\":{} }}",esc(&m.id),esc(&m.title),esc(&m.creator),esc(&m.description),esc(&m.category),esc(&m.model_type),esc(&m.model_url),opt(&m.ios_model_url),opt(&m.thumbnail_url),esc(&m.published_at),esc(&m.updated_at),esc(&m.status),m.featured,m.spawn_position,m.scale,m.rotation,opt(&m.environment))
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
