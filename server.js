const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const twilio = require('twilio');
const { generarHistorialGPT } = require('./generarHistorialGPT');
const FormData = require('form-data');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8080;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

// ---
// Parámetros y Funciones de IA y Ventas
// 🔧 PARÁMETROS OPTIMIZADOS PARA VENTAS
const parametrosGPTVentas = {
  model: 'gpt-3.5-turbo',
  max_tokens: 400, // Aumentado para respuestas más completas
  temperature: 0.8, // Más creatividad para ventas persuasivas
  presence_penalty: 0.7, // Evita repetición
  frequency_penalty: 0.4, // Variedad en respuestas
  top_p: 0.9 // Control de diversidad
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

IMPORTANTE: Mantén tus respuestas naturales y conversacionales, como si estuvieras hablando por teléfono. Evita usar emojis excesivos o formateo especial cuando sea para audio.`;

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

// ---
// Manejo de Audio (ElevenLabs y Supabase Storage)
// 🎵 CLASE AUDIOMANAGER PARA ELEVENLABS Y SUPABASE STORAGE
class AudioManager {
  constructor() {
    this.apiKey = process.env.ELEVENLABS_API_KEY;
    this.voiceId = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
    this.model = process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2';
    this.baseUrl = 'https://api.elevenlabs.io/v1';
    this.supabase = supabase; // Pasar la instancia de Supabase
    this.bucketName = 'audios'; // AQUI SE CAMBIO EL NOMBRE DEL BUCKET A 'audios'
  }

  async generarAudio(texto) {
    try {
      console.log(`🎵 Generando audio para: "${texto.substring(0, 50)}..."`);

      const url = `${this.baseUrl}/text-to-speech/${this.voiceId}`;

      const response = await axios.post(url, {
        text: texto,
        model_id: this.model,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.5,
          style: 0.3,
          use_speaker_boost: true
        }
      }, {
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': this.apiKey
        },
        responseType: 'arraybuffer'
      });

      if (response.status === 200) {
        console.log('✅ Audio generado exitosamente por ElevenLabs');
        return Buffer.from(response.data);
      } else {
        throw new Error(`ElevenLabs API error: ${response.status}`);
      }
    } catch (error) {
      console.error('❌ Error generando audio:', error.message);
      throw error;
    }
  }

  async subirASupabaseStorage(audioBuffer, clienteId) {
    try {
      console.log('☁️ Subiendo audio a Supabase Storage...');
      const fileName = `audio_msg_${clienteId}_${Date.now()}.mp3`;

      // Verificar si el bucket existe. Ya NO intentamos crearlo programáticamente.
      async subirASupabaseStorage(audioBuffer, clienteId) {
  try {
    console.log('☁️ Subiendo audio a Supabase Storage...');
    const fileName = `audio_msg_${clienteId}_${Date.now()}.mp3`;

    // Verificar si el bucket existe usando listBuckets()
    const { data: buckets, error: listError } = await this.supabase.storage.listBuckets();

    if (listError) {
      console.error('❌ Error listando buckets:', listError.message);
      throw listError;
    }

    const bucketExists = buckets.some(bucket => bucket.name === this.bucketName);

    if (!bucketExists) {
      console.error(`❌ ERROR: El bucket '${this.bucketName}' no existe. Por favor, créalo manualmente en el dashboard de Supabase (sección Storage y actívalo como "Public").`);
      throw new Error(`Bucket Supabase '${this.bucketName}' no encontrado. Por favor, créalo manualmente.`);
    }

    console.log(`✅ Bucket '${this.bucketName}' encontrado y listo para usar.`);

    // Subir archivo...
    // (el resto del código permanece igual)
      // Si llegamos aquí, el bucket existe o no hubo error al verificarlo.

      // Subir archivo
      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
        .upload(fileName, audioBuffer, {
          contentType: 'audio/mpeg',
          upsert: false
        });

      if (error) {
        console.error('❌ Error subiendo a Supabase Storage:', error);
        throw error;
      }

      // Obtener URL pública
      const { data: publicUrlData } = this.supabase.storage
        .from(this.bucketName)
        .getPublicUrl(fileName);

      if (!publicUrlData || !publicUrlData.publicUrl) {
        throw new Error('No se pudo obtener la URL pública de Supabase Storage.');
      }

      console.log('✅ Audio subido a Supabase Storage:', publicUrlData.publicUrl);
      return publicUrlData.publicUrl;
    } catch (error) {
      console.error('❌ Error en subirASupabaseStorage:', error);
      throw error;
    }
  }

  async convertirTextoAAudioURL(texto, clienteId) {
    try {
      const audioBuffer = await this.generarAudio(texto);
      const audioUrl = await this.subirASupabaseStorage(audioBuffer, clienteId);
      return audioUrl;
    } catch (error) {
      console.error('❌ Error convirtiendo texto a audio URL:', error.message);
      throw error;
    }
  }
}

// ---
// Lógica de Respuesta y Envío
// 🔧 FUNCIÓN PARA OBTENER O CREAR CONFIGURACIÓN DEL CLIENTE (LÓGICA MEJORADA)
const obtenerOCrearConfigCliente = async (numeroWhatsapp) => {
  try {
    const cleanNumber = numeroWhatsapp.replace(/^whatsapp:/, '').replace(/\D/g, '');
    console.log(`🔍 Buscando o creando configuración para número: ${cleanNumber}`);

    // 1. Intentar buscar por numeroWhatsapp primero (siempre la fuente de verdad)
    if (cleanNumber) {
      const { data, error } = await supabase
        .from('clientes')
        .select('id, nombre, tipo_respuesta, lista_servicios')
        .eq('numero_whatsapp', cleanNumber)
        .single();

      if (data) {
        console.log(`✅ Cliente encontrado por número ${cleanNumber}: ID ${data.id} (${data.nombre})`);
        return data; // Si se encuentra por número, usamos esa configuración
      } else if (error && error.code === 'PGRST116') {
        console.log(`⚠️ Cliente no encontrado por número ${cleanNumber}.`);
        // Continuar para crear cliente
      } else if (error) {
        console.error('❌ Error consultando cliente por número:', error.message);
        // Fallback a crear cliente si hay un error inesperado
      }
    }

    // 2. Si no se encontró por número, intentar crear uno por defecto
    console.log(`⚠️ No se encontró cliente existente. Intentando crear uno por defecto para ${cleanNumber || 'desconocido'}...`);
    const { data: newClient, error: createError } = await supabase
      .from('clientes')
      .insert([{
        nombre: `Cliente ${cleanNumber || 'Default'}`,
        numero_whatsapp: cleanNumber,
        tipo_respuesta: 'voz', // <--- ¡Cambiado a 'voz' por defecto para nuevos clientes!
        prompt_inicial: generarPromptVentasPersonalizado({ nombre: `Cliente ${cleanNumber || 'Default'}` }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (createError) {
      console.error('❌ Error al crear cliente por defecto:', createError.message);
      // Si falla la creación, el fallback es un objeto cliente mínimo (texto)
      return { id: null, tipo_respuesta: 'texto', nombre: 'Cliente por defecto (creación fallida)' };
    }
    console.log(`✅ Cliente por defecto creado con ID: ${newClient.id}`);
    return newClient;

  } catch (error) {
    console.error('❌ Error en obtenerOCrearConfigCliente (general catch):', error.message);
    // Fallback final si algo falla inesperadamente
    return { id: null, tipo_respuesta: 'texto', nombre: 'Cliente (error general)' };
  }
};

// 🎯 FUNCIÓN OPTIMIZADA PARA RESPUESTAS DE VENTAS
const generarRespuestaVentas = async (messages, intencion) => {
  try {
    let parametros = { ...parametrosGPTVentas };

    if (intencion.preguntaPrecio) {
      parametros.temperature = 0.6;
      parametros.max_tokens = 500;
    }

    if (intencion.objecion) {
      parametros.temperature = 0.7;
      parametros.presence_penalty = 0.8;
    }

    if (intencion.urgencia) {
      parametros.max_tokens = 300;
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

// 🎵 FUNCIÓN PRINCIPAL: ENVIAR MENSAJE SEGÚN PREFERENCIA
const audioManager = new AudioManager();

const enviarMensajeSegunPreferencia = async (numero, mensaje, clienteConfig) => {
  try {
    const to = numero.startsWith('whatsapp:') ? numero : `whatsapp:${numero}`;
    const from = process.env.TWILIO_WHATSAPP_NUMBER;
    const clienteId = clienteConfig.id || 'default'; // Usa el ID del cliente o 'default' si no existe

    console.log(`📱 Enviando mensaje a ${to} (Cliente ID: ${clienteId})`);
    console.log(`⚙️ Configuración cliente: ${clienteConfig.tipo_respuesta || 'texto'}`);

    // Si es texto O si no hay config de voz (o si está explícitamente en texto), enviar texto
    if (!clienteConfig.tipo_respuesta || clienteConfig.tipo_respuesta === 'texto') {
      console.log('📝 Enviando como TEXTO');
      return await twilioClient.messages.create({ from, to, body: mensaje });
    }

    // Si es voz, intentar generar audio
    if (clienteConfig.tipo_respuesta === 'voz') {
      try {
        console.log('🎵 Configurado para VOZ - Generando audio...');

        if (!process.env.ELEVENLABS_API_KEY) {
          console.error('❌ ELEVENLABS_API_KEY no configurada, enviando texto');
          return await twilioClient.messages.create({ from, to, body: mensaje });
        }

        const mensajeLimpio = mensaje
          .replace(/[🎯🔥💰✅❌⚡🚀📞💪]/g, '')
          .replace(/\n+/g, '. ')
          .trim();

        console.log(`🎵 Generando y subiendo audio para: "${mensajeLimpio.substring(0, 50)}..."`);

        const audioUrl = await audioManager.convertirTextoAAudioURL(mensajeLimpio, clienteId);
        console.log('URL del audio generado:', audioUrl);

        const resultado = await twilioClient.messages.create({
          from,
          to,
          mediaUrl: [audioUrl]
        });

        console.log('✅ Audio enviado exitosamente');
        return resultado;

      } catch (audioError) {
        console.error('❌ Error con audio, enviando texto como fallback:', audioError.message);
        return await twilioClient.messages.create({ from, to, body: mensaje });
      }
    }

    console.log('📝 Fallback a TEXTO (configuración no reconocida)');
    return await twilioClient.messages.create({ from, to, body: mensaje });

  } catch (error) {
    console.error('❌ Error en enviarMensajeSegunPreferencia:', error.message);
    return await twilioClient.messages.create({ from, to, body: mensaje });
  }
};

// 📱 FUNCIÓN ORIGINAL PARA ENVIAR TEXTO (MANTENER COMPATIBILIDAD/BACKUP)
const enviarMensajeTwilio = async (numero, mensaje) => {
  try {
    const to = numero.startsWith('whatsapp:') ? numero : `whatsapp:${numero}`;
    const from = process.env.TWILIO_WHATSAPP_NUMBER;
    const enviado = await twilioClient.messages.create({ from, to, body: mensaje });
    console.log(`📤 Texto enviado a ${to}: ${mensaje.substring(0, 100)}...`);
    return enviado;
  } catch (error) {
    console.error(`❌ Error enviando texto a ${numero}:`, error.message);
    throw error;
  }
};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---
// Endpoints
// 🧩 Webhook de entrada de mensajes
app.post('/webhook', async (req, res) => {
  console.log('📡 Webhook recibido:', new Date().toISOString());
  console.log('Body:', JSON.stringify(req.body, null, 2));

  const message = req.body.Body;
  const phone = req.body.From; // whatsapp:+521656...
  const name = req.body.ProfileName || 'WhatsApp User';

  if (!message || !phone) {
    console.error('❌ Faltan datos: message o phone');
    return res.status(400).json({ error: 'Missing message or phone' });
  }

  try {
    // **PRIMER CAMBIO CLAVE:** Obtener/Crear el cliente VERDADERO basado en el NÚMERO DE WHATSAPP entrante
    const clienteReal = await obtenerOCrearConfigCliente(phone);
    const cliente_id_para_guardar = clienteReal?.id || null;

    if (!cliente_id_para_guardar) {
        console.error('❌ No se pudo obtener/crear un cliente ID válido para el mensaje. No se guardará.');
        return res.status(500).json({ error: 'No valid client ID for message.' });
    }

    console.log(`👤 Cliente detectado/creado para webhook: ID ${cliente_id_para_guardar} - ${clienteReal?.nombre}`);

    const { error } = await supabase.from('conversations').insert([{
      lead_phone: phone,
      last_message: message,
      agent_name: name,
      status: 'New',
      created_at: new Date().toISOString(),
      origen: 'whatsapp',
      procesar: false,
      cliente_id: cliente_id_para_guardar // ¡Usamos el ID correcto!
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

// 🔄 FUNCIÓN OPTIMIZADA PARA PROCESAR MENSAJES ENTRANTES CON VENTAS Y AUDIO
const responderMensajesEntrantesOptimizado = async () => {
  console.log('--- Iniciando ciclo de responderMensajesEntrantesOptimizado ---');
  try {
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
      const { id, lead_phone, last_message } = mensaje; // Eliminamos cliente_id de aquí, lo obtendremos
      
      // **SEGUNDO CAMBIO CLAVE:** Obtener la configuración del cliente REAL por el número de teléfono
      const clienteConfig = await obtenerOCrearConfigCliente(lead_phone);
      const cliente_id_actual = clienteConfig?.id || null;

      if (!cliente_id_actual) {
        console.error(`❌ No se pudo obtener/crear un cliente ID válido para el mensaje ${id}. Se omite el procesamiento.`);
        await supabase.from('conversations').update({ procesar: true, status: 'Failed: No Client' }).eq('id', id); // Marcar como fallido
        continue;
      }

      console.log(`\n📞 Procesando lead ID: ${id} de ${lead_phone} (Cliente ID real: ${cliente_id_actual})`);

      try {
        const intencion = detectarIntencionVenta(last_message || '');
        console.log(`🎯 Intención detectada:`, Object.keys(intencion).filter(k => intencion[k]).join(', ') || 'general');

        // Generar historial con el ID del cliente real, si aplica
        const messages = await generarHistorialGPT(lead_phone, supabase, cliente_id_actual); // Pasar cliente_id_actual
        if (!messages) {
          console.error('❌ No se pudo generar historial para GPT');
          await supabase.from('conversations').update({ procesar: true, status: 'Failed: GPT History' }).eq('id', id);
          continue;
        }

        console.log('🧠 Enviando a OpenAI con parámetros optimizados...');

        const textoAI = await generarRespuestaVentas(messages, intencion);
        console.log(`🎯 Respuesta de AI optimizada: ${textoAI.substring(0, 100)}...`);

        const esRespuestaVentas = /\$|\d+|precio|costo|oferta|disponible|cuando|cita|reservar|llamar/i.test(textoAI);
        console.log(`💰 Respuesta orientada a ventas: ${esRespuestaVentas ? 'SÍ' : 'NO'}`);

        // Marcar el mensaje original como procesado
        await supabase.from('conversations').update({ procesar: true, cliente_id: cliente_id_actual }).eq('id', id);

        // Insertar respuesta
        await supabase.from('conversations').insert([{
          lead_phone,
          last_message: textoAI,
          agent_name: 'Unicorn AI',
          status: esRespuestaVentas ? 'Sales Pitch' : 'In Progress',
          created_at: new Date().toISOString(),
          origen: 'unicorn',
          procesar: true,
          cliente_id: cliente_id_actual // ¡Usar el ID del cliente REAL!
        }]);

        // 🎵 USAR FUNCIÓN QUE DETECTA AUDIO/TEXTO CON LA CONFIGURACIÓN REAL DEL CLIENTE
        await enviarMensajeSegunPreferencia(lead_phone, textoAI, clienteConfig);

        console.log('✅ Mensaje entrante procesado exitosamente con audio/texto');

      } catch (err) {
        console.error(`❌ Error procesando entrada ${lead_phone}:`, err.message);

        if (err.response?.status === 429 || err.response?.status >= 500) {
          console.log('⚠️ Enviando respuesta de fallback orientada a ventas...');
          const fallbackMessage = "¡Hola! Tengo exactamente lo que necesitas. Permíteme llamarte en 5 minutos para darte precios especiales que solo ofrezco por teléfono. ¿Cuál es el mejor número para contactarte?";
          await enviarMensajeSegunPreferencia(lead_phone, fallbackMessage, clienteConfig);
          await supabase.from('conversations').update({ procesar: true, status: 'Failed: AI Error' }).eq('id', id);
        } else {
          await supabase.from('conversations').update({ procesar: true, status: 'Failed: Unknown' }).eq('id', id);
        }
      }
    }
  } catch (mainErr) {
    console.error('❌ Error crítico en responderMensajesEntrantesOptimizado:', mainErr.message);
  } finally {
    console.log('--- Finalizando ciclo de responderMensajesEntrantesOptimizado ---');
  }
};

// 🔁 Procesa mensajes salientes desde Unicorn (TAMBIÉN OPTIMIZADO CON AUDIO)
const procesarMensajesDesdeUnicorn = async () => {
  console.log('--- Iniciando ciclo de procesarMensajesDesdeUnicorn ---');
  try {
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
      const { id, lead_phone, last_message } = mensaje; // Eliminamos cliente_id de aquí

      // **TERCER CAMBIO CLAVE:** Obtener la configuración del cliente REAL por el número de teléfono
      const clienteConfig = await obtenerOCrearConfigCliente(lead_phone);
      const cliente_id_actual = clienteConfig?.id || null;

      if (!cliente_id_actual) {
        console.error(`❌ No se pudo obtener/crear un cliente ID válido para el mensaje ${id}. Se omite el procesamiento.`);
        await supabase.from('conversations').update({ procesar: true, status: 'Failed: No Client' }).eq('id', id);
        continue;
      }

      console.log(`\n🔄 Procesando mensaje ID: ${id} para ${lead_phone} (Cliente ID real: ${cliente_id_actual})`);

      try {
        const intencion = detectarIntencionVenta(last_message || '');

        // Generar historial con el ID del cliente real, si aplica
        const messages = await generarHistorialGPT(lead_phone, supabase, cliente_id_actual); // Pasar cliente_id_actual
        if (!messages) {
          console.error('❌ No se pudo generar historial para GPT');
          await supabase.from('conversations').update({ procesar: true, status: 'Failed: GPT History' }).eq('id', id);
          continue;
        }

        console.log('🧠 Enviando a OpenAI con parámetros optimizados...');

        const textoAI = await generarRespuestaVentas(messages, intencion);
        console.log(`🎯 Respuesta de AI: ${textoAI.substring(0, 100)}...`);

        await supabase.from('conversations').update({ procesar: true, cliente_id: cliente_id_actual }).eq('id', id);

        await supabase.from('conversations').insert([{
          lead_phone,
          last_message: textoAI,
          agent_name: 'Unicorn AI',
          status: 'In Progress',
          created_at: new Date().toISOString(),
          origen: 'unicorn',
          procesar: true,
          cliente_id: cliente_id_actual // ¡Usar el ID del cliente REAL!
        }]);

        // 🎵 USAR FUNCIÓN QUE DETECTA AUDIO/TEXTO CON LA CONFIGURACIÓN REAL DEL CLIENTE
        await enviarMensajeSegunPreferencia(lead_phone, textoAI, clienteConfig);

        console.log('✅ Mensaje Unicorn procesado exitosamente con audio/texto');

      } catch (err) {
        console.error(`❌ Error procesando unicorn ${lead_phone}:`, err.message);
        await supabase.from('conversations').update({ procesar: true, status: 'Failed: AI Error' }).eq('id', id);
      }
    }
  } catch (mainErr) {
    console.error('❌ Error crítico en procesarMensajesDesdeUnicorn:', mainErr.message);
  } finally {
    console.log('--- Finalizando ciclo de procesarMensajesDesdeUnicorn ---');
  }
};

// 🔄 FUNCIÓN PARA ACTUALIZAR TODOS LOS PROMPTS A ORIENTACIÓN DE VENTAS
const actualizarPromptsAVentas = async () => {
  console.log('🚀 Iniciando actualización masiva de prompts a orientación de ventas...');
  try {
    const { data: clientes, error } = await supabase
      .from('clientes')
      .select('*');

    if (error) {
      console.error('❌ Error obteniendo clientes:', error);
      return;
    }

    console.log(`👥 Encontrados ${clientes.length} clientes para actualizar`);

    let actualizados = 0;
    let errores = 0;

    for (const cliente of clientes) {
      try {
        console.log(`\n🔧 Actualizando cliente: ${cliente.nombre} (ID: ${cliente.id})`);

        let serviciosProcesados = [];
        if (cliente.lista_servicios) {
          try {
            serviciosProcesados = typeof cliente.lista_servicios === 'string'
              ? JSON.parse(cliente.lista_servicios)
              : cliente.lista_servicios;
          } catch (e) {
            // Fallback para manejar strings de servicios no JSON (ej. lista con saltos de línea)
            serviciosProcesados = cliente.lista_servicios
              .split('\n')
              .filter(linea => linea.trim())
              .map(linea => {
                const match = linea.match(/(.+?)[\s-]*\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/);
                if (match) {
                  return {
                    nombre: match[1].replace(/^[•\-\*]\s*/, '').trim(),
                    precio: match[2],
                    descripcion: linea.trim()
                  };
                }
                return {
                  nombre: linea.replace(/^[•\-\*]\s*/, '').trim(),
                  precio: null,
                  descripcion: linea.trim()
                };
              });
          }
        }

        const nuevoPrompt = generarPromptVentasPersonalizado(cliente, serviciosProcesados);
        const backupPrompt = cliente.prompt_inicial;

        const { error: updateError } = await supabase
          .from('clientes')
          .update({
            prompt_inicial: nuevoPrompt,
            prompt_backup: backupPrompt,
            updated_at: new Date().toISOString()
          })
          .eq('id', cliente.id);

        if (updateError) {
          console.error(`❌ Error actualizando cliente ${cliente.id}:`, updateError);
          errores++;
        } else {
          console.log(`✅ Cliente ${cliente.nombre} actualizado exitosamente`);
          console.log(`📝 Industria detectada: ${detectarIndustria(cliente.nombre, serviciosProcesados)}`);
          console.log(`🛍️ Servicios procesados: ${serviciosProcesados.length}`);
          actualizados++;
        }

        await new Promise(resolve => setTimeout(resolve, 100)); // Pequeño delay para evitar rate limits
      } catch (err) {
        console.error(`❌ Error procesando cliente ${cliente.id}:`, err);
        errores++;
      }
    }

    console.log(`\n📊 RESUMEN DE ACTUALIZACIÓN:`);
    console.log(`✅ Clientes actualizados: ${actualizados}`);
    console.log(`❌ Errores: ${errores}`);
    console.log(`📈 Tasa de éxito: ${((actualizados / clientes.length) * 100).toFixed(1)}%`);

    if (actualizados > 0) {
      console.log(`\n🔍 Verificando resultados...`);
      const { data: verificacion } = await supabase
        .from('clientes')
        .select('id, nombre, prompt_inicial')
        .limit(3);

      verificacion?.forEach(cliente => {
        const contieneVentas = /CERRAR VENTAS|ESTRATEGIA DE VENTAS|urgencia|precio|descuento/i.test(cliente.prompt_inicial);
        console.log(`✅ ${cliente.nombre}: ${contieneVentas ? 'ORIENTADO A VENTAS' : 'NECESITA REVISIÓN'}`);
      });
    }

    return { actualizados, errores };
  } catch (mainError) {
    console.error('❌ Error general en actualizarPromptsAVentas:', mainError);
    return { actualizados: 0, errores: clientes.length || 0 };
  }
};


// ---
// Testeo y Inicialización del Sistema
// 🧪 Test de audio para un número específico
app.get('/test-audio/:phone', async (req, res) => {
  try {
    const { phone } = req.params;
    const mensaje = req.query.mensaje || "Hola, este es un mensaje de prueba de audio desde nuestro sistema usando Supabase Storage.";
    
    console.log(`🧪 Test de audio para ${phone}`);

    // Obtener la configuración real del cliente para el número de prueba
    const clienteParaTest = await obtenerOCrearConfigCliente(phone);

    const resultado = await enviarMensajeSegunPreferencia(
      phone.startsWith('whatsapp:') ? phone : `whatsapp:${phone}`,
      mensaje,
      clienteParaTest // Pasamos el objeto de configuración del cliente
    );

    res.json({
      success: true,
      phone,
      mensaje,
      clienteId: clienteParaTest.id,
      twilioSid: resultado.sid,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error en test de audio:', error.message);
    res.status(500).json({
      error: error.message,
      success: false
    });
  }
});

// 🧪 Test directo de ElevenLabs + Supabase Storage
app.get('/test-elevenlabs', async (req, res) => {
  try {
    const texto = req.query.texto || "Hola, este es un test de ElevenLabs con Supabase Storage.";
    const testNumber = req.query.phone || "whatsapp:+15551234567"; // Usar un número de prueba para crear cliente si es necesario

    console.log('🧪 Test directo ElevenLabs + Supabase Storage');

    // Aquí necesitamos un cliente ID real para el nombre de archivo, así que lo obtenemos/creamos
    const clienteParaTest = await obtenerOCrearConfigCliente(testNumber);
    const audioUrl = await audioManager.convertirTextoAAudioURL(texto, clienteParaTest.id || 'default');
    
    res.json({
      success: true,
      texto,
      audioUrl,
      mensaje: "Audio generado y subido exitosamente a Supabase Storage",
      clienteId: clienteParaTest.id,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error en test ElevenLabs + Supabase:', error.message);
    res.status(500).json({
      error: error.message,
      success: false
    });
  }
});

// ⚙️ Endpoint para cambiar preferencia de cliente
app.post('/cliente/:id/preferencia', async (req, res) => {
  try {
    const { id } = req.params;
    const { tipo_respuesta } = req.body;

    if (!['voz', 'texto'].includes(tipo_respuesta)) {
      return res.status(400).json({
        error: 'tipo_respuesta debe ser "voz" o "texto"'
      });
    }

    const { data, error } = await supabase
      .from('clientes')
      .update({ tipo_respuesta, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select();

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      cliente: data[0],
      mensaje: `Preferencia actualizada a: ${tipo_respuesta}`,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error actualizando preferencia:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// 📊 Endpoint para ver stats de audio vs texto
app.get('/stats-audio', async (req, res) => {
  try {
    const { data: clientes, error } = await supabase
      .from('clientes')
      .select('id, nombre, tipo_respuesta');

    if (error) throw error;

    const stats = clientes.reduce((acc, cliente) => {
      const tipo = cliente.tipo_respuesta || 'texto';
      acc[tipo] = (acc[tipo] || 0) + 1;
      return acc;
    }, {});

    res.json({
      totalClientes: clientes.length,
      distribucion: stats,
      porcentajeAudio: ((stats.voz || 0) / clientes.length * 100).toFixed(1),
      clientes: clientes.map(c => ({
        id: c.id,
        nombre: c.nombre,
        preferencia: c.tipo_respuesta || 'texto'
      })),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error en stats audio:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para actualizar TODOS los prompts a orientación de ventas:
app.post('/update-all-prompts-ventas', async (req, res) => {
  try {
    console.log('🚀 Iniciando actualización masiva de prompts...');
    const resultado = await actualizarPromptsAVentas();

    res.json({
      success: true,
      mensaje: "Actualización de prompts completada",
      clientesActualizados: resultado.actualizados,
      errores: resultado.errores,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error en actualización masiva:', error.message);
    res.status(500).json({
      error: error.message,
      success: false
    });
  }
});

// Endpoint para restaurar prompt original:
app.post('/cliente/:id/restaurar-prompt', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: cliente, error: getError } = await supabase
      .from('clientes')
      .select('prompt_backup')
      .eq('id', id)
      .single();

    if (getError) throw getError;

    if (!cliente.prompt_backup) {
      return res.status(400).json({
        error: 'No hay backup disponible para restaurar'
      });
    }

    const { data, error } = await supabase
      .from('clientes')
      .update({
        prompt_inicial: cliente.prompt_backup,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select();

    if (error) throw error;

    res.json({
      success: true,
      cliente: data[0],
      mensaje: 'Prompt restaurado desde backup',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error restaurando prompt:', error.message);
    res.status(500).json({ error: error.message });
  }
});


// ---
// INICIALIZAR SISTEMA AL STARTUP
const inicializarSistema = async () => {
  console.log('🚀 INICIALIZANDO SISTEMA CON AUDIO/VOZ...');

  // Verificar variables críticas
  const varsRequeridas = [
    'SUPABASE_URL', 'SUPABASE_ANON_KEY',
    'TWILIO_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_NUMBER',
    'OPENAI_API_KEY'
  ];

  const varsFaltantes = varsRequeridas.filter(v => !process.env[v]);
  if (varsFaltantes.length > 0) {
    console.error('❌ Variables de entorno CRÍTICAS faltantes:', varsFaltantes);
    console.error('¡El sistema no puede iniciar correctamente sin estas variables!');
    process.exit(1);
  }

  // Verificar variables de audio
  const varsAudio = ['ELEVENLABS_API_KEY', 'ELEVENLABS_VOICE_ID', 'ELEVENLABS_MODEL'];
  const audioCompleto = varsAudio.every(v => process.env[v]);

  console.log(`🎵 Sistema de audio: ${audioCompleto ? 'ACTIVADO' : 'DESACTIVADO (solo texto)'}`);

  if (audioCompleto) {
    console.log('✅ Todas las variables de ElevenLabs configuradas');

    // Inicializar bucket de Supabase Storage
    try {
      const { data: bucketData, error: bucketError } = await supabase.storage.getBucket('audios'); // <--- AQUI SE CAMBIO EL NOMBRE DEL BUCKET A 'audios'
      if (bucketError && bucketError.message === 'Bucket not found') {
        console.error("❌ ERROR: El bucket 'audios' no existe en Supabase. Por favor, créalo manualmente en el dashboard (sección Storage y actívalo como 'Public').");
        console.log('⚠️ Sistema funcionará solo con texto hasta que el bucket sea creado manualmente.');
      } else if (bucketError) {
        console.error('❌ Error verificando bucket:', bucketError.message);
      } else {
        console.log("✅ Bucket 'audios' ya existe.");
      }
    } catch (err) {
      console.error('❌ Error bucket Supabase:', err.message);
    }
  } else {
    console.log('⚠️ Variables ElevenLabs faltantes:', varsAudio.filter(v => !process.env[v]));
    console.log('📝 Sistema funcionará solo con texto.');
  }

  return true;
};

// AL FINAL DEL ARCHIVO:
// Iniciar el servidor solo si la inicialización es exitosa
inicializarSistema().then((success) => {
  if (success) {
    app.listen(port, () => {
      console.log(`🎉 Servidor escuchando en el puerto ${port}`);
      console.log(`🚀 Accede al webhook en: http://localhost:${port}/webhook`);
      console.log(`🧪 Prueba el sistema de audio en: http://localhost:${port}/test-audio/:phone`);
      console.log(`🧪 Prueba ElevenLabs/Supabase en: http://localhost:${port}/test-elevenlabs`);
      console.log(`⚙️ Gestiona preferencias de cliente en: http://localhost:${port}/cliente/:id/preferencia`);
      console.log(`📊 Ve estadísticas de audio en: http://localhost:${port}/stats-audio`);
      console.log(`🔄 Actualiza todos los prompts a ventas: http://localhost:${port}/update-all-prompts-ventas`);
      console.log(`⏪ Restaura prompt de cliente: http://localhost:${port}/cliente/:id/restaurar-prompt`);
    });
    // Intervalos para procesar mensajes
    setInterval(responderMensajesEntrantesOptimizado, 5 * 60 * 1000); // Cada 5 minutos
    setInterval(procesarMensajesDesdeUnicorn, 2 * 60 * 1000); // Cada 2 minutos
  } else {
    console.error('🚫 Fallo al inicializar el sistema. El servidor no se iniciará.');
  }
}).catch(err => {
  console.error('❌ Error crítico durante la inicialización del sistema:', err);
  process.exit(1);
});
