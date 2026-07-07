# -*- mode: python ; coding: utf-8 -*-
# PyInstaller 스펙 — capture-engine 단일 실행 파일 (명세서 §7)
# 빌드: .venv/bin/python -m PyInstaller build.spec --noconfirm
# 산출물: dist/capture-engine(.exe) → electron-app/resources/engine/ 로 복사됨

a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=[],
    datas=[],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # 매칭에 불필요한 대형 모듈 제외 (용량 절감)
        'matplotlib',
        'PIL.ImageQt',
        'PyQt5',
        'PySide2',
        'tkinter',
    ],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='capture-engine',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,  # stdout/stderr를 Electron이 로그로 수집
    disable_windowed_traceback=False,
)
