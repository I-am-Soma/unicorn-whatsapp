// elevenlabs.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const ELEVENLABS_API_KEY = 'sk_c9f131f70f0fdc5f26cf7352e698d42629c5b29a87b64ae4';
const VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'; // Rachel

const generarAudioElevenLabs = async (texto, nombreArchivo = 'respuesta.mp3') => {
  try {
    const outputPath = path.resolve(__dirname, nombreArchivo);

    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
      {
        text: texto,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.4,
          similarity_boost: 0.75,
        },
      },
      {
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
        },
        responseType: 'stream',
      }
    );

    const writer = fs.createWriteStream(outputPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => resolve(outputPath));
      writer.on('error', reject);
    });

  } catch (err) {
    console.error('❌ Error al generar audio:', err.message);
    return null;
  }
};

module.exports = { generarAudioElevenLabs };
