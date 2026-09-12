import { fail } from '../shared/contracts.js';
export async function transcribe(audio, mime, { apiKey = process.env.ELEVENLABS_API_KEY, fetcher = fetch } = {}) {
  if (!Buffer.isBuffer(audio) || audio.length < 100 || audio.length > 8*1024*1024) fail('Record a short message (maximum 60 seconds).');
  if (!/^audio\/(webm|ogg|wav|mp4)(;.*)?$/.test(mime || '')) fail('Unsupported recording format.');
  if (!apiKey) fail('Add ELEVENLABS_API_KEY to .env and restart the backend.', 503);
  const form = new FormData();
  form.set('model_id', 'scribe_v2');
  form.set('file', new Blob([audio], { type: mime }), 'speech.' + mime.split('/')[1].split(';')[0]);
  form.set('tag_audio_events', 'false');
  let response;
  try { response = await fetcher('https://api.elevenlabs.io/v1/speech-to-text', { method:'POST', headers:{'xi-api-key':apiKey}, body:form, signal:AbortSignal.timeout(20000) }); }
  catch { fail('Transcription timed out or disconnected. Try again, or type your message.', 502); }
  if (!response.ok) fail(response.status===429?'ElevenLabs transcription quota or rate limit reached. You can still type.':'ElevenLabs transcription failed. Check your key permissions and connection.',response.status===429?429:502);
  const data = await response.json().catch(()=>null);
  if (!data?.text?.trim()) fail('No speech recognized. Try again, or type your message.',422);
  return { text:data.text.trim().slice(0,2000) };
}
