const video = document.getElementById('webcam-feed');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const countdownElem = document.getElementById('countdown');
const hintElem = document.getElementById('status-hint');
const pulseElem = document.getElementById('pulse-display');
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
  secondsRemaining = 30;
  countdownElem.textContent = `(${secondsRemaining}s remaining)`;
  startBtn.disabled = true;
  stopBtn.disabled = false;
  pulseElem.textContent = '-- BPM';
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

window.spectraBridge.onMetrics((metrics) => {
  const pulse = metrics?.cardio?.pulseRateList?.slice(-1)[0]?.value 
             ?? metrics?.cardio?.pulseRate?.value;
  if (pulse !== undefined) {
    pulseElem.textContent = `${pulse.toFixed(1)} BPM`;
  }

  const breathing = metrics?.breathing?.rateList?.slice(-1)[0]?.value 
                 ?? metrics?.breathing?.rate?.slice(-1)[0]?.value;
  if (breathing !== undefined) {
    breathingElem.textContent = `${breathing.toFixed(1)} BrPM`;
  }
});

initCamera();