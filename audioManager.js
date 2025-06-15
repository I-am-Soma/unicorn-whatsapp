// audioManager.js
const axios = require('axios');
const crypto = require('crypto');

class AudioManager {
  constructor() {
    this.elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
    this.elevenLabsBaseUrl = 'https://api.elevenlabs.io/v1';
    this.cache = new Map(); // Cache en memoria
    this.defaultVoiceId = process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB'; // Adam
    this.maxCacheSize = 50; // Máximo de audios en caché
    this.maxTextLength = 500; // Máximo caracteres para audio
     console.log(`[AudioManager] Verificando configuración Supabase...`);
    console.log(`[AudioManager] SUPABASE_URL está ${process.env.SUPABASE_URL ? 'CONFIGURADA' : 'NO CONFIGURADA'}`);
    console.log(`[AudioManager] SUPABASE_ANON_KEY está ${process.env.SUPABASE_ANON_KEY ? 'CONFIGURADA' : 'NO CONFIGURADA'}`);
    console.log(`[AudioManager] Nombre del Bucket en código: '${this.bucketName}'`);
  }

  /**
   * Verifica créditos disponibles en ElevenLabs
   */
  async checkCredits() {
    try {
      const response = await axios.get(`${this.elevenLabsBaseUrl}/user`, {
        headers: {
          'xi-api-key': this.elevenLabsApiKey
        }
      });

      const credits = response.data.subscription?.character_count || 0;
      const used = response.data.subscription?.character_used || 0;
      const remaining = credits - used;

      console.log(`💰 Créditos ElevenLabs: ${remaining}/${credits} disponibles`);
      
      return {
        total: credits,
        used: used,
        remaining: remaining,
        hasCredits: remaining > 100 // Mínimo 100 caracteres
      };

    } catch (error) {
      console.error('❌ Error verificando créditos ElevenLabs:', error.response?.data || error.message);
      return {
        total: 0,
        used: 0,
        remaining: 0,
        hasCredits: false,
        error: error.message
      };
    }
  }

  /**
   * Genera hash para caché basado en texto y configuración
   */
  generateCacheKey(text, voiceId, voiceSettings) {
    const combined = `${text}_${voiceId}_${JSON.stringify(voiceSettings)}`;
    return crypto.createHash('md5').update(combined).digest('hex');
  }

  /**
   * Verifica si el audio está en caché
   */
  getCachedAudio(cacheKey) {
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      console.log(`🎵 Audio encontrado en caché: ${cacheKey.substring(0, 8)}...`);
      return cached;
    }
    return null;
  }

  /**
   * Guarda audio en caché con límite de tamaño
   */
  setCachedAudio(cacheKey, audioBuffer) {
    // Limpiar caché si está lleno
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
      console.log('🗑️ Audio eliminado del caché por límite');
    }

    this.cache.set(cacheKey, audioBuffer);
    console.log(`💾 Audio guardado en caché: ${cacheKey.substring(0, 8)}... (Total: ${this.cache.size})`);
  }

  /**
   * Prepara texto para síntesis de voz
   */
  prepareTextForAudio(text) {
    if (!text || typeof text !== 'string') {
      throw new Error('Texto inválido para audio');
    }

    // Limpiar texto
    let cleanText = text
      .replace(/[^\w\s\.,!?¿¡áéíóúüñÁÉÍÓÚÜÑ]/g, '') // Caracteres válidos
      .replace(/\s+/g, ' ') // Espacios múltiples
      .trim();

    // Truncar si es muy largo
    if (cleanText.length > this.maxTextLength) {
      cleanText = cleanText.substring(0, this.maxTextLength);
      // Buscar último punto para cortar elegantemente
      const lastPeriod = cleanText.lastIndexOf('.');
      if (lastPeriod > this.maxTextLength * 0.8) {
        cleanText = cleanText.substring(0, lastPeriod + 1);
      }
      console.log(`✂️ Texto truncado a ${cleanText.length} caracteres`);
    }

    return cleanText;
  }

  /**
   * Genera audio usando ElevenLabs
   */
  async generateAudio(text, options = {}) {
    try {
      // Verificar créditos primero
      const credits = await this.checkCredits();
      if (!credits.hasCredits) {
        throw new Error(`Créditos insuficientes: ${credits.remaining} disponibles`);
      }

      // Preparar texto
      const cleanText = this.prepareTextForAudio(text);
      if (cleanText.length < 5) {
        throw new Error('Texto demasiado corto para síntesis');
      }

      // Configuración de voz
      const voiceId = options.voiceId || this.defaultVoiceId;
      const voiceSettings = {
        stability: options.stability || 0.5,
        similarity_boost: options.similarity_boost || 0.75,
        style: options.style || 0.5,
        use_speaker_boost: options.use_speaker_boost || true
      };

      // Verificar caché
      const cacheKey = this.generateCacheKey(cleanText, voiceId, voiceSettings);
      const cachedAudio = this.getCachedAudio(cacheKey);
      if (cachedAudio) {
        return {
          success: true,
          audioBuffer: cachedAudio,
          fromCache: true,
          textLength: cleanText.length
        };
      }

      console.log(`🎙️ Generando audio: "${cleanText.substring(0, 50)}..." (${cleanText.length} chars)`);
      
      // Generar audio
      const startTime = Date.now();
      const response = await axios.post(
        `${this.elevenLabsBaseUrl}/text-to-speech/${voiceId}`,
        {
          text: cleanText,
          model_id: options.model || 'eleven_multilingual_v2',
          voice_settings: voiceSettings
        },
        {
          headers: {
            'xi-api-key': this.elevenLabsApiKey,
            'Content-Type': 'application/json'
          },
          responseType: 'arraybuffer',
          timeout: 30000 // 30 segundos timeout
        }
      );

      const audioBuffer = Buffer.from(response.data);
      const duration = Date.now() - startTime;
      
      console.log(`✅ Audio generado exitosamente en ${duration}ms (${audioBuffer.length} bytes)`);
      
      // Guardar en caché
      this.setCachedAudio(cacheKey, audioBuffer);

      return {
        success: true,
        audioBuffer: audioBuffer,
        fromCache: false,
        textLength: cleanText.length,
        generationTime: duration
      };

    } catch (error) {
      console.error('❌ Error generando audio:', error.response?.data || error.message);
      
      // Errores específicos de ElevenLabs
      if (error.response?.status === 401) {
        throw new Error('API Key de ElevenLabs inválida');
      } else if (error.response?.status === 429) {
        throw new Error('Límite de rate limit alcanzado');
      } else if (error.response?.status === 400) {
        throw new Error('Texto inválido para síntesis');
      }
      
      throw new Error(`Error de ElevenLabs: ${error.message}`);
    }
  }

  /**
   * Genera audio con reintentos automáticos
   */
  async generateAudioWithRetry(text, options = {}, maxRetries = 2) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        console.log(`🔄 Intento ${attempt}/${maxRetries + 1} generando audio`);
        return await this.generateAudio(text, options);
      } catch (error) {
        lastError = error;
        console.log(`❌ Intento ${attempt} falló: ${error.message}`);
        
        // No reintentar errores de configuración
        if (error.message.includes('API Key') || error.message.includes('inválido')) {
          break;
        }
        
        // Esperar antes del siguiente intento
        if (attempt <= maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Selecciona voz según contexto del cliente
   */
  selectVoiceForClient(clientConfig, messageType) {
    // Voces disponibles (agregar más según necesidades)
    const voices = {
      professional: 'pNInz6obpgDQGcFmaJgB', // Adam - Profesional
      friendly: '21m00Tcm4TlvDq8ikWAM',    // Rachel - Amigable
      energetic: 'AZnzlk1XvdvUeBnXmlld',   // Domi - Enérgica
      calm: 'EXAVITQu4vr4xnSDxMaL'        // Bella - Calmada
    };

    // Selección basada en configuración del cliente
    if (clientConfig?.voice_preference) {
      return voices[clientConfig.voice_preference] || this.defaultVoiceId;
    }

    // Selección basada en tipo de mensaje
    switch (messageType) {
      case 'greeting':
      case 'closing':
        return voices.friendly;
      case 'objection':
        return voices.calm;
      case 'urgency':
        return voices.energetic;
      default:
        return voices.professional;
    }
  }

  /**
   * Optimiza configuración de voz según contexto
   */
  optimizeVoiceSettings(messageType, textLength) {
    const baseSettings = {
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0.5,
      use_speaker_boost: true
    };

    // Ajustes según tipo de mensaje
    switch (messageType) {
      case 'greeting':
        return { ...baseSettings, style: 0.7 }; // Más expresivo
      case 'objection':
        return { ...baseSettings, stability: 0.8, style: 0.3 }; // Más estable y calmado
      case 'urgency':
        return { ...baseSettings, stability: 0.3, style: 0.8 }; // Más dinámico
      case 'technical':
        return { ...baseSettings, stability: 0.9, style: 0.2 }; // Muy estable
      default:
        return baseSettings;
    }
  }

  /**
   * Obtiene estadísticas del caché
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      keys: Array.from(this.cache.keys()).map(k => k.substring(0, 8))
    };
  }

  /**
   * Limpia el caché manualmente
   */
  clearCache() {
    const oldSize = this.cache.size;
    this.cache.clear();
    console.log(`🗑️ Caché limpiado: ${oldSize} elementos eliminados`);
  }

  /**
   * Valida configuración de audio
   */
  validateConfig() {
    const issues = [];
    
    if (!this.elevenLabsApiKey) {
      issues.push('ELEVENLABS_API_KEY no configurada');
    }
    
    if (!this.defaultVoiceId) {
      issues.push('ELEVENLABS_VOICE_ID no configurada');
    }
    
    return {
      isValid: issues.length === 0,
      issues: issues
    };
  }
}

module.exports = { AudioManager };
