import http from 'http';
import fs from 'fs';
import { ElevenLabsClient } from 'elevenlabs';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

http.createServer(async (req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(fs.readFileSync('./index.html'));
  }

  if (req.method === 'POST' && req.url === '/api/chat') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        // 1. Call Gemini
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: body,
          }
        );
        const geminiData = await geminiRes.json();

        if (geminiData.error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: geminiData.error.message }));
        }

        const replyText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated.';

        // 2. Call ElevenLabs TTS
        const audioStream = await elevenlabs.textToSpeech.convert(
          "21m00Tcm4TlvDq8ikWAM",
          {
            modelId: "eleven_v3",
            text: replyText,
          }
        );

        const audioChunks = [];
        for await (const chunk of audioStream) {
          audioChunks.push(chunk);
        }
        const audioBase64 = Buffer.concat(audioChunks).toString('base64');

        // 3. Return reply and audio to client
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          reply: replyText,
          audio: `data:audio/mp3;base64,${audioBase64}`,
        }));

      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
}).listen(3000, () => console.log('Running at http://localhost:3000'));