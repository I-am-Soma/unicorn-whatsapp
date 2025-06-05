const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const twilio = require('twilio');
const fs = require('fs');
const path = require('path');
const { generarHistorialGPT } = require('./generarHistorialGPT');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8080;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

// 🔧 PARÁMETROS OPTIMIZADOS PARA VENTAS
const parametrosGPTVentas = {
  model: 'gpt-3.5-turbo',
  max_tokens: 400,
  temperature: 0.8,
  presence_penalty: 0.7,
  frequency_penalty: 0.4,
  top_p: 0.9
};

// 🎧 FUNCIÓN PARA GENERAR AUDIO CON ELEVENLABS
const generarAudioElevenLabs = async (texto, nombreArchivo = 'respuesta.mp3', vozId = '21m00Tcm4TlvDq8ikWAM') => {
  try {
    console.log(`🎤 Generando audio para texto: "${texto.substring(0, 50)}..."`);
    
    const response = await axios({
      method: 'POST',
      url: `https://api.elevenlabs.io/v1/text-to-speech/${vozId}`,
      data: {
        text: texto,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.4,
          similarity_boost: 0.8,
          style: 0.2, // Para conversaciones más naturales
          use_speaker_boost: true
        }
      },
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      },
      responseType: 'arraybuffer'
    });

    // Crear directorio de audio si no existe
    const ruta = path.join(__dirname, 'audio');
    if (!fs.existsSync(ruta)) {
      fs.mkdirSync(ruta, { recursive: true });
    }

    const rutaArchivo = path.join(ruta, nombreArchivo);
    fs.writeFileSync(rutaArchivo, response.data);
    
    console.log(`🎧 Audio guardado exitosamente: ${rutaArchivo}`);
    return {
      success: true,
      filename: nombreArchivo,
      path: rutaArchivo,
      url: `${process.env.BASE_URL || 'http://localhost:8080'}/audio/${nombreArchivo}`
    };
    
  } catch (error) {
    console.error('❌ Error generando audio con ElevenLabs:', error.response?.data || error.message);
    return {
      success: false,
      error: error.message
    };
  }
};

// 🎯 FUNCIÓN PARA GENERAR PROMPT PERSONALIZADO DE VENTAS
const generarPromptVentasPersonalizado = (cliente, servicios = []) => {
  const nombreEmpresa = cliente.nombre || 'nuestra empresa';
  const industria = detectarIndustria(cliente.nombre, servicios);
  
  let prompt = `Eres el especialista comercial principal de ${nombreEmpresa}, experto en ${industria}.

🎯 TU MISIÓN: Convertir CADA conversación en una VENTA confirmada. No solo informar, sino CERRAR VENTAS.

🔥 ESTRATEGIA DE VENTAS AGRESIVA:
1. CALIFICAR INMEDIATAMENTE: "¿Para cuándo necesitas esto?" "¿Cuál es tu presupuesto aproximado?"
2. PRESENTAR CON URGENCIA: Servicio específico + precio exacto + "Solo disponible esta semana"
3. CREAR ESCASEZ: "Últimos 3 espacios", "Oferta por tiempo limitado", "Solo para los primeros 5 clientes"
4. MANEJAR OBJECIONES: Precio alto → beneficios concretos + facilidades de pago
5. CERRAR AGRESIVAMENTE: "¿Empezamos mañana o prefieres el jueves?" "¿Efectivo o tarjeta?"

💰 NUESTROS SERVICIOS PREMIUM:`;

  // Agregar servicios con formato de ventas agresivo
  if (servicios && servicios.length > 0) {
    servicios.forEach((servicio, index) => {
      const nombre = servicio.nombre || servicio.name || `Servicio ${index + 1}`;
      const precio = servicio.precio || servicio.price || null;
      
      prompt += `\n🔥 ${nombre}`;
      if (precio) {
        prompt += ` - $${precio} (OFERTA ESPECIAL ESTA SEMANA)`;
      }
      if (servicio.descripcion) {
        prompt += ` - ${servicio.descripcion}`;
      }
    });
  } else {
    prompt += `\n🔥 Consulta nuestros servicios premium con descuentos especiales`;
  }

  prompt += `\n\n💪 REGLAS ESTRICTAS DE RESPUESTA:
❌ NUNCA digas "déjame verificar" o "te envío información"
❌ NUNCA seas genérico o educado en exceso
✅ SIEMPRE menciona precios específicos y descuentos
✅ SIEMPRE crea urgencia temporal: "Solo hasta el viernes"
✅ SIEMPRE haz preguntas de cierre: "¿Cuándo empezamos?"
✅ SIEMPRE maneja objeciones con beneficios concretos

🚀 FRASES DE PODER PARA USAR:
• "Perfecto, tengo exactamente lo que necesitas por $[PRECIO]"
• "Solo me quedan 2 espacios esta semana, ¿los apartamos?"
• "Esta oferta especial termina el viernes, ¿confirmamos?"
• "Te ahorro $[CANTIDAD] si decidimos hoy mismo"
• "¿Prefieres que empecemos mañana temprano o en la tarde?"

⚡ MANEJO DE OBJECIONES TIPO ${industria.toUpperCase()}:
• "Es caro" → "Es una inversión que se paga sola en [TIEMPO]. Plus, tienes facilidades de pago"
• "Lo pensaré" → "Entiendo, pero esta oferta especial termina hoy. ¿Qué te detiene exactamente?"
• "Comparar precios" → "Perfecto, nosotros ofrecemos [BENEFICIO ÚNICO] que nadie más tiene por este precio"

🎯 OBJETIVO: Agendar cita o confirmar venta en máximo 5 mensajes.
📞 Si no puedes cerrar por WhatsApp, agenda llamada INMEDIATA: "Te llamo en 2 minutos para cerrar los detalles"

⚠️ IMPORTANTE: Mantén respuestas concisas para que puedan convertirse fácilmente a audio. Máximo 2-3 oraciones por mensaje.`;

  return prompt;
};

// 🏭 FUNCIÓN PARA DETECTAR INDUSTRIA BASADA EN NOMBRE Y SERVICIOS
const detectarIndustria = (nombre = '', servicios = []) => {
  const nombreLower = nombre.toLowerCase();
  const serviciosTexto = servicios.map(s => 
    `${s.nombre || s.name || ''} ${s.descripcion || s.description || ''}`
  ).join(' ').toLowerCase();
  
  const todasPalabras = `${nombreLower} ${serviciosTexto}`;
  
  if (/belleza|estetica|spa|salon|facial|masaje|tratamiento|piel/.test(todasPalabras)) {
    return 'belleza y estética';
  }
  if (/medico|salud|clinica|doctor|consulta|cirugia|dental/.test(todasPalabras)) {
    return 'servicios médicos';
  }
  if (/educacion|curso|capacitacion|coaching|mentor|clase/.test(todasPalabras)) {
    return 'educación y capacitación';
  }
  if (/tecnologia|software|desarrollo|web|app|digital|marketing/.test(todasPalabras)) {
    return 'tecnología y marketing digital';
  }
  if (/reparacion|mantenimiento|instalacion|tecnico|hogar/.test(todasPalabras)) {
    return 'servicios técnicos';
  }
  if (/legal|abogado|juridico|consulta|asesoria/.test(todasPalabras)) {
    return 'servicios legales';
  }
  if (/financiero|prestamo|credito|inversion|seguro/.test(todasPalabras)) {
    return 'servicios financieros';
  }
  
  return 'servicios profesionales';
};

// 🔍 FUNCIÓN PARA DETECTAR INTENCIÓN DEL MENSAJE
const detectarIntencionVenta = (mensaje) => {
  const msg = mensaje.toLowerCase();
  
  return {
    preguntaPrecio: /cuanto|cuesta|precio|cost|dollar|peso|barato|caro|vale|cotiz/.test(msg),
    preguntaServicios: /servicio|que hac|ofrec|tratamiento|procedimiento|opciones/.test(msg),
    objecion: /caro|expensive|mucho|pensarlo|despues|luego|maybe|costoso/.test(msg),
    urgencia: /urgente|rapido|hoy|ahora|emergency|ya/.test(msg),
    comparacion: /mejor|comparar|otros|competencia|alternativa/.test(msg),
    cierre: /cuando|reservar|agendar|cita|appointment|disponible/.test(msg),
    saludo: /hola|hi|buenos|buenas|saludos/.test(msg) && msg.length < 20
  };
};

// 🎯 FUNCIÓN OPTIMIZADA PARA RESPUESTAS DE VENTAS
const generarRespuestaVentas = async (messages, intencion) => {
  try {
    let parametros = { ...parametrosGPTVentas };
    
    if (intencion.preguntaPrecio) {
      parametros.temperature = 0.6;
      parametros.max_tokens = 300; // Más corto para audio
    }
    
    if (intencion.objecion) {
      parametros.temperature = 0.7;
      parametros.presence_penalty = 0.8;
      parametros.max_tokens = 250; // Respuestas concisas
    }
    
    if (intencion.urgencia) {
      parametros.max_tokens = 200; // Muy directo
      parametros.temperature = 0.9;
    }

    console.log(`🎯 Parámetros GPT ajustados:`, {
      temperatura: parametros.temperature,
      tokens: parametros.max_tokens,
      intencion: Object.keys(intencion).filter(k => intencion[k]).join(', ')
    });

    const aiResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      { ...parametros, messages },
      { 
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` 
        } 
      }
    );

    return aiResponse.data.choices[0].message.content.trim();
    
  } catch (error) {
    console.error('❌ Error en OpenAI:', error.message);
    throw error;
  }
};

// 📱 FUNCIÓN MEJORADA PARA ENVIAR MENSAJES CON AUDIO OPCIONAL
const enviarMensajeTwilio = async (numero, mensaje, incluirAudio = false) => {
  try {
    const to = numero.startsWith('whatsapp:') ? numero : `whatsapp:${numero}`;
    const from = process.env.TWILIO_WHATSAPP_NUMBER;
    
    let mensajeData = { from, to, body: mensaje };
    
    // Si se requiere audio y está configurado ElevenLabs
    if (incluirAudio && process.env.ELEVENLABS_API_KEY) {
      console.log('🎧 Generando audio para el mensaje...');
      
      // Limpiar texto para audio (remover emojis y caracteres especiales)
      const textoParaAudio = mensaje
        .replace(/[🔥💰⚡🎯✅❌📞💪🚀]/g, '')
        .replace(/\n+/g, '. ')
        .trim();
      
      const nombreArchivo = `mensaje_${Date.now()}.mp3`;
      const resultadoAudio = await generarAudioElevenLabs(textoParaAudio, nombreArchivo);
      
      if (resultadoAudio.success) {
        mensajeData.mediaUrl = resultadoAudio.url;
        console.log(`🎵 Audio adjuntado: ${resultadoAudio.url}`);
      } else {
        console.log('⚠️ No se pudo generar audio, enviando solo texto');
      }
    }
    
    const enviado = await twilioClient.messages.create(mensajeData);
    console.log(`📤 Enviado a ${to}: ${mensaje.substring(0, 100)}...`);
    
    if (incluirAudio) {
      console.log(`🎧 ${mensajeData.mediaUrl ? 'Con audio' : 'Solo texto'}`);
    }
    
    return enviado;
    
  } catch (error) {
    console.error(`❌ Error enviando a ${numero}:`, error.message);
    throw error;
  }
};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 🎧 SERVIR ARCHIVOS DE AUDIO ESTÁTICOS
app.use('/audio', express.static(path.join(__dirname, 'audio')));

// 🧩 Webhook de entrada de mensajes (MEJORADO CON AUDIO)
app.post('/webhook', async (req, res) => {
  console.log('📡 Webhook recibido:', new Date().toISOString());
  console.log('Body:', JSON.stringify(req.body, null, 2));

  const message = req.body.Body;
  const phone = req.body.From;
  const name = req.body.ProfileName || 'WhatsApp User';

  if (!message || !phone) {
    console.error('❌ Faltan datos: message o phone');
    return res.status(400).json({ error: 'Missing message or phone' });
  }

  try {
    const numero = phone.replace(/^whatsapp:/, '').replace(/\D/g, '');
    console.log(`📱 Número procesado: +${numero} (original: ${phone})`);

    const { data: clienteData, error: clienteError } = await supabase
      .from('clientes')
      .select('id, nombre, numero_whatsapp, audio_habilitado')
      .eq('numero_whatsapp', `+${numero}`)
      .single();

    if (clienteError && clienteError.code !== 'PGRST116') {
      console.error('❌ Error consultando cliente:', clienteError.message);
    }

    const cliente_id = clienteData?.id || 1;
    const audioHabilitado = clienteData?.audio_habilitado || false;
    
    console.log(`👤 Cliente detectado: ID ${cliente_id} - ${clienteData?.nombre || 'Cliente por defecto'}`);
    console.log(`🎧 Audio habilitado: ${audioHabilitado ? 'SÍ' : 'NO'}`);

    const { error } = await supabase.from('conversations').insert([{
      lead_phone: phone,
      last_message: message,
      agent_name: name,
      status: 'New',
      created_at: new Date().toISOString(),
      origen: 'whatsapp',
      procesar: false,
      cliente_id,
      audio_habilitado: audioHabilitado
    }]);

    if (error) {
      console.error('❌ Error al guardar en Supabase:', error);
      return res.status(500).json({ error: 'Insert error' });
    }

    console.log('✅ Mensaje guardado exitosamente');
    return res.status(200).json({ success: true });
    
  } catch (err) {
    console.error('❌ Error en webhook:', err.message);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// 🔄 FUNCIÓN OPTIMIZADA PARA PROCESAR MENSAJES ENTRANTES CON AUDIO
const responderMensajesEntrantesOptimizado = async () => {
  const { data: mensajes, error } = await supabase
    .from('conversations')
    .select('*')
    .in('origen', ['whatsapp', 'sms'])
    .eq('procesar', false)
    .limit(10);

  if (error) {
    console.error('❌ Error consultando mensajes entrantes:', error.message);
    return;
  }

  if (!mensajes?.length) {
    console.log('⏳ No hay nuevos leads...');
    return;
  }

  console.log(`📨 Procesando ${mensajes.length} mensajes entrantes con OPTIMIZACIÓN DE VENTAS + AUDIO`);

  for (const mensaje of mensajes) {
    const { id, lead_phone, cliente_id, last_message, audio_habilitado } = mensaje;
    console.log(`\n📞 Procesando lead ID: ${id} de ${lead_phone} (Audio: ${audio_habilitado ? 'ON' : 'OFF'})`);
    
    try {
      const intencion = detectarIntencionVenta(last_message || '');
      console.log(`🎯 Intención detectada:`, Object.keys(intencion).filter(k => intencion[k]).join(', ') || 'general');

      const messages = await generarHistorialGPT(lead_phone, supabase);
      if (!messages) {
        console.error('❌ No se pudo generar historial para GPT');
        continue;
      }

      console.log('🧠 Enviando a OpenAI con parámetros optimizados...');
      
      const textoAI = await generarRespuestaVentas(messages, intencion);
      console.log(`🎯 Respuesta de AI optimizada: ${textoAI.substring(0, 100)}...`);

      const esRespuestaVentas = /\$|\d+|precio|costo|oferta|disponible|cuando|cita|reservar|llamar/i.test(textoAI);
      console.log(`💰 Respuesta orientada a ventas: ${esRespuestaVentas ? 'SÍ' : 'NO'}`);

      // Marcar como procesado
      await supabase.from('conversations').update({ procesar: true }).eq('id', id);
      
      // Insertar respuesta
      await supabase.from('conversations').insert([{
        lead_phone,
        last_message: textoAI,
        agent_name: 'Unicorn AI',
        status: esRespuestaVentas ? 'Sales Pitch' : 'In Progress',
        created_at: new Date().toISOString(),
        origen: 'unicorn',
        procesar: true,
        cliente_id: cliente_id || 1,
        audio_habilitado
      }]);

      // Enviar por WhatsApp CON AUDIO SI ESTÁ HABILITADO
      await enviarMensajeTwilio(lead_phone, textoAI, audio_habilitado);
      
      console.log('✅ Mensaje entrante procesado exitosamente');
      
    } catch (err) {
      console.error(`❌ Error procesando entrada ${lead_phone}:`, err.message);
      
      // Respuesta de fallback orientada a ventas
      if (err.response?.status === 429 || err.response?.status >= 500) {
        console.log('⚠️ Enviando respuesta de fallback orientada a ventas...');
        const fallbackMessage = "¡Hola! Tengo exactamente lo que necesitas. Permíteme llamarte en 5 minutos para darte precios especiales que solo ofrezco por teléfono. ¿Cuál es el mejor número para contactarte?";
        await enviarMensajeTwilio(lead_phone, fallbackMessage, mensaje.audio_habilitado);
        await supabase.from('conversations').update({ procesar: true }).eq('id', id);
      }
    }
  }
};

// 🔁 Procesa mensajes salientes desde Unicorn (CON AUDIO)
const procesarMensajesDesdeUnicorn = async () => {
  const { data: pendientes, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('origen', 'unicorn')
    .eq('procesar', false);

  if (error) {
    console.error('❌ Error consultando mensajes Unicorn:', error.message);
    return;
  }

  if (!pendientes?.length) {
    console.log('⏳ No hay mensajes nuevos de Unicorn...');
    return;
  }

  console.log(`🤖 Procesando ${pendientes.length} mensajes de Unicorn con OPTIMIZACIÓN + AUDIO`);

  for (const mensaje of pendientes) {
    const { id, lead_phone, cliente_id, last_message, audio_habilitado } = mensaje;
    console.log(`\n🔄 Procesando mensaje ID: ${id} para ${lead_phone} (Audio: ${audio_habilitado ? 'ON' : 'OFF'})`);
    
    try {
      const intencion = detectarIntencionVenta(last_message || '');
      
      const messages = await generarHistorialGPT(lead_phone, supabase);
      if (!messages) {
        console.error('❌ No se pudo generar historial para GPT');
        continue;
      }

      console.log('🧠 Enviando a OpenAI con parámetros optimizados...');
      
      const textoAI = await generarRespuestaVentas(messages, intencion);
      console.log(`🎯 Respuesta de AI: ${textoAI.substring(0, 100)}...`);

      // Marcar como procesado
      await supabase.from('conversations').update({ procesar: true }).eq('id', id);
      
      // Insertar respuesta
      await supabase.from('conversations').insert([{
        lead_phone,
        last_message: textoAI,
        agent_name: 'Unicorn AI',
        status: 'In Progress',
        created_at: new Date().toISOString(),
        origen: 'unicorn',
        procesar: true,
        cliente_id: cliente_id || 1,
        audio_habilitado
      }]);

      // Enviar por WhatsApp CON AUDIO SI ESTÁ HABILITADO
      await enviarMensajeTwilio(lead_phone, textoAI, audio_habilitado);
      
      console.log('✅ Mensaje Unicorn procesado exitosamente');
      
    } catch (err) {
      console.error(`❌ Error procesando unicorn ${lead_phone}:`, err.message);
    }
  }
};

// 🎧 ENDPOINTS PARA FUNCIONALIDAD DE AUDIO

// Generar audio desde texto
app.post('/api/generar-audio', async (req, res) => {
  try {
    const { texto, archivo, vozId } = req.body;
    
    if (!texto) {
      return res.status(400).json({ error: 'Falta el texto para generar audio' });
    }

    if (!process.env.ELEVENLABS_API_KEY) {
      return res.status(500).json({ error: 'ElevenLabs API key no configurada' });
    }

    const nombreArchivo = archivo || `audio_${Date.now()}.mp3`;
    const resultado = await generarAudioElevenLabs(texto, nombreArchivo, vozId);

    if (!resultado.success) {
      return res.status(500).json({ error: 'No se pudo generar el audio', details: resultado.error });
    }

    res.json({
      success: true,
      filename: resultado.filename,
      url: resultado.url,
      message: 'Audio generado exitosamente'
    });

  } catch (error) {
    console.error('❌ Error en /api/generar-audio:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Habilitar/deshabilitar audio para un cliente
app.post('/api/cliente/:clienteId/audio', async (req, res) => {
  try {
    const { clienteId } = req.params;
    const { habilitado } = req.body;

    const { data, error } = await supabase
      .from('clientes')
      .update({ audio_habilitado: habilitado })
      .eq('id', clienteId)
      .select();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({
      success: true,
      cliente_id: clienteId,
      audio_habilitado: habilitado,
      message: `Audio ${habilitado ? 'habilitado' : 'deshabilitado'} para el cliente`
    });

  } catch (error) {
    console.error('❌ Error configurando audio del cliente:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Test de audio con diferentes voces
app.post('/api/test-voces', async (req, res) => {
  try {
    const { texto } = req.body;
    const textoTest = texto || "Hola, soy tu asistente de ventas. ¿En qué puedo ayudarte hoy?";

    // Voces disponibles en ElevenLabs
    const voces = [
      { id: '21m00Tcm4TlvDq8ikWAM', nombre: 'Rachel', descripcion: 'Femenina, profesional' },
      { id: 'AZnzlk1XvdvUeBnXmlld', nombre: 'Domi', descripcion: 'Femenina, joven' },
      { id: 'EXAVITQu4vr4xnSDxMaL', nombre: 'Bella', descripcion: 'Femenina, cálida' },
      { id: 'ErXwobaYiN019PkySvjV', nombre: 'Antoni', descripcion: 'Masculina, profesional' },
      { id: 'VR6AewLTigWG4xSOukaG', nombre: 'Arnold', descripcion: 'Masculina, profunda' }
    ];

    const resultados = [];

    for (const voz of voces) {
      const nombreArchivo = `test_${voz.nombre.toLowerCase()}_${Date.now()}.mp3`;
      const resultado = await generarAudioElevenLabs(textoTest, nombreArchivo, voz.id);
      
      resultados.push({
        voz: voz.nombre,
        descripcion: voz.descripcion,
        id: voz.id,
        success: resultado.success,
        url: resultado.success ? resultado.url : null,
        error: resultado.success ? null : resultado.error
      });

      // Pequeña pausa entre llamadas
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    res.json({
      success: true,
      texto_usado: textoTest,
      voces_testadas: resultados,
      message: 'Test de voces completado'
    });

  } catch (error) {
    console.error('❌ Error en test de voces:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// 🧪 ENDPOINTS DE TESTING MEJORADOS

app.get('/test-respuesta-ventas/:phone', async (req, res) => {
  try {
    const { phone } = req.params;
    const mensaje = req.query.mensaje || "Hola, ¿cuánto cuesta el servicio?";
    const incluirAudio = req.query.audio === 'true';
    
    console.log(`🧪 Test de respuesta para ${phone} con mensaje: "${mensaje}" (Audio: ${incluirAudio})`);
    
    const intencion = detectarIntencionVenta(mensaje);
    console.log('🎯 Intención detectada:', Object.keys(intencion).filter(k => intencion[k]));
    
    const messages = await generarHistorialGPT(`whatsapp:${phone}`, supabase);
    
    if (!messages) {
      return res.json({
        error: 'No se pudo generar historial',
        phone,
        mensaje
      });
    }
    
    const respuesta = await generarRespuestaVentas(messages, intencion);
    
    let audioInfo = null;
    if (incluirAudio && process.env.ELEVENLABS_API_KEY) {
      const textoParaAudio = respuesta.replace(/[🔥💰⚡🎯✅❌📞💪🚀]/g, '').replace(/\n+/g, '. ').trim();
      const nombreArchivo = `test_${Date.now()}.mp3`;
      const resultadoAudio = await generarAudioElevenLabs(textoParaAudio, nombreArchivo);
      audioInfo = resultadoAudio;
    }
    
    const analisis = {
      contienePrecios: /\$|\d+|precio|costo/i.test(respuesta),
      creaUrgencia: /urgente|limitado|solo|esta semana|hoy/i.test(respuesta),
      preguntaCierre: /cuando|empezamos|confirmar|reservar/i.test(respuesta),
      manejaObjeciones: /inversion|beneficio|facilidad|pago/i
