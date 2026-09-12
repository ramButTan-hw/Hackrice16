// Use the REST API so speech does not require a second SDK dependency.
export async function generateSpeech(text, {
  apiKey = process.env.ELEVENLABS_API_KEY,
  voice = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM',
  model = process.env.ELEVENLABS_MODEL || 'eleven_v3',
  fetcher = fetch,
  signal,
} = {}) {
  if (!apiKey) return { audioError: 'Voice is not configured. Add ELEVENLABS_API_KEY and restart the server.' };
  try {
    const response = await fetcher(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
      signal: signal ? AbortSignal.any([signal,AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
      body: JSON.stringify({ text, model_id: model }),
    });
    if (!response.ok) throw new Error('Speech request failed');
    const audio = Buffer.from(await response.arrayBuffer());
    if (!audio.length) throw new Error('Empty audio');
    return { audio: `data:audio/mpeg;base64,${audio.toString('base64')}` };
  } catch {
    return { audioError: 'Voice is unavailable. You can still read the reply.' };
  }
}
