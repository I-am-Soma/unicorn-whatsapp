const axios = require('axios');
const { Storage } = require('@google-cloud/storage');
const crypto = require('crypto');

// CONFIGURACIÓN: reemplaza con tus datos de Google Cloud
const AI_ENGINE_URL = "https://unicorn-sales-ai-engine-multichannel-dialogue-api-565328654764.us-west1.run.app";
const GOOGLE_API_KEY = "AIzaSyCsvxwwRlVT-d5MOlIoECcEpBRh0Y9L02k";
const BUCKET_NAME = "unicorn-audio-us";  // El bucket que ya creaste

// Inicializar Google Cloud Storage (requiere tener la credencial del service account configurada)
const storage = new Storage();

class GoogleAudioManager {
  /**
   * Genera el guion y el audio desde Google AI Studio
   */
  async generarGuionYAudio(params) {
    try {
      const response = await axios.post(`${AI_ENGINE_URL}/generate`, params, {
        headers: { 'x-goog-api-key': GOOGLE_API_KEY }
      });

      if (!response.data || !response.data.guion_texto || !response.data.audio_base64) {
        throw new Error('Respuesta incompleta del AI Engine.');
      }

      const audioBuffer = Buffer.from(response.data.audio_base64, 'base64');
      const audioUrl = await this.subirAudio(audioBuffer);
      return { texto: response.data.guion_texto, audioUrl };

    } catch (error) {
      console.error('❌ Error generando guion/audio:', error.message);
      throw error;
    }
  }

  /**
   * Sube el audio a Google Cloud Storage y retorna la URL pública
   */
  async subirAudio(buffer) {
    const filename = `audio_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.mp3`;
    const bucket = storage.bucket(BUCKET_NAME);
    const file = bucket.file(filename);

    await file.save(buffer, {
      metadata: { contentType: 'audio/mpeg' },
      public: true,
      resumable: false,
    });

    await file.makePublic();
    const publicUrl = `https://storage.googleapis.com/${BUCKET_NAME}/${filename}`;
    console.log('✅ Audio subido a:', publicUrl);
    return publicUrl;
  }
}

module.exports = { GoogleAudioManager };
