"""Local-only PCM wake detector. stdout is a JSON-lines protocol."""
import base64
import json
import sys
import time
import numpy as np
from openwakeword.model import Model

def emit(value):
    print(json.dumps(value), flush=True)

try:
    model = Model(wakeword_models=['hey_jarvis'], inference_framework='onnx')
    emit({'ready': True})
    pending = np.empty(0, dtype=np.int16)
    last_detection = 0
    for line in sys.stdin:
        request = json.loads(line)
        raw = base64.b64decode(request['audio'], validate=True)
        if len(raw) > 8192 or len(raw) % 2:
            raise ValueError('Invalid audio frame')
        pending = np.concatenate((pending, np.frombuffer(raw, dtype='<i2')))
        detected = False
        while pending.size >= 1280:
            scores = model.predict(pending[:1280])
            pending = pending[1280:]
            if max(scores.values(), default=0) >= 0.6 and time.monotonic() - last_detection > 5:
                detected = True
                last_detection = time.monotonic()
                model.reset()
        emit({'detected': detected})
except Exception as error:
    emit({'error': str(error)[:300]})
    sys.exit(1)
