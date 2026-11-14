#!/usr/bin/env python3
"""Download image files from a Google Drive subtree without overwriting."""
import argparse
import hashlib
import os
from pathlib import Path
import re
import sys
import tempfile

from google.auth.transport.requests import AuthorizedSession, Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow

ROOT = '1Ewx7UlTgu7OyNC8kpSFtlottw9EG4QaK'
CONFIG = Path.home() / '.config/HighSchoolPractice'
CLIENT = CONFIG / 'client_secret_210037914508-odkndioctarfoqa26qv94tc87d2djphs.apps.googleusercontent.com.json'
TOKEN = CONFIG / 'token.json'
SCOPE = ['https://www.googleapis.com/auth/drive.readonly']
API = 'https://www.googleapis.com/drive/v3/files'
FOLDER = 'application/vnd.google-apps.folder'
REPO = Path.cwd().resolve()


def session(client):
    creds = Credentials.from_authorized_user_file(str(TOKEN), SCOPE) if TOKEN.exists() else None
    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
    elif not creds or not creds.valid:
        flow = InstalledAppFlow.from_client_secrets_file(str(client), SCOPE)
        creds = flow.run_local_server(port=0, open_browser=False, authorization_prompt_message='Open this URL in your browser and sign in: {url}')
    CONFIG.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd = os.open(TOKEN, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w') as f:
        f.write(creds.to_json())
    return AuthorizedSession(creds)


def get_json(http, url, **params):
    response = http.get(url, params=params, timeout=60)
    response.raise_for_status()
    return response.json()


def safe_name(name):
    if name in ('', '.', '..') or '/' in name or '\\' in name or '\0' in name:
        raise ValueError(f'Unsafe file name: {name!r}')
    return name


def children(http, parent):
    token = None
    while True:
        params = {'q': f"'{parent}' in parents and trashed = false", 'fields': 'nextPageToken,files(id,name,mimeType)', 'pageSize': 1000, 'supportsAllDrives': 'true', 'includeItemsFromAllDrives': 'true'}
        if token:
            params['pageToken'] = token
        result = get_json(http, API, **params)
        yield from result.get('files', [])
        token = result.get('nextPageToken')
        if not token:
            break


def relative_path(http, folder):
    parts, visited = [], set()
    while folder != ROOT:
        if folder in visited:
            raise ValueError('Cycle in Drive folder ancestry')
        visited.add(folder)
        item = get_json(http, f'{API}/{folder}', fields='id,name,mimeType,parents', supportsAllDrives='true')
        if item['mimeType'] != FOLDER or len(item.get('parents', [])) != 1:
            raise ValueError('Cannot verify folder ancestry under the configured Drive root')
        parts.append(safe_name(item['name']))
        folder = item['parents'][0]
    return Path(*reversed(parts))


def checksum(path):
    digest = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            digest.update(block)
    return digest.digest()


def download(http, item, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=target.parent, prefix='.practice-', delete=False) as f:
        temp = Path(f.name)
        try:
            with http.get(f"{API}/{item['id']}", params={'alt': 'media', 'supportsAllDrives': 'true'}, stream=True, timeout=120) as response:
                response.raise_for_status()
                for block in response.iter_content(1024 * 1024):
                    f.write(block)
        except BaseException:
            temp.unlink(missing_ok=True)
            raise
    try:
        if target.exists():
            return 'identical' if target.is_file() and checksum(temp) == checksum(target) else 'conflict'
        try:
            os.link(temp, target)
        except FileExistsError:
            return 'conflict'
        return 'downloaded'
    finally:
        temp.unlink(missing_ok=True)


def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(line_buffering=True)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('folder', help='Drive folder URL or ID')
    parser.add_argument('--destination', help='Expected repository-relative destination; checked against Drive ancestry')
    parser.add_argument('--client', type=Path, default=CLIENT)
    args = parser.parse_args()
    match = re.search(r'/folders/([\w-]+)', args.folder)
    folder = match.group(1) if match else args.folder
    if not re.fullmatch(r'[\w-]+', folder):
        parser.error('Invalid folder URL or ID')
    http = session(args.client.expanduser())
    relative = relative_path(http, folder)
    if args.destination and Path(args.destination) != relative:
        raise ValueError(f'Drive maps to {relative}, not {args.destination}; resolve the mapping before continuing')
    counts = {'downloaded': 0, 'identical': 0, 'conflict': 0, 'failed': 0}

    def walk(folder_id, directory):
        items = list(children(http, folder_id))
        names = [item['name'] for item in items if item['mimeType'] == FOLDER or item['mimeType'].startswith('image/')]
        if len(names) != len(set(names)):
            raise ValueError(f'Duplicate Drive names in {directory}; resolve ambiguity')
        for item in items:
            if item['mimeType'] != FOLDER and not item['mimeType'].startswith('image/'):
                continue
            target = directory / safe_name(item['name'])
            if not target.resolve().is_relative_to(REPO):
                raise ValueError(f'Destination escapes repository: {target}')
            try:
                if item['mimeType'] == FOLDER:
                    walk(item['id'], target)
                else:
                    status = download(http, item, target)
                    counts[status] += 1
                    print(f'{status}: {target.relative_to(REPO)}', flush=True)
            except Exception as exc:
                counts['failed'] += 1
                print(f'failed: {target.relative_to(REPO)}: {exc}', file=sys.stderr, flush=True)

    walk(folder, REPO / relative)
    print('Summary: ' + ', '.join(f'{k}={v}' for k, v in counts.items()))
    return 1 if counts['failed'] or counts['conflict'] else 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as exc:
        print(f'Error: {exc}', file=sys.stderr)
        sys.exit(1)
