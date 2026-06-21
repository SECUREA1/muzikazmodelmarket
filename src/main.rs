use std::env;
use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Component, Path, PathBuf};
use std::thread;

const NOT_FOUND_BODY: &str = "404 - File not found";

fn main() -> std::io::Result<()> {
    let port = env::var("PORT").unwrap_or_else(|_| "4173".to_string());
    let listener = TcpListener::bind(format!("0.0.0.0:{port}"))?;
    let site_root = site_root();

    println!("Serving {} on http://0.0.0.0:{port}", site_root.display());

    for stream in listener.incoming() {
        match stream {
            Ok(stream) => {
                let root = site_root.clone();
                thread::spawn(move || {
                    if let Err(error) = handle_connection(stream, &root) {
                        eprintln!("request failed: {error}");
                    }
                });
            }
            Err(error) => eprintln!("connection failed: {error}"),
        }
    }

    Ok(())
}

fn site_root() -> PathBuf {
    let dist = PathBuf::from("dist");
    if dist.join("index.html").is_file() {
        dist
    } else {
        PathBuf::from(".")
    }
}

fn handle_connection(mut stream: TcpStream, site_root: &Path) -> std::io::Result<()> {
    let mut buffer = [0; 4096];
    let bytes_read = stream.read(&mut buffer)?;
    if bytes_read == 0 {
        return Ok(());
    }

    let request = String::from_utf8_lossy(&buffer[..bytes_read]);
    let mut request_line = request
        .lines()
        .next()
        .unwrap_or_default()
        .split_whitespace();
    let method = request_line.next().unwrap_or_default();
    let target = request_line.next().unwrap_or("/");

    if method != "GET" && method != "HEAD" {
        return write_response(
            &mut stream,
            "405 Method Not Allowed",
            "text/plain; charset=utf-8",
            b"Method not allowed",
            method == "HEAD",
        );
    }

    let path = match requested_path(site_root, target) {
        Some(path) => path,
        None => {
            return write_response(
                &mut stream,
                "400 Bad Request",
                "text/plain; charset=utf-8",
                b"Bad request",
                method == "HEAD",
            )
        }
    };

    let resolved = if path.is_file() {
        path
    } else {
        site_root.join("index.html")
    };

    match fs::read(&resolved) {
        Ok(body) => write_response(
            &mut stream,
            "200 OK",
            content_type(&resolved),
            &body,
            method == "HEAD",
        ),
        Err(_) => write_response(
            &mut stream,
            "404 Not Found",
            "text/plain; charset=utf-8",
            NOT_FOUND_BODY.as_bytes(),
            method == "HEAD",
        ),
    }
}

fn requested_path(site_root: &Path, target: &str) -> Option<PathBuf> {
    let without_query = target.split(['?', '#']).next().unwrap_or("/");
    let decoded = percent_decode(without_query)?;
    let relative = decoded.trim_start_matches('/');
    let mut path = site_root.to_path_buf();

    for component in Path::new(relative).components() {
        match component {
            Component::Normal(part) => path.push(part),
            Component::CurDir => {}
            _ => return None,
        }
    }

    if path.is_dir() {
        path.push("index.html");
    }

    Some(path)
}

fn percent_decode(value: &str) -> Option<String> {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;

    while index < bytes.len() {
        if bytes[index] == b'%' {
            let hex = bytes.get(index + 1..index + 3)?;
            let hex = std::str::from_utf8(hex).ok()?;
            decoded.push(u8::from_str_radix(hex, 16).ok()?);
            index += 3;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }

    String::from_utf8(decoded).ok()
}

fn content_type(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or_default()
    {
        "css" => "text/css; charset=utf-8",
        "html" => "text/html; charset=utf-8",
        "ico" => "image/x-icon",
        "jpg" | "jpeg" => "image/jpeg",
        "js" => "text/javascript; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "png" => "image/png",
        "svg" => "image/svg+xml",
        "txt" => "text/plain; charset=utf-8",
        "webp" => "image/webp",
        _ => "application/octet-stream",
    }
}

fn write_response(
    stream: &mut TcpStream,
    status: &str,
    content_type: &str,
    body: &[u8],
    head_only: bool,
) -> std::io::Result<()> {
    write!(
        stream,
        "HTTP/1.1 {status}\r\nContent-Length: {}\r\nContent-Type: {content_type}\r\nConnection: close\r\n\r\n",
        body.len()
    )?;

    if !head_only {
        stream.write_all(body)?;
    }

    stream.flush()
}
