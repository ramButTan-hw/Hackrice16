const video = document.getElementById('webcam-feed');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const countdownElem = document.getElementById('countdown');
const hintElem = document.getElementById('status-hint');
const pulseElem = document.getElementById('pulse-display');
const emotionElem = document.getElementById('emotion-display');
const emotionConfElem = document.getElementById('emotion-confidence');
const breathingElem = document.getElementById('breathing-display');

const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });

let frameInterval = null;
let timerInterval = null;
let secondsRemaining = 30;

// 1. Maintain always-on camera preview
async function initCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
      audio: false
    });
    video.srcObject = stream;
    await video.play();

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  } catch (err) {
    hintElem.textContent = `Camera error: ${err.message}`;
  }
}

// 2. Start measurement (30s window)
function startReading() {
  console.log("startReading() clicked");
  console.log("video.readyState is:", video.readyState); // Must be 4 (HAVE_ENOUGH_DATA)

  secondsRemaining = 30;

  countdownElem.textContent = `(${secondsRemaining}s remaining)`;
  startBtn.disabled = true;
  stopBtn.disabled = false;
  emotionElem.textContent = '--';
  emotionConfElem.textContent = 'Confidence: --%';
  breathingElem.textContent = '-- BrPM';

  window.spectraBridge.startSession();

  // Begin grabbing and pushing frames at 30 FPS
  frameInterval = setInterval(() => {
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      window.spectraBridge.sendFrame({
        data: imageData.data.buffer,
        width: canvas.width,
        height: canvas.height
      });
    }
  }, 1000 / 30);

  // 30-second countdown
  timerInterval = setInterval(() => {
    secondsRemaining--;
    countdownElem.textContent = `(${secondsRemaining}s remaining)`;

    if (secondsRemaining <= 0) {
      stopReading('Reading complete!');
    }
  }, 1000);
}

// 3. Stop pushing frames and close SDK session
function stopReading(statusMessage = 'Reading canceled.') {
  clearInterval(frameInterval);
  clearInterval(timerInterval);
  frameInterval = null;
  timerInterval = null;

  window.spectraBridge.stopSession();

  startBtn.disabled = false;
  stopBtn.disabled = true;
  countdownElem.textContent = '';
  hintElem.textContent = statusMessage;
}

startBtn.addEventListener('click', startReading);
stopBtn.addEventListener('click', () => stopReading('Stopped by user.'));

// 4. Update UI with metrics and SDK feedback
window.spectraBridge.onValidation(({ code, hint }) => {
  hintElem.textContent = hint || 'Processing...';
});

// Emotion ID mapping dictionary
const EMOTION_MAP = {
  0: 'Unspecified',
  1: 'Angry',
  2: 'Contempt',
  3: 'Disgust',
  4: 'Fear',
  5: 'Happy',
  6: 'Neutral',
  7: 'Sad',
  8: 'Surprise'
};

window.spectraBridge.onMetrics((metrics) => {
  if (!metrics) return;

  // 1. Locate expression array
  const expressionList = metrics?.expression || metrics?.face?.expression;

  if (Array.isArray(expressionList) && expressionList.length > 0) {
    // Get latest frame's expression scores
    const latestFrame = expressionList[expressionList.length - 1];
    const scores = latestFrame?.scores;

    if (Array.isArray(scores) && scores.length > 0) {
      let topItem = null;
      let maxConfidence = -1;

      for (const item of scores) {
        if (typeof item.confidence === 'number' && item.confidence > maxConfidence) {
          maxConfidence = item.confidence;
          topItem = item;
        }
      }

      if (topItem && emotionElem) {
        const label = EMOTION_MAP[topItem.type] || `Type ${topItem.type}`;
        emotionElem.textContent = label;
        if (emotionConfElem) {
          emotionConfElem.textContent = `Confidence: ${maxConfidence.toFixed(1)}%`;
        }
      }
    }
  }

  // 2. Locate Breathing Rate
  const breathingList = metrics?.breathing?.rate || metrics?.breathing?.rateList;
  if (Array.isArray(breathingList) && breathingList.length > 0) {
    const latest = breathingList[breathingList.length - 1];
    const val = typeof latest === 'number' ? latest : latest?.value;
    if (typeof val === 'number' && !isNaN(val) && val > 0 && breathingElem) {
      breathingElem.textContent = `${val.toFixed(1)} BrPM`;
    }
  }
});

initCamera();