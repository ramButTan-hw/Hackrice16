"""Run with Python 3.10–3.12 to install the optional local wake detector."""
from pathlib import Path
import subprocess
import sys
import venv

if not (3, 10) <= sys.version_info[:2] <= (3, 12):
    raise SystemExit('Please run this script with Python 3.10, 3.11, or 3.12.')
root = Path(__file__).resolve().parents[1]
target = root / 'data' / 'wake-env'
venv.EnvBuilder(with_pip=True).create(target)
python = target / ('Scripts/python.exe' if sys.platform == 'win32' else 'bin/python')
subprocess.run([str(python), '-m', 'pip', 'install', 'openwakeword==0.6.0'], check=True)
subprocess.run([str(python), '-c', "import openwakeword.utils; openwakeword.utils.download_models(model_names=['hey_jarvis']); from openwakeword.model import Model; Model(wakeword_models=['hey_jarvis'], inference_framework='onnx')"], check=True)
print('Local hey Jarvis detection is ready. Restart the desktop app.')
