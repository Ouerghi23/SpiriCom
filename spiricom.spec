# spiricom.spec
# ─────────────────────────────────────────────────────────────────────
# SpiriCom — PyInstaller build spec (single-file .exe)
#
# BUILD COMMAND:
#   pyinstaller spiricom.spec
#
# Output: dist/SpiriCom.exe  (a single file, no installer needed)
#
# ADAPTER: paths marked below assume this layout —
#   project_root/
#     run_desktop.py
#     src/                (your FastAPI backend package)
#     dist/                (React build output — `npm run build`)
#     models/              (joblib/.pkl model artifacts)
#     data/outputs/        (parquet analytical outputs)
#     spiricom.spec        (this file)
# Adjust the `datas` list below if your real folder names differ.
# ─────────────────────────────────────────────────────────────────────

# -*- mode: python ; coding: utf-8 -*-
import os

# FIX: paths below used to be relative to whatever directory you ran
# `pyinstaller spiricom.spec` FROM (e.g. if you cd'd into src/ first,
# 'data/outputs' resolved to src/data/outputs, which doesn't exist --
# exactly the error you hit). SPECPATH is a variable PyInstaller
# automatically injects into every .spec file's execution context: it
# is always the folder CONTAINING this .spec file itself, regardless
# of your current working directory when you invoke the command. All
# `datas` entries below are now anchored to SPECPATH explicitly, so
# this works the same whether you run pyinstaller from the project
# root, from src/, or from anywhere else.
#
# ADAPTER: this assumes spiricom.spec lives at the PROJECT ROOT
# (PFE_Ouerghi/), i.e. one level ABOVE src/, data/, models/. Move
# spiricom.spec and run_desktop.py there if they are currently inside
# src/ -- run_desktop.py's `from src.main import app` only makes sense
# if src/ is a subfolder relative to where run_desktop.py itself sits.

block_cipher = None
ROOT = SPECPATH  # folder containing this .spec file

a = Analysis(
    [os.path.join(ROOT, 'run_desktop.py')],
    pathex=[ROOT],
    binaries=[],
    datas=[
        # (source_on_disk, destination_inside_bundle)
        (os.path.join(ROOT, 'dist'),         'dist'),
        (os.path.join(ROOT, 'models'),       'models'),
        (os.path.join(ROOT, 'data', 'outputs'), os.path.join('data', 'outputs')),
        (os.path.join(ROOT, 'src'),          'src'),
    ],
    hiddenimports=[
        # uvicorn and FastAPI both rely on some dynamic imports that
        # PyInstaller's static analysis can miss -- these are the most
        # commonly needed ones. Add more here if the .exe crashes on
        # startup with a ModuleNotFoundError for something not listed.
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        # ADAPTER: add these only if you actually use them --
        # PyInstaller sometimes misses sklearn/xgboost's internal
        # dynamic imports too, given the ML models this app loads:
        'sklearn.utils._typedefs',
        'sklearn.neighbors._partition_nodes',
        'sklearn.tree._utils',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='SpiriCom',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,   # keep True at first for debugging -- shows a
                    # console window with logs/errors. Set to False
                    # once everything works, for a clean windowed app.
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,      # ADAPTER: point to a .ico file for a custom icon,
                    # e.g. icon='assets/spiricom.ico'
)
