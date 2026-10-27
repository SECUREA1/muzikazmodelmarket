#!/usr/bin/env python3
"""Export the project's original artwork, models and visual source into one ZIP.

Requires Pillow, ReportLab, Playwright and Chromium for preview generation.
The game source and original artwork are never changed by this exporter.
"""

import argparse
import base64
import csv
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess
import sys
from datetime import datetime, timezone
import xml.etree.ElementTree as ET
import zipfile

from PIL import Image, ImageOps
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas


VISUAL_EXTENSIONS = {
    '.png', '.jpg', '.jpeg', '.svg', '.ico', '.webp', '.gif', '.avif',
    '.glb', '.gltf', '.obj', '.fbx', '.blend', '.stl', '.usdz', '.psd', '.ai', '.eps',
}
SKIP_DIRECTORIES = {
    '.git', 'node_modules', 'dist', 'target', '.cache', '__pycache__',
    '.venv', 'venv', 'work', 'data', 'uploads',
}
MODEL_EXTENSIONS = {'.glb', '.gltf', '.obj', '.fbx', '.blend', '.stl', '.usdz'}
LEGACY_ROOTS = {
    'muzikaz_high_level_image_pack1', 'muzikaz_transparent_assets',
    'muzikaz_site', 'muzikaz_site 2', 'muzikaz_page', 'muzikaz_page 2',
    'muzikaz_github_website', 'muzikaz_github_website 2',
}
CATEGORIES = {
    'merchandise': 'Merchandise',
    'avatars': 'Avatars',
    'characters': 'Characters',
    'branding': 'Logos & branding',
    'worlds-vehicles-props': 'Worlds, vessels, vehicles & props',
    'ui-icons': 'Interface & icons',
    'backgrounds-effects': 'Backgrounds & effects',
    'reference-collections': 'References & collections',
}
PACK_NAME = 'MUZIKAZ-Mega-Graphics-Pack'


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def discover(repo):
    files = []
    for current, directories, filenames in os.walk(repo, followlinks=False):
        directories[:] = sorted(d for d in directories
                                if d not in SKIP_DIRECTORIES
                                and not (Path(current) / d).is_symlink())
        for filename in sorted(filenames):
            path = Path(current) / filename
            if path.is_file() and not path.is_symlink():
                files.append(path.relative_to(repo))
    return sorted(files, key=lambda path: path.as_posix())


def category_for(path):
    text = path.as_posix().lower()
    name = path.stem.lower()
    if '/avatars/' in text or 'avatar' in name:
        return 'avatars'
    if re.search(r'merch|/products/|/product-pages/|resort-products|hoodie|keychain|wristband|lanyard|bottle|baseball_cap|t_shirt|sweatshirt', text):
        return 'merchandise'
    if path.suffix.lower() in MODEL_EXTENSIONS:
        return 'worlds-vehicles-props'
    if '/characters/' in text or '03_characters' in text or re.search(r'character|mascot|wolf|demon|ape_|sheep|penguin|goggles|donkey|the_crew|meet_crew|sharko|pixella', name):
        return 'characters'
    if re.search(r'/brand/|/branding/|01_brand|logo|wordmark|tagline|favicon', text):
        return 'branding'
    if re.search(r'background|smoke|energy|effects|10_backgrounds', text):
        return 'backgrounds-effects'
    if re.search(r'/ui/|06_ui|icon|button|/context|07_context|cta_|app-icons', text):
        return 'ui-icons'
    if text.startswith('public/images/') or 'world-map' in name or 'world-poster' in name or '/sports-surfaces/' in text:
        return 'worlds-vehicles-props'
    return 'reference-collections'


def support_file(path):
    parts = path.parts
    extension = path.suffix.lower()
    if parts[:2] == ('public', 'models') and extension == '.json':
        return True
    if parts[:2] in [('public', 'js'), ('public', 'css'), ('public', 'vendor')]:
        return True
    if parts[:2] == ('public', 'assets') and extension in {'.css', '.json', '.txt'}:
        return True
    if parts[0] in LEGACY_ROOTS and extension in {'.html', '.css', '.js', '.json', '.txt'}:
        return True
    if len(parts) == 1:
        if path.name in {'admin.js', 'admin.html'}:
            return False
        if extension in {'.html', '.css', '.js'}:
            return True
        if path.name in {'branding-profile.json', 'README.txt', 'muzikaz_page.zip'}:
            return True
        if extension == '.mjs' and not path.name.startswith('server-') and ('world' in path.stem or 'catalog' in path.stem):
            return True
    return path.as_posix() in {
        'scripts/export-graphics-pack.py', 'scripts/render-graphics-pack.py',
        'scripts/graphics-pack-gallery.html', 'scripts/build-game-asset-registry.mjs',
    }


def glb_details(path):
    raw = path.read_bytes()
    magic, version, length = struct.unpack_from('<4sII', raw)
    if magic != b'glTF' or version != 2 or length != len(raw):
        raise ValueError('Invalid glTF 2 binary header or length')
    size, kind = struct.unpack_from('<II', raw, 12)
    if kind != 0x4e4f534a or size % 4 or size + 20 > len(raw):
        raise ValueError('Invalid GLB JSON chunk')
    document = json.loads(raw[20:20 + size])
    return {
        'meshes': len(document.get('meshes', [])),
        'materials': len(document.get('materials', [])),
        'animations': len(document.get('animations', [])),
        'textures': len(document.get('textures', [])),
        'extensionsRequired': document.get('extensionsRequired', []),
    }


def preview_raster(source, destination):
    with Image.open(source) as image:
        image.verify()
    with Image.open(source) as image:
        width, height = image.size
        alpha = image.mode in {'RGBA', 'LA'} or 'transparency' in image.info
        rgba = ImageOps.exif_transpose(image).convert('RGBA')
        transparent = rgba.getchannel('A').getextrema()[0] < 255 if alpha else False
        rgba.thumbnail((560, 560), Image.Resampling.LANCZOS)
        rgba.save(destination, 'WEBP', quality=88, method=4)
    return {'width': width, 'height': height, 'hasAlpha': alpha, 'hasTransparency': transparent}


def svg_details(path):
    element = ET.parse(path).getroot()
    if element.tag.rsplit('}', 1)[-1] != 'svg':
        raise ValueError('Missing SVG root')
    viewbox = re.split(r'[\s,]+', element.get('viewBox', '').strip())
    width = element.get('width', '')
    height = element.get('height', '')
    number = lambda value: float(re.match(r'^[0-9.]+', value).group()) if re.match(r'^[0-9.]+', value) else None
    return {
        'width': number(width) or (float(viewbox[2]) if len(viewbox) == 4 else 300),
        'height': number(height) or (float(viewbox[3]) if len(viewbox) == 4 else 150),
        'hasAlpha': True,
        'spriteSheet': any(child.tag.endswith('symbol') for child in element.iter()),
    }


def render_svg_previews(repo, stage, entries):
    if not entries:
        return
    from playwright.sync_api import sync_playwright
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=shutil.which('chromium'), headless=True,
                                              args=['--no-sandbox', '--disable-dev-shm-usage'])
        page = browser.new_page()
        page.set_content('<!doctype html><title>Local SVG preview renderer</title>')
        for entry in entries:
            source = (repo / entry['sourcePath']).read_bytes()
            width, height = entry['width'], entry['height']
            if entry.get('spriteSheet'):
                # A sprite has no visible root artwork. Show every symbol in a
                # derivative grid while retaining the untouched original SVG.
                original = ET.fromstring(source)
                namespace = '{http://www.w3.org/2000/svg}'
                symbols = [child for child in original if child.tag.endswith('symbol')]
                width, height = 480, ((len(symbols) + 3) // 4) * 120
                grid = ET.Element(namespace + 'svg', {'width': str(width), 'height': str(height),
                    'viewBox': f'0 0 {width} {height}', 'fill': 'none',
                    'stroke': '#a9e961', 'stroke-width': '1.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round'})
                definitions = ET.SubElement(grid, namespace + 'defs')
                definitions.extend(symbols)
                for index, symbol in enumerate(symbols):
                    cell = ET.SubElement(grid, namespace + 'svg', {
                        'x': str((index % 4) * 120 + 24), 'y': str((index // 4) * 120 + 24),
                        'width': '72', 'height': '72', 'viewBox': symbol.get('viewBox', '0 0 24 24')})
                    ET.SubElement(cell, namespace + 'use', {'href': '#' + symbol.attrib['id']})
                source = ET.tostring(grid)
            # Paint local bytes into a canvas: no remote fetches or SVG modifications.
            data = page.evaluate('''async ({source, width, height}) => {
              const image = new Image();
              image.src = 'data:image/svg+xml;base64,' + source;
              await image.decode();
              const scale = Math.min(1, 560 / Math.max(width, height));
              const canvas = document.createElement('canvas');
              canvas.width = Math.max(1, Math.round(width * scale));
              canvas.height = Math.max(1, Math.round(height * scale));
              canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
              return canvas.toDataURL('image/webp', 0.9).split(',')[1];
            }''', {'source': base64.b64encode(source).decode(), 'width': width, 'height': height})
            (stage / entry['previewPath']).write_bytes(base64.b64decode(data))
        browser.close()


def manifest_names(repo):
    names = {}
    for relative in ['public/models/avatars.json', 'public/models/glb-models.json', 'public/models/backpack-assets.json']:
        document = json.loads((repo / relative).read_text())
        records = document if isinstance(document, list) else document.get('assets', document.get('models', []))
        for record in records:
            model = record.get('modelUrl', '').lstrip('/')
            if model and record.get('name'):
                names[model] = record['name']
    return names


def reference_audit(repo, copied):
    checked, missing, remote = [], [], []
    keys = {'modelUrl', 'modelUrls', 'modelPath', 'thumbnailUrl', 'thumbnail',
            'image', 'imageUrl', 'textureUrl', 'texturePath', 'effectUrl', 'previewImages'}
    def reference(child, catalog):
        if isinstance(child, list):
            for value in child:
                reference(value, catalog)
        elif isinstance(child, str) and child and not child.startswith('data:'):
            if child.startswith(('https://', 'http://', '//')):
                remote.append({'catalog': catalog, 'path': child})
            else:
                path = child.lstrip('/').split('?', 1)[0].split('#', 1)[0]
                checked.append(path)
                if path not in copied:
                    missing.append({'catalog': catalog, 'path': child})
    def visit(value, catalog):
        if isinstance(value, dict):
            for key, child in value.items():
                if key in keys:
                    reference(child, catalog)
                visit(child, catalog)
        elif isinstance(value, list):
            for child in value:
                visit(child, catalog)
    for catalog in sorted((repo / 'public/models').rglob('*.json')):
        visit(json.loads(catalog.read_text()), catalog.relative_to(repo).as_posix())
    return {'checkedReferences': len(checked), 'missingLocalReferences': missing, 'remoteReferences': remote}


def contact_sheet(stage, assets, summary):
    destination = stage / 'contact-sheets.pdf'
    document = canvas.Canvas(str(destination), pagesize=A4)
    document.setTitle('MUZIKAZ complete graphics contact sheets')
    document.setAuthor('MUZIKAZ graphics archive')
    page_width, page_height = A4
    def text(x, y, value, size=10, color='#d6dee8'):
        document.setFillColor(colors.HexColor(color))
        document.setFont('Helvetica', size)
        document.drawString(x, y, str(value))
    def background(title, subtitle):
        document.setFillColor(colors.HexColor('#101722'))
        document.rect(0, 0, page_width, page_height, fill=1, stroke=0)
        text(32, page_height - 43, 'MUZIKAZ / GRAPHICS ARCHIVE', 10, '#a9e961')
        text(32, page_height - 77, title, 22, '#ffffff')
        text(32, page_height - 98, subtitle, 9)
    background('Every original. One collection.', 'Merchandise / Avatars / Characters / Worlds / Branding / UI')
    y = page_height - 160
    for title, value in [
        ('Original visual files', summary['assetCount']),
        ('Unique artwork and model contents', summary['uniqueAssetCount']),
        ('Original GLB models', summary['countsByExtension'].get('.glb', 0)),
        ('Image files', summary['assetCount'] - summary['countsByExtension'].get('.glb', 0)),
    ]:
        text(32, y, value, 28, '#a9e961'); text(118, y + 6, title, 12); y -= 58
    y -= 10
    for line in [
        'Extract the ZIP, then open index.html for search, filters and original downloads.',
        'These sheets show one preview per unique file content. Every duplicate original',
        'path remains in the archive and is listed in inventory.csv and manifest.json.',
        'GLB thumbnails are actual model renders; original GLBs are unchanged.',
        'Procedural fishing, shipping and builder visuals are included as source recipes.',
        'Transparent attempts retain their existing automated-background-removal notes.',
    ]:
        text(32, y, line, 9); y -= 18
    text(32, 48, 'Source: ' + summary['sourceCommit'][:12] + ' / Built: ' + summary['builtAt'][:10], 9)
    document.showPage()
    unique = [entry for entry in assets if not entry.get('duplicateOf')]
    page_number = 1
    for category, title in CATEGORIES.items():
        entries = [entry for entry in unique if entry['category'] == category]
        for start in range(0, len(entries), 20):
            page_number += 1
            background(title, f'{len(entries)} unique assets / {start + 1}-{min(start + 20, len(entries))}')
            cell_width = (page_width - 64) / 4
            cell_height = 133
            for index, entry in enumerate(entries[start:start + 20]):
                column, row = index % 4, index // 4
                x = 32 + column * cell_width
                y = page_height - 125 - row * cell_height
                document.setFillColor(colors.HexColor('#202b3b'))
                document.roundRect(x + 3, y - 93, cell_width - 10, 92, 5, stroke=0, fill=1)
                preview = stage / entry['previewPath']
                if preview.is_file():
                    with Image.open(preview) as image:
                        rgba = image.convert('RGBA')
                        bg = Image.new('RGBA', rgba.size, '#202b3b')
                        bg.alpha_composite(rgba)
                        thumb = ImageOps.contain(bg.convert('RGB'), (250, 180), Image.Resampling.LANCZOS)
                        encoded = io.BytesIO()
                        thumb.save(encoded, 'JPEG', quality=85, optimize=True)
                        encoded.seek(0)
                        document.drawImage(ImageReader(encoded), x + 6, y - 89,
                                           width=cell_width - 16, height=84,
                                           preserveAspectRatio=True, anchor='c', anchorAtXY=False)
                label = entry['name'].encode('latin-1', errors='replace').decode('latin-1')
                text(x + 4, y - 106, label[:25], 8, '#ffffff')
                text(x + 4, y - 119, entry['extension'][1:].upper() + ' / ' + entry['sha256'][:10], 7)
            text(32, 25, f'Unique previews / page {page_number} / filenames and full paths in inventory.csv', 8)
            document.showPage()
    document.save()


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def build(repo, stage, archive, reuse_model_previews=False):
    if stage == repo or repo in stage.parents and stage.relative_to(repo).parts[0] != 'work':
        raise ValueError('Build directory must be outside the repository or inside its ignored work/ directory')
    stage.mkdir(parents=True, exist_ok=True)
    (stage / 'previews').mkdir(exist_ok=True)
    # Reusing a build folder must not retain deleted or renamed original files.
    if (stage / 'originals').exists():
        shutil.rmtree(stage / 'originals')
    discovered = discover(repo)
    visuals = [path for path in discovered if path.suffix.lower() in VISUAL_EXTENSIONS]
    supports = [path for path in discovered if path not in visuals and support_file(path)]
    print(f'Found {len(visuals)} originals and {len(supports)} supporting source files.', flush=True)
    names = manifest_names(repo)
    assets, support_entries, seen, svg_entries = [], [], {}, []
    for index, path in enumerate(visuals):
        source = repo / path
        sha = digest(source)
        destination = Path('originals') / path
        (stage / destination).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, stage / destination)
        extension = path.suffix.lower()
        entry = {
            'id': f'asset-{index + 1:04d}',
            'name': names.get(path.as_posix(), re.sub(r'[_-]+', ' ', path.stem)),
            'sourcePath': path.as_posix(), 'path': destination.as_posix(),
            'category': category_for(path),
            'kind': 'model' if extension in MODEL_EXTENSIONS else 'image',
            'extension': extension, 'bytes': source.stat().st_size, 'sha256': sha,
            'previewPath': f'previews/{sha}.webp',
            'duplicateOf': seen.get(sha),
        }
        seen.setdefault(sha, entry['id'])
        if extension == '.glb':
            entry['model'] = glb_details(source)
            if path.name == '318bb72e-99a3-4258-9684-8db3b35cc753 2.glb':
                entry['reviewNotes'] = ['Existing catalog mismatch: labelled IonCore Sentinel, but this GLB contains the same twin-turbine engine as vehicles/DRONE ENGINE.glb. Original label and file retained.']
        elif extension == '.svg':
            entry.update(svg_details(source))
            if not entry['duplicateOf']:
                svg_entries.append(entry)
        else:
            entry.update(preview_raster(source, stage / entry['previewPath']))
        assets.append(entry)
    render_svg_previews(repo, stage, svg_entries)
    print('All raster and SVG originals validate; image previews generated.', flush=True)
    helper = repo / 'scripts/render-graphics-pack.py'
    if not helper.is_file():
        raise FileNotFoundError('Required local model renderer is missing: ' + str(helper))
    model_report_path = stage / 'previews/render-report.json'
    if not reuse_model_previews:
        subprocess.run([sys.executable, str(helper), '--repo', str(repo), '--output', str(stage / 'previews')], check=True)
    model_report = json.loads(model_report_path.read_text()) if model_report_path.exists() else []
    reports_by_path = {record['sourcePath']: record for record in model_report}
    for entry in assets:
        if entry['kind'] == 'model':
            rendered = reports_by_path.get(entry['sourcePath'], {})
            if rendered.get('status') != 'rendered' or rendered.get('sha256') != entry['sha256'] or not (stage / entry['previewPath']).is_file():
                raise ValueError(f"Missing real model preview: {entry['sourcePath']} / {rendered.get('error', '')}")
            entry['model'].update(rendered.get('model', {}))
    for path in supports:
        source = repo / path
        destination = Path('originals') / path
        (stage / destination).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, stage / destination)
        support_entries.append({'sourcePath': path.as_posix(), 'path': destination.as_posix(),
                                'bytes': source.stat().st_size, 'sha256': digest(source)})
    from collections import Counter
    built_at = datetime.now(timezone.utc).isoformat(timespec='seconds')
    commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip()
    summary = {
        'title': 'MUZIKAZ Mega Graphics Pack', 'builtAt': built_at, 'sourceCommit': commit,
        'assetCount': len(assets), 'uniqueAssetCount': len(seen),
        'duplicateSourcePaths': len(assets) - len(seen),
        'totalBytes': sum(entry['bytes'] for entry in assets),
        'supportFileCount': len(support_entries),
        'countsByCategory': dict(Counter(entry['category'] for entry in assets)),
        'countsByExtension': dict(Counter(entry['extension'] for entry in assets)),
    }
    audit = reference_audit(repo, {entry['sourcePath'] for entry in assets + support_entries})
    audit.update({
        'validVisualFiles': len(assets), 'invalidVisualFiles': [],
        'actualModelPreviews': len(model_report), 'previewsGenerated': len(seen),
        'originalsPreservedByteForByte': True,
        'metadataWarnings': [{'sourcePath': entry['sourcePath'], 'notes': entry['reviewNotes']}
                             for entry in assets if entry.get('reviewNotes')],
        'excluded': ['Runtime accounts, wallets, saves, land databases and uploads',
                     'Git history, dependencies, build output and scratch files',
                     'One-byte extensionless glb and muzikaz_high_level_image_pack placeholders'],
        'notes': [
            'Duplicate files are retained at every original source path and identified by SHA-256.',
            'Automated transparent attempts retain their original README caveats; no layered artwork is invented.',
            'Procedural graphics are included as original recipes, catalog records and scene modules, not falsely labelled as GLB exports.',
            'All GLB previews use original model materials and vendored local Three.js; no external graphics fetched.',
            'Existing third-party notices are preserved. This export does not assign new asset licensing terms.',
            'The legacy muzikaz_page.zip is preserved; its only image duplicates existing reference.png artwork.',
            'The SVG symbol sprite is shown as a derivative grid; the source sprite is unchanged.',
            'Some transparent product cutouts remove dark product detail. Opaque product tiles and original reference art are preserved alongside them.',
        ],
    })
    if audit['missingLocalReferences']:
        raise ValueError(f"Catalog references were omitted: {audit['missingLocalReferences']}")
    write_json(stage / 'manifest.json', {'schemaVersion': 1, 'summary': summary, 'assets': assets, 'supportFiles': support_entries})
    write_json(stage / 'audit.json', audit)
    registry = json.loads((repo / 'public/models/game-asset-registry.json').read_text())
    procedural = [record for record in registry.get('assets', []) if record.get('native') or record.get('generated')]
    write_json(stage / 'procedural-assets.json', {
        'note': 'Original catalog recipes. Renderers are retained under originals/public/js/.',
        'assetCount': len(procedural), 'assets': procedural,
    })
    with (stage / 'inventory.csv').open('w', encoding='utf-8-sig', newline='') as stream:
        fields = ['id', 'name', 'category', 'kind', 'extension', 'sourcePath', 'path', 'width', 'height', 'bytes', 'sha256', 'duplicateOf', 'previewPath']
        writer = csv.DictWriter(stream, fieldnames=fields, extrasaction='ignore')
        writer.writeheader(); writer.writerows(assets)
    template = (repo / 'scripts/graphics-pack-gallery.html').read_text()
    safe_json = lambda value: json.dumps(value, ensure_ascii=False).replace('<', '\\u003c').replace('&', '\\u0026')
    template = template.replace('__PACK_SUMMARY_JSON__', safe_json(summary)).replace('__PACK_ASSETS_JSON__', safe_json(assets))
    (stage / 'index.html').write_text(template, encoding='utf-8')
    contact_sheet(stage, assets, summary)
    readme = f'''MUZIKAZ MEGA GRAPHICS PACK
Built: {built_at}
Game asset source commit: {commit}

START HERE
Extract this entire ZIP, then open index.html. It works offline without a server.
Search by name or source path; filter merch, avatars, characters and other art.
Download original files from the gallery. Previews are generated derivatives;
all original images and model files are copied byte-for-byte under originals/.

CONTENTS
{len(assets)} original visual files; {len(seen)} unique file contents.
{len(assets) - len(seen)} duplicate source paths preserved and marked in the catalog.
{summary['countsByExtension'].get('.glb', 0)} real GLB models: 30 files in avatars/, 11 environments, four props and one vehicle.
{len(procedural)} procedural/native catalog recipes with original visual runtime source.
{len(support_entries)} supporting catalog, scene, stylesheet, template and decoder files.

index.html                  Searchable offline gallery and original downloads.
contact-sheets.pdf          Printable visual index, one preview per unique content.
inventory.csv              Spreadsheet index of every original path and checksum.
manifest.json              Complete asset and support-file metadata and SHA-256.
procedural-assets.json     Runtime-generated items, characters, vessels and scenery recipes.
audit.json                 Validation, catalog coverage and provenance notes.
SHA256SUMS.txt             Checksums for every other file in this archive.
originals/                 Untouched files with their repository paths retained.
previews/                  Image thumbnails and actual original-material model renders.

USING THE ASSETS
Original PNG/JPEG/SVG/ICO files keep their source resolution and transparency.
GLB files can be opened in Blender or another glTF-compatible 3D application.
The offline gallery shows still renders; it does not require a hosted 3D viewer.
Procedural fishing equipment, fishing boats, live shipping vessels, cranes,
map geometry, characters, vehicles and Builder graphics use scene-generating
JavaScript and catalog data. Their source is included in originals/public/js/
and originals/public/models/, alongside world definitions at originals/*.mjs.
They are not baked GLB/STL exports. The archive is an asset library, not a
standalone game server. Original web-root asset references remain unchanged.

ORIGINALS AND RIGHTS
All duplicate paths remain available so existing source references can be traced.
The original transparent-attempt notes are preserved: some versions use automated
dark-background removal from flattened references and are not layered masters.
No PSD, Illustrator or other layered sources were present to export.
Existing third-party notices (including Three.js) are retained. No new licensing
terms or ownership claims are added by this archive.
Runtime accounts, wallets, saved player data, uploads and Git history are excluded.

REVIEW FINDING
The existing IonCore Sentinel catalog entry points to an engine GLB identical to
vehicles/DRONE ENGINE.glb. Both original paths and the original catalog label are
preserved; see audit.json metadataWarnings. The archive does not relabel the game.

REBUILD
From the repository: npm run export:graphics -- --output-dir /path/to/build
Requires Python 3, Pillow, ReportLab, Playwright and Chromium, plus the included
Three.js modules. Export tools are retained in originals/scripts/.
'''
    (stage / 'README.txt').write_text(readme, encoding='utf-8')
    # Explicit allowlist prevents stale or unrelated staging files entering the ZIP.
    generated = {'manifest.json', 'audit.json', 'procedural-assets.json', 'inventory.csv',
                 'index.html', 'contact-sheets.pdf', 'README.txt',
                 'previews/render-report.json', 'previews/model-contact-sheet.jpg'}
    included = generated | {entry['path'] for entry in assets + support_entries} | {entry['previewPath'] for entry in assets}
    files = sorted(stage / relative for relative in included)
    (stage / 'SHA256SUMS.txt').write_text(''.join(f'{digest(path)}  {path.relative_to(stage).as_posix()}\n' for path in files), encoding='utf-8')
    archive.parent.mkdir(parents=True, exist_ok=True)
    temporary = archive.with_suffix('.zip.tmp')
    with zipfile.ZipFile(temporary, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as output:
        for path in files + [stage / 'SHA256SUMS.txt']:
            output.write(path, PACK_NAME + '/' + path.relative_to(stage).as_posix())
    with zipfile.ZipFile(temporary) as output:
        bad = output.testzip()
        if bad:
            raise ValueError('ZIP CRC failed: ' + bad)
    temporary.replace(archive)
    Path(str(archive) + '.sha256').write_text(digest(archive) + '  ' + archive.name + '\n')
    print(json.dumps({'archive': str(archive), 'archiveBytes': archive.stat().st_size,
                      'summary': summary, 'catalogReferencesChecked': audit['checkedReferences']}, indent=2), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--output-dir', type=Path)
    parser.add_argument('--archive', type=Path)
    parser.add_argument('--reuse-model-previews', action='store_true', help='Reuse already rendered model previews only when source checksums match')
    args = parser.parse_args()
    repo = args.repo.resolve()
    stage = (args.output_dir or repo / 'work/graphics-pack-build').resolve()
    archive = (args.archive or stage.parent / f'{PACK_NAME}.zip').resolve()
    if archive == stage or stage in archive.parents:
        parser.error('Archive must be outside the build directory')
    build(repo, stage, archive, args.reuse_model_previews)


if __name__ == '__main__':
    main()
