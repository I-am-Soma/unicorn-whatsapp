// googleAudioManager.js

const { Storage } = require('@google-cloud/storage');
const axios = require('axios');
const path = require('path');
const crypto = require('crypto');

class GoogleAudioManager {
  constructor() {
    this.bucketName = process.env.GCS_AUDIO_BUCKET; // Ej: unicorn-audio-us
    this.storage = new Storage({
      projectId: process.env.GOOGLE_PROJECT_ID,
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS // Ruta al JSON de credenciales
    });
  }

  generateFileName(text) {
    const hash = crypto.createHash('md5').update(text).digest('hex');
    return `audio_${hash}_${Date.now()}.mp3`;
  }

  async uploadAudioBuffer(audioBuffer, fileName) {
    const bucket = this.storage.bucket(this.bucketName);
    const file = bucket.file(fileName);
    await file.save(audioBuffer, { contentType: 'audio/mpeg' });
    await file.makePublic();
    const publicUrl = `https://storage.googleapis.com/${this.bucketName}/${fileName}`;
    console.log(`✅ Audio subido: ${publicUrl}`);
    return publicUrl;
  }

  async generateAudioFromGoogleAI(text, voiceModelUrl, apiKey) {
    const response = await axios.post(
      voiceModelUrl,
      { text: text },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey
        },
        responseType: 'arraybuffer'
      }
    );

    return Buffer.from(response.data);
  }

  async processAudio(text, voiceModelUrl, apiKey) {
    const fileName = this.generateFileName(text);
    const audioBuffer = await this.generateAudioFromGoogleAI(text, voiceModelUrl, apiKey);
    const publicUrl = await this.uploadAudioBuffer(audioBuffer, fileName);
    return publicUrl;
  }
}

module.exports = { GoogleAudioManager };
