// googleAudioManager.js
const axios = require('axios');

class GoogleAudioManager {
  async processAudio(text, apiUrl, apiKey) {
    const response = await axios.post(
      apiUrl,
      { text },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        }
      }
    );

    if (!response.data.audioUrl) {
      throw new Error('No audioUrl devuelto por el motor');
    }

    return response.data.audioUrl;
  }
}

module.exports = { GoogleAudioManager };
