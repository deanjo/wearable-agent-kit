#!/usr/bin/env python3
"""Static reader-copy regression; this is not a real-browser interaction test."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent
FORBIDDEN = (
    'Choose a scenario below',
    '用下方场景切换',
    'three scenario buttons',
    '三个场景按钮',
)
NAMES = ('architecture-en', 'architecture-zh-CN', 'overview-en', 'overview-zh-CN')

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

for name in NAMES:
    html = (ROOT / f'{name}.html').read_text()
    for phrase in FORBIDDEN:
        assert phrase not in html, (name, phrase)
    for control in ('btn-motion', 'btn-theme', 'btn-focus-copy'):
        assert f'id="{control}"' in html, (name, control)
    assert 'WAK local sharing guard v1' in html, name
    assert 'readerPaused = readStored() === \'still\';' in html, name
    if name.startswith('architecture'):
        assert 'views' not in json.loads((ROOT / f'{name}.json').read_text())['meta'], name
        assert 'WHOOP' in html and '--output' in html, name
for phrase in FORBIDDEN:
    assert phrase not in (ROOT / 'README.md').read_text(), phrase

# Existing customized pages must remain stable on a second run; historical
# misleading hints must also be repaired rather than skipped by the v1 marker.
with tempfile.TemporaryDirectory(prefix='wak-reader-contract-') as tmp:
    folder = Path(tmp)
    shutil.copyfile(ROOT / 'customize-viewer.py', folder / 'customize-viewer.py')
    for name in NAMES:
        shutil.copyfile(ROOT / f'{name}.html', folder / f'{name}.html')
    before = {name: digest(folder / f'{name}.html') for name in NAMES}
    subprocess.run([sys.executable, str(folder / 'customize-viewer.py')], check=True)
    assert before == {name: digest(folder / f'{name}.html') for name in NAMES}
    old = folder / 'architecture-en.html'
    old.write_text(old.read_text().replace('Select a node to highlight its neighbors. ',
        'Select a node to highlight its neighbors. Choose a scenario below for offline, live-read or storage paths. ', 1))
    old = folder / 'architecture-zh-CN.html'
    old.write_text(old.read_text().replace('点击节点查看相邻关系。',
        '点击节点查看相邻关系；用下方场景切换离线、真实读取与存储边界。', 1))
    subprocess.run([sys.executable, str(folder / 'customize-viewer.py')], check=True)
    assert before == {name: digest(folder / f'{name}.html') for name in NAMES}
print('PASS: four reader contracts, existing-page idempotence, and EN/ZH hint migrations')
print('Browser interaction and reduced-motion acceptance are separate checks.')
