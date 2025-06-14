// messageDecisionEngine.js
const moment = require('moment-timezone');

class MessageDecisionEngine {
  constructor() {
    // Patrones que favorecen TEXTO
    this.textPatterns = {
      precios: /\$|precio|costo|cuanto|cost|barato|caro|vale|cotiz/i,
      listas: /servicio|tratamiento|procedimiento|ofrec|disponible/i,
      tecnicos: /horario|direccion|ubicacion|requisito|documento|cedula/i,
      numeros: /\d+.*\$|\$.*\d+|lista.*\d+|opcion.*\d+/i,
      comparacion: /versus|vs|mejor|diferencia|comparar/i
    };

    // Patrones que favorecen VOZ
    this.voicePatterns = {
      saludo: /hola|buenos|buenas|que tal|saludos/i,
      objeciones: /caro|expensive|pensarlo|despues|luego|maybe|dificil|complicado/i,
      emocional: /ayuda|necesito|problema|urgente|preocup|nerv|ansio/i,
      cierre: /cuando|empezar|reservar|agendar|cita|disponible.*hoy|rapidamente/i,
      personal: /gracias|perfecto|excelente|me gusta|interesa/i
    };

    // Configuración por tipo de cliente
    this.clientConfig = {
      premium: { audioPreference: 0.8, maxAudioPerDay: 20 },
      standard: { audioPreference: 0.5, maxAudioPerDay: 10 },
      basic: { audioPreference: 0.2, maxAudioPerDay: 5 }
    };
  }

  /**
   * Decide si usar voz o texto basado en múltiples factores
   */
  async shouldUseVoice(params) {
    const {
      messageContent,
      clientConfig,
      responseContent,
      timeOfDay,
      conversationHistory,
      audioUsageToday,
      elevenlabsCredits
    } = params;

    try {
      // 1. Verificaciones básicas
      if (!elevenlabsCredits || elevenlabsCredits < 100) {
        console.log('🔇 Sin créditos ElevenLabs suficientes');
        return { useVoice: false, reason: 'no_credits' };
      }

      if (clientConfig?.preferencia === 'nunca') {
        return { useVoice: false, reason: 'client_preference' };
      }

      if (clientConfig?.preferencia === 'siempre') {
        return { useVoice: true, reason: 'client_preference' };
      }

      // 2. Límites diarios
      const maxDaily = this.getMaxAudioPerDay(clientConfig);
      if (audioUsageToday >= maxDaily) {
        console.log(`🚫 Límite diario alcanzado: ${audioUsageToday}/${maxDaily}`);
        return { useVoice: false, reason: 'daily_limit' };
      }

      // 3. Análisis de horario
      const timeScore = this.getTimeScore(timeOfDay, clientConfig);
      if (timeScore === 0) {
        return { useVoice: false, reason: 'outside_hours' };
      }

      // 4. Análisis del contenido
      const contentAnalysis = this.analyzeContent(messageContent, responseContent);
      
      // 5. Análisis del contexto conversacional
      const contextScore = this.analyzeConversationContext(conversationHistory);

      // 6. Cálculo final de puntuación
      const finalScore = this.calculateFinalScore({
        contentAnalysis,
        timeScore,
        contextScore,
        clientConfig
      });

      console.log(`🎯 Puntuación decisión: ${finalScore.toFixed(2)} (umbral: 0.6)`);
      console.log(`📊 Desglose: contenido=${contentAnalysis.score}, tiempo=${timeScore}, contexto=${contextScore}`);

      return {
        useVoice: finalScore >= 0.6,
        reason: finalScore >= 0.6 ? 'intelligent_decision' : 'below_threshold',
        score: finalScore,
        analysis: {
          content: contentAnalysis,
          timeScore,
          contextScore
        }
      };

    } catch (error) {
      console.error('❌ Error en decisión de voz:', error);
      return { useVoice: false, reason: 'error', error: error.message };
    }
  }

  /**
   * Analiza el contenido del mensaje y respuesta
   */
  analyzeContent(userMessage, botResponse) {
    const userLower = userMessage?.toLowerCase() || '';
    const responseLower = botResponse?.toLowerCase() || '';
    
    let score = 0.5; // Neutral por defecto
    let factors = [];

    // Penalizar si la respuesta es muy larga (>300 chars)
    if (botResponse && botResponse.length > 300) {
      score -= 0.2;
      factors.push('response_too_long');
    }

    // Penalizar respuestas con mucha información técnica
    if (this.textPatterns.precios.test(responseLower)) {
      score -= 0.3;
      factors.push('contains_prices');
    }

    if (this.textPatterns.listas.test(responseLower)) {
      score -= 0.2;
      factors.push('contains_lists');
    }

    if (this.textPatterns.numeros.test(responseLower)) {
      score -= 0.25;
      factors.push('contains_numbers');
    }

    // Favorecer voz para interacciones emocionales
    if (this.voicePatterns.saludo.test(userLower) || this.voicePatterns.saludo.test(responseLower)) {
      score += 0.3;
      factors.push('greeting_detected');
    }

    if (this.voicePatterns.objeciones.test(userLower)) {
      score += 0.4;
      factors.push('objection_handling');
    }

    if (this.voicePatterns.emocional.test(userLower)) {
      score += 0.3;
      factors.push('emotional_content');
    }

    if (this.voicePatterns.cierre.test(userLower) || this.voicePatterns.cierre.test(responseLower)) {
      score += 0.35;
      factors.push('closing_opportunity');
    }

    return {
      score: Math.max(0, Math.min(1, score)),
      factors,
      length: botResponse?.length || 0
    };
  }

  /**
   * Analiza el contexto de la conversación
   */
  analyzeConversationContext(history) {
    if (!history || history.length === 0) {
      return 0.4; // Primera interacción, ligeramente favorable a voz
    }

    const recentMessages = history.slice(-5); // Últimos 5 mensajes
    let contextScore = 0.3;

    // Analizar patrones en historial reciente
    const hasRecentVoice = recentMessages.some(m => m.tipo_respuesta === 'voz');
    const hasRecentText = recentMessages.some(m => m.tipo_respuesta === 'texto');

    // Alternar modalidades para variedad
    if (hasRecentVoice && !hasRecentText) {
      contextScore -= 0.2; // Favor a texto
    } else if (hasRecentText && !hasRecentVoice) {
      contextScore += 0.2; // Favor a voz
    }

    // Detectar progreso en embudo de ventas
    const salesStage = this.detectSalesStage(recentMessages);
    switch (salesStage) {
      case 'awareness':
        contextScore += 0.1;
        break;
      case 'consideration':
        contextScore -= 0.1; // Más información = texto
        break;
      case 'decision':
        contextScore += 0.3; // Cierre emocional = voz
        break;
    }

    return Math.max(0, Math.min(1, contextScore));
  }

  /**
   * Detecta la etapa de ventas en el historial
   */
  detectSalesStage(messages) {
    const allText = messages.map(m => m.content || '').join(' ').toLowerCase();
    
    if (this.voicePatterns.cierre.test(allText) || /agendar|reservar|cuando.*empezar/.test(allText)) {
      return 'decision';
    }
    
    if (this.textPatterns.precios.test(allText) || this.textPatterns.comparacion.test(allText)) {
      return 'consideration';
    }
    
    return 'awareness';
  }

  /**
   * Calcula puntuación basada en horario
   */
  getTimeScore(timeOfDay, clientConfig) {
    const hour = moment().tz('America/Mexico_City').hour();
    
    // Horario base de negocio (9 AM - 6 PM)
    const businessStart = 9;
    const businessEnd = 18;
    
    // Horario personalizado del cliente
    if (clientConfig?.horario_audio) {
      const [start, end] = clientConfig.horario_audio.split('-').map(Number);
      if (hour < start || hour > end) {
        return 0; // Fuera de horario
      }
    } else if (hour < businessStart || hour > businessEnd) {
      return 0.2; // Horario no óptimo
    }

    // Horarios más favorables para voz
    if (hour >= 10 && hour <= 12) return 1.0; // Mañana activa
    if (hour >= 14 && hour <= 16) return 0.9; // Tarde productiva
    if (hour >= 9 && hour <= 18) return 0.7;  // Horario laboral
    
    return 0.3; // Otros horarios
  }

  /**
   * Obtiene límite máximo de audios por día
   */
  getMaxAudioPerDay(clientConfig) {
    if (clientConfig?.max_audio_day) {
      return clientConfig.max_audio_day;
    }
    
    // Valores por defecto según tipo de cliente
    const clientType = clientConfig?.tipo || 'standard';
    return this.clientConfig[clientType]?.maxAudioPerDay || 10;
  }

  /**
   * Cálculo final de puntuación
   */
  calculateFinalScore({ contentAnalysis, timeScore, contextScore, clientConfig }) {
    const weights = {
      content: 0.5,
      time: 0.2,
      context: 0.2,
      client: 0.1
    };

    const clientPreference = this.getClientAudioPreference(clientConfig);
    
    return (
      contentAnalysis.score * weights.content +
      timeScore * weights.time +
      contextScore * weights.context +
      clientPreference * weights.client
    );
  }

  /**
   * Obtiene preferencia de audio del cliente
   */
  getClientAudioPreference(clientConfig) {
    if (clientConfig?.audio_preference !== undefined) {
      return clientConfig.audio_preference;
    }
    
    const clientType = clientConfig?.tipo || 'standard';
    return this.clientConfig[clientType]?.audioPreference || 0.5;
  }

  /**
   * Genera explicación legible de la decisión
   */
  explainDecision(decision) {
    const { useVoice, reason, score, analysis } = decision;
    
    let explanation = `Decisión: ${useVoice ? 'VOZ' : 'TEXTO'} (${reason})`;
    
    if (score !== undefined) {
      explanation += `\nPuntuación: ${score.toFixed(2)}/1.0`;
      
      if (analysis) {
        explanation += `\nFactores de contenido: ${analysis.content.factors.join(', ') || 'neutral'}`;
        explanation += `\nLongitud respuesta: ${analysis.content.length} chars`;
      }
    }
    
    return explanation;
  }
}

module.exports = { MessageDecisionEngine };
