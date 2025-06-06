const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const twilio = require('twilio');
const fs = require('fs'); // Necesario para guardar archivos de audio
const path = require('path'); // Necesario para rutas de archivos
const { generarHistorialGPT } = require('./generarHistorialGPT'); // Asegúrate de que este archivo exista
require('dotenv').config(); // Carga las variables de entorno desde .env

const app = express();
const port = process.env.PORT || 8080;

// Inicialización de clientes
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

// 🔧 PARÁMETROS OPTIMIZADOS PARA VENTAS GPT
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
📞 Si no puedes cerrar por WhatsApp, agenda llamada INMEDIATA: "Te llamo en 2 minutos para cerrar los detalles"`;

    return prompt;
};

// 🏭 FUNCIÓN PARA DETECTAR INDUSTRIA BASADA EN NOMBRE Y SERVICIOS
const detectarIndustria = (nombre = '', servicios = []) => {
    const nombreLower = nombre.toLowerCase();
    const serviciosTexto = servicios.map(s =>
        `${s.nombre || s.name || ''} ${s.descripcion || s.description || ''}`
    ).join(' ').toLowerCase();

    const todasPalabras = `${nombreLower} ${serviciosTexto}`;

    // Detectar industria por palabras clave
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

// 🎯 FUNCIÓN OPTIMIZADA PARA RESPUESTAS DE VENTAS (GPT)
const generarRespuestaVentas = async (messages, intencion) => {
    try {
        // Parámetros dinámicos según intención
        let parametros = { ...parametrosGPTVentas };

        if (intencion.preguntaPrecio) {
            parametros.temperature = 0.6; // Más preciso para precios
            parametros.max_tokens = 500; // Más espacio para detalles
        }

        if (intencion.objecion) {
            parametros.temperature = 0.7; // Balance entre creatividad y precisión
            parametros.presence_penalty = 0.8; // Evitar respuestas genéricas
        }

        if (intencion.urgencia) {
            parametros.max_tokens = 300; // Respuestas más directas
            parametros.temperature = 0.9; // Más energía
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

// 🎧 FUNCIÓN PARA GENERAR AUDIO CON ELEVENLABS
const generarAudioElevenLabs = async (texto, nombreArchivo) => {
    try {
        // ID de la voz predeterminada de ElevenLabs (Rachel)
        const vozId = '21m00Tcm4TlvDq8ikWAM';
        const response = await axios({
            method: 'POST',
            url: `https://api.elevenlabs.io/v1/text-to-speech/${vozId}`,
            data: {
                text: texto,
                model_id: 'eleven_monolingual_v1', // Modelo para español
                voice_settings: {
                    stability: 0.4,
                    similarity_boost: 0.8,
                    style: 0.2,
                    use_speaker_boost: true
                }
            },
            headers: {
                'xi-api-key': process.env.ELEVENLABS_API_KEY,
                'Content-Type': 'application/json'
            },
            responseType: 'arraybuffer' // Para manejar el audio como bytes
        });

        // Asegurar que el directorio 'audio' exista
        const ruta = path.join(__dirname, 'audio');
        if (!fs.existsSync(ruta)) fs.mkdirSync(ruta, { recursive: true });

        // Guardar el archivo de audio
        const rutaArchivo = path.join(ruta, nombreArchivo);
        fs.writeFileSync(rutaArchivo, response.data);

        // Construir la URL pública para Twilio
        const baseUrl = 'https://unicorn-whatsapp-production.up.railway.app';
        const urlPublica = `${baseUrl}/audio/${nombreArchivo}`.trim();

        console.log(`🎧 Audio guardado en: ${rutaArchivo}`);
        console.log(`🎧 Audio URL generada: ${urlPublica}`);

        return {
            success: true,
            url: urlPublica
        };

    } catch (err) {
        console.error('❌ Error generando audio con ElevenLabs:', err.message);
        return { success: false, error: err.message };
    }
};

// 📤 FUNCIÓN PARA ENVIAR MENSAJES CON TWILIO (TEXTO O AUDIO)
const enviarMensajeTwilio = async (numero, mensaje, audioUrl = null) => {
    try {
        const to = numero.startsWith('whatsapp:') ? numero : `whatsapp:${numero}`;
        const from = process.env.TWILIO_WHATSAPP_NUMBER;
        const messageOptions = { from, to };

        if (audioUrl) {
            messageOptions.mediaUrl = [audioUrl]; // Twilio espera un array de URLs para media
            console.log(`📤 Enviando audio a ${to}: ${audioUrl}`);
        } else {
            messageOptions.body = mensaje;
            console.log(`📤 Enviando texto a ${to}: ${mensaje.substring(0, Math.min(mensaje.length, 100))}...`);
        }

        const enviado = await twilioClient.messages.create(messageOptions);
        console.log(`✅ Mensaje/Audio enviado (SID: ${enviado.sid})`);
        return enviado;
    } catch (error) {
        console.error(`❌ Error enviando a ${numero}:`, error.message);
        // Si falla el envío de audio, intenta enviar solo texto como fallback
        if (audioUrl && error.message.includes('mediaUrl') || error.message.includes('Twilio')) {
            console.warn('⚠️ Falló envío de audio, intentando enviar solo texto como fallback...');
            try {
                const fallbackEnviado = await twilioClient.messages.create({ from, to, body: mensaje });
                console.log(`✅ Fallback de texto enviado (SID: ${fallbackEnviado.sid})`);
                return fallbackEnviado;
            } catch (fallbackError) {
                console.error(`❌ Error en fallback de texto a ${numero}:`, fallbackError.message);
            }
        }
        throw error; // Relanzar el error para que sea manejado por el caller
    }
};

// Middlewares de Express
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Servir archivos de audio estáticos desde el directorio 'audio'
app.use('/audio', express.static(path.join(__dirname, 'audio')));

// 🧩 Webhook de entrada de mensajes (para Twilio)
app.post('/webhook', async (req, res) => {
    console.log('📡 Webhook recibido:', new Date().toISOString());
    console.log('Body:', JSON.stringify(req.body, null, 2));

    const message = req.body.Body;
    const phone = req.body.From; // Ej: "whatsapp:+521234567890"
    const name = req.body.ProfileName || 'WhatsApp User';

    if (!message || !phone) {
        console.error('❌ Faltan datos: message o phone');
        return res.status(400).json({ error: 'Missing message or phone' });
    }

    try {
        // Extraer número limpio (ej: "+521234567890")
        const numero = phone.replace(/^whatsapp:/, '').replace(/\D/g, '');
        console.log(`📱 Número procesado: +${numero} (original: ${phone})`);

        // Buscar cliente basado en el número en Supabase
        const { data: clienteData, error: clienteError } = await supabase
            .from('clientes')
            .select('id, nombre, numero_whatsapp')
            .eq('numero_whatsapp', `+${numero}`)
            .single();

        // PGRST116 significa "no rows found", no es un error crítico aquí
        if (clienteError && clienteError.code !== 'PGRST116') {
            console.error('❌ Error consultando cliente:', clienteError.message);
        }

        // Asignar un cliente_id por defecto si no se encuentra
        const cliente_id = clienteData?.id || 1;
        console.log(`👤 Cliente detectado: ID ${cliente_id} - ${clienteData?.nombre || 'Cliente por defecto'}`);

        // Guardar el mensaje entrante en la tabla 'conversations'
        const { error } = await supabase.from('conversations').insert([{
            lead_phone: phone,
            last_message: message,
            agent_name: name,
            status: 'New',
            created_at: new Date().toISOString(),
            origen: 'whatsapp',
            procesar: false, // Marcar como no procesado para que la función de polling lo recoja
            cliente_id
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

// 🔄 FUNCIÓN OPTIMIZADA PARA PROCESAR MENSAJES ENTRANTES CON VENTAS
// Esta función se ejecuta por polling para responder a los mensajes del cliente
const responderMensajesEntrantesOptimizado = async () => {
    const { data: mensajes, error } = await supabase
        .from('conversations')
        .select('*')
        .in('origen', ['whatsapp', 'sms']) // Mensajes que vienen del usuario
        .eq('procesar', false) // Que aún no han sido procesados por el bot
        .limit(10); // Limitar para evitar sobrecarga en cada ciclo de polling

    if (error) {
        console.error('❌ Error consultando mensajes entrantes:', error.message);
        return;
    }

    if (!mensajes?.length) {
        console.log('⏳ No hay nuevos leads para procesar...');
        return;
    }

    console.log(`📨 Procesando ${mensajes.length} mensajes entrantes con OPTIMIZACIÓN DE VENTAS`);

    for (const mensaje of pendientes) {
  const { id, lead_phone, last_message, cliente_id } = mensaje;
  console.log(`\n🔄 Procesando mensaje de Unicorn ID: ${id} para ${lead_phone}`);

  try {
    // Consultar el tipo de respuesta del cliente
    const { data: clienteData, error: clienteError } = await supabase
      .from('clientes')
      .select('tipo_respuesta')
      .eq('id', cliente_id)
      .single();

    const tipoRespuesta = clienteData?.tipo_respuesta || 'texto';

    let audioUrl = null;

    if (process.env.SEND_AUDIO_MESSAGES === 'true' && tipoRespuesta === 'voz') {
      console.log('🎧 Generando audio para mensaje de Unicorn saliente...');
      const audioResult = await generarAudioElevenLabs(last_message, `unicorn-out-${id}-${Date.now()}.mp3`);
      if (audioResult.success) {
        audioUrl = audioResult.url;
        console.log(`🎧 Audio URL generada: ${audioUrl}`);
      } else {
        console.error('❌ Fallo al generar audio, se enviará solo texto:', audioResult.error);
      }
    }

    // Marcar el mensaje como procesado ANTES de intentar enviar para evitar duplicados
    await supabase.from('conversations').update({ procesar: true }).eq('id', id);

    // Enviar el mensaje (texto o audio) a través de Twilio
    await enviarMensajeTwilio(lead_phone, last_message, audioUrl);

    console.log('✅ Mensaje Unicorn procesado y enviado exitosamente');

  } catch (err) {
    console.error(`❌ Error procesando mensaje Unicorn saliente ${lead_phone} (ID: ${id}):`, err.message);
    await supabase.from('conversations').update({ procesar: true, status: 'Error: Envio Unicorn' }).eq('id', id);
  }
}

            console.log('🧠 Enviando a OpenAI con parámetros optimizados...');
            const textoAI = await generarRespuestaVentas(messages, intencion);
            console.log(`🎯 Respuesta de AI optimizada (texto): ${textoAI.substring(0, Math.min(textoAI.length, 100))}...`);

            // Validar si la respuesta es orientada a ventas (para estado/log)
            const esRespuestaVentas = /\$|\d+|precio|costo|oferta|disponible|cuando|cita|reservar|llamar/i.test(textoAI);
            console.log(`💰 Respuesta orientada a ventas: ${esRespuestaVentas ? 'SÍ' : 'NO'}`);

            let audioUrl = null;
            // Generar audio si la variable de entorno está activada
            // Consultar el tipo de respuesta del cliente
const { data: clienteData, error: clienteError } = await supabase
  .from('clientes')
  .select('tipo_respuesta')
  .eq('id', mensaje.cliente_id)
  .single();

const tipoRespuesta = clienteData?.tipo_respuesta || 'texto';

if (process.env.SEND_AUDIO_MESSAGES === 'true' && tipoRespuesta === 'voz') {

                console.log('🎧 Intentando generar mensaje de audio...');
                // Usar el ID de la conversación para un nombre de archivo único
                const audioResult = await generarAudioElevenLabs(textoAI, `response-${id}-${Date.now()}.mp3`);
                if (audioResult.success) {
                    audioUrl = audioResult.url;
                    console.log(`🎧 Audio URL generada: ${audioUrl}`);
                } else {
                    console.error('❌ Fallo al generar audio, se enviará solo texto:', audioResult.error);
                }
            }

            // Marcar el mensaje entrante como procesado
            await supabase.from('conversations').update({
                procesar: true,
                status: esRespuestaVentas ? 'Sales Pitch' : 'In Progress'
            }).eq('id', id);

            // Insertar la respuesta del bot en la tabla 'conversations'
            await supabase.from('conversations').insert([{
                lead_phone,
                last_message: textoAI,
                agent_name: 'Unicorn AI',
                status: esRespuestaVentas ? 'Sales Pitch' : 'In Progress',
                created_at: new Date().toISOString(),
                origen: 'unicorn', // Indicar que este mensaje fue generado por el bot
                procesar: true, // Ya fue generado y procesado para envío, no necesita re-procesar por polling 'unicorn'
                cliente_id: cliente_id || 1
            }]);

            // Enviar la respuesta (texto o audio) al cliente vía Twilio
               try {
            // Enviar la respuesta (texto o audio) al cliente vía Twilio
            await enviarMensajeTwilio(lead_phone, textoAI, audioUrl);

            console.log('✅ Mensaje entrante procesado y respuesta enviada exitosamente');

        } catch (err) {
            console.error(`❌ Error procesando entrada ${lead_phone} (ID: ${id}):`, err.message);

            // Fallback de respuesta en caso de error crítico con OpenAI u otro servicio
            if (err.message.includes('OpenAI') || err.message.includes('ElevenLabs') || err.message.includes('timeout')) {
                console.log('⚠️ Enviando respuesta de fallback orientada a ventas debido a error de AI/servicio...');
                const fallbackMessage = "¡Hola! Algo inesperado sucedió. Tengo exactamente lo que necesitas. Permíteme llamarte en 5 minutos para darte precios especiales que solo ofrezco por teléfono. ¿Cuál es el mejor número para contactarte?";
                await enviarMensajeTwilio(lead_phone, fallbackMessage);
                await supabase.from('conversations').update({ procesar: true, status: 'Error: Fallback de AI' }).eq('id', id);
            } else {
                // Para otros errores no manejados específicamente, marcar como procesado
                await supabase.from('conversations').update({ procesar: true, status: 'Error General' }).eq('id', id);
            }
        }

// 🔁 Procesa mensajes salientes desde Unicorn (mensajes generados por el bot que necesitan ser enviados)
// Esta función se encarga de enviar los mensajes que el propio bot ha "decidido" enviar.
const procesarMensajesDesdeUnicorn = async () => {
    const { data: pendientes, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('origen', 'unicorn') // Mensajes que se originaron desde el bot (Unicorn AI)
        .eq('procesar', false); // Que aún no han sido enviados

    if (error) {
        console.error('❌ Error consultando mensajes Unicorn pendientes:', error.message);
        return;
    }

    if (!pendientes?.length) {
        console.log('⏳ No hay mensajes nuevos de Unicorn para enviar...');
        return;
    }

    console.log(`🤖 Procesando ${pendientes.length} mensajes de Unicorn para envío`);

    for (const mensaje of pendientes) {
        const { id, lead_phone, last_message } = mensaje;
        console.log(`\n🔄 Procesando mensaje de Unicorn ID: ${id} para ${lead_phone}`);

        try {
            // El `last_message` ya contiene el texto que el bot generó previamente
            // y que necesita ser enviado. No se llama a GPT aquí.

            let audioUrl = null;
            if (process.env.SEND_AUDIO_MESSAGES === 'true') {
                console.log('🎧 Generando audio para mensaje de Unicorn saliente...');
                const audioResult = await generarAudioElevenLabs(last_message, `unicorn-out-${id}-${Date.now()}.mp3`);
                if (audioResult.success) {
                    audioUrl = audioResult.url;
                    console.log(`🎧 Audio URL generada: ${audioUrl}`);
                } else {
                    console.error('❌ Fallo al generar audio, se enviará solo texto:', audioResult.error);
                }
            }

            // Marcar el mensaje como procesado ANTES de intentar enviar para evitar duplicados
            await supabase.from('conversations').update({ procesar: true }).eq('id', id);

            // Enviar el mensaje (texto o audio) a través de Twilio
            await enviarMensajeTwilio(lead_phone, last_message, audioUrl);

            console.log('✅ Mensaje Unicorn procesado y enviado exitosamente');

        } catch (err) {
            console.error(`❌ Error procesando mensaje Unicorn saliente ${lead_phone} (ID: ${id}):`, err.message);
            // Marcar como procesado con estado de error para evitar reintentos fallidos
            await supabase.from('conversations').update({ procesar: true, status: 'Error: Envio Unicorn' }).eq('id', id);
        }
    }
};

// 🔄 FUNCIÓN PARA ACTUALIZAR TODOS LOS PROMPTS A ORIENTACIÓN DE VENTAS (masivo)
const actualizarPromptsAVentas = async () => {
    try {
        console.log('🚀 Iniciando actualización masiva de prompts a orientación de ventas...');

        // Obtener todos los clientes de Supabase
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

                // Procesar lista de servicios (puede ser JSON o texto plano)
                let serviciosProcesados = [];
                if (cliente.lista_servicios) {
                    try {
                        serviciosProcesados = typeof cliente.lista_servicios === 'string'
                            ? JSON.parse(cliente.lista_servicios)
                            : cliente.lista_servicios;
                    } catch (e) {
                        // Si no es JSON válido, intentar parsear como texto línea por línea
                        serviciosProcesados = cliente.lista_servicios
                            .split('\n')
                            .filter(linea => linea.trim())
                            .map(linea => {
                                // Intentar extraer nombre y precio
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

                // Generar el nuevo prompt de ventas personalizado
                const nuevoPrompt = generarPromptVentasPersonalizado(cliente, serviciosProcesados);

                // Guardar el prompt anterior como backup por seguridad
                const backupPrompt = cliente.prompt_inicial;

                // Actualizar el cliente en la base de datos con el nuevo prompt
                const { error: updateError } = await supabase
                    .from('clientes')
                    .update({
                        prompt_inicial: nuevoPrompt,
                        prompt_backup: backupPrompt, // Guardar backup
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

                // Pequeña pausa para no sobrecargar la base de datos
                await new Promise(resolve => setTimeout(resolve, 100));

            } catch (err) {
                console.error(`❌ Error procesando cliente ${cliente.id}:`, err);
                errores++;
            }
        }

        console.log(`\n📊 RESUMEN DE ACTUALIZACIÓN DE PROMPTS:`);
        console.log(`✅ Clientes actualizados: ${actualizados}`);
        console.log(`❌ Errores: ${errores}`);
        console.log(`📈 Tasa de éxito: ${((actualizados / clientes.length) * 100).toFixed(1)}%`);

        // Verificación rápida de los prompts actualizados
        if (actualizados > 0) {
            console.log(`\n🔍 Verificando algunos resultados...`);
            const { data: verificacion } = await supabase
                .from('clientes')
                .select('id, nombre, prompt_inicial')
                .limit(3);

            verificacion?.forEach(cliente => {
                const contieneVentas = /CERRAR VENTAS|ESTRATEGIA DE VENTAS|urgencia|precio|descuento/i.test(cliente.prompt_inicial);
                console.log(`✅ ${cliente.nombre}: ${contieneVentas ? 'ORIENTADO A VENTAS' : 'NECESITA REVISIÓN'}`);
            });
        }

        return { actualizados, errores, total: clientes.length };

    } catch (error) {
        console.error('❌ Error general en la función de actualización masiva:', error);
        throw error;
    }
};

// Ruta principal del servidor
app.get('/', (req, res) => {
    res.send('🟢 Unicorn AI backend con OPTIMIZACIONES DE VENTAS y ELEVENLABS - ' + new Date().toISOString());
});

// 🧪 ENDPOINTS DE TESTING Y UTILIDAD

// Endpoint para testear respuestas optimizadas con opción de audio
app.get('/test-respuesta-ventas/:phone', async (req, res) => {
    try {
        const { phone } = req.params;
        const mensaje = req.query.mensaje || "Hola, ¿cuánto cuesta el servicio?";

        console.log(`🧪 Test de respuesta para ${phone} con mensaje: "${mensaje}"`);

        // Detectar intención del mensaje
        const intencion = detectarIntencionVenta(mensaje);
        console.log('🎯 Intención detectada:', Object.keys(intencion).filter(k => intencion[k]));

        // Generar historial mock (asumiendo que generarHistorialGPT puede manejar esto)
        const messages = await generarHistorialGPT(`whatsapp:${phone}`, supabase);

        if (!messages) {
            return res.json({
                error: 'No se pudo generar historial para el test',
                phone,
                mensaje
            });
        }

        // Generar respuesta de texto optimizada
        const respuestaTexto = await generarRespuestaVentas(messages, intencion);

        // Análisis de la respuesta generada
        const analisis = {
            contienePrecios: /\$|\d+|precio|costo/i.test(respuestaTexto),
            creaUrgencia: /urgente|limitado|solo|esta semana|hoy/i.test(respuestaTexto),
            preguntaCierre: /cuando|empezamos|confirmar|reservar/i.test(respuestaTexto),
            manejaObjeciones: /inversion|beneficio|facilidad|pago/i.test(respuestaTexto)
        };

        let audioTestUrl = null;
        // Generar audio para el test si está activado
        if (process.env.SEND_AUDIO_MESSAGES === 'true') {
            const audioResult = await generarAudioElevenLabs(respuestaTexto, `test-audio-${Date.now()}.mp3`);
            if (audioResult.success) {
                audioTestUrl = audioResult.url;
            } else {
                console.error('❌ Error generando audio para test:', audioResult.error);
            }
        }

        res.json({
            phone,
            mensajeOriginal: mensaje,
            intencionDetectada: intencion,
            respuestaGenerada: respuestaTexto,
            analisisVentas: analisis,
            esOrientadaVentas: Object.values(analisis).some(v => v),
            audioURL: audioTestUrl, // Incluir URL de audio si se generó
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error en test de respuesta:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint para actualizar prompts masivamente (útil para administradores)
app.post('/actualizar-prompts-ventas', async (req, res) => {
    try {
        console.log('🚀 Iniciando actualización masiva de prompts desde endpoint...');
        const resultado = await actualizarPromptsAVentas();
        res.json({
            success: true,
            mensaje: 'Actualización de prompts completada',
            ...resultado,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Error en actualización masiva de prompts:', error.message);
        res.status(500).json({
            error: error.message,
            success: false,
            timestamp: new Date().toISOString()
        });
    }
});

// Endpoint para testear un cliente específico y su prompt de ventas generado
app.get('/test-cliente-ventas/:clienteId', async (req, res) => {
    try {
        const { clienteId } = req.params;

        // Obtener datos del cliente de Supabase
        const { data: cliente, error } = await supabase
            .from('clientes')
            .select('*')
            .eq('id', clienteId)
            .single();

        if (error) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        // Procesar lista de servicios del cliente
        let servicios = [];
        if (cliente.lista_servicios) {
            try {
                servicios = typeof cliente.lista_servicios === 'string'
                    ? JSON.parse(cliente.lista_servicios)
                    : cliente.lista_servicios;
            } catch (e) {
                servicios = []; // Si falla el parseo JSON, asumir array vacío
            }
        }

        // Generar el prompt de ventas basado en los datos del cliente
        const promptVentas = generarPromptVentasPersonalizado(cliente, servicios);
        const industria = detectarIndustria(cliente.nombre, servicios);

        // Analizar el prompt inicial (actual) del cliente para ver si ya tiene enfoque de ventas
        const promptActual = cliente.prompt_inicial || '';
        const analisisActual = {
            tieneEnfoqueVentas: /CERRAR VENTAS|venta|precio|oferta/i.test(promptActual),
            creaUrgencia: /urgente|limitado|esta semana/i.test(promptActual),
            manejaObjeciones: /objecion|objeción|caro|inversion/i.test(promptActual),
            mencionaPrecios: /precio|\$|costo|descuento/i.test(promptActual)
        };

        res.json({
            cliente: {
                id: cliente.id,
                nombre: cliente.nombre,
                industria
            },
            servicios,
            promptActual: promptActual.substring(0, Math.min(promptActual.length, 500)) + '...', // Mostrar solo un fragmento
            promptVentasGenerado: promptVentas.substring(0, Math.min(promptVentas.length, 500)) + '...', // Mostrar solo un fragmento
            analisisPromptActual: analisisActual,
            // Determinar si el prompt del cliente necesita actualización al nuevo formato de ventas
            necesitaActualizacion: !Object.values(analisisActual).every(v => v),
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error testeando cliente específico:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint para obtener estadísticas de conversaciones (últimas 24 horas)
app.get('/stats-ventas', async (req, res) => {
    try {
        const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        const { data: stats, error } = await supabase
            .from('conversations')
            .select('status, origen, created_at')
            .gte('created_at', desde); // Filtrar por las últimas 24 horas

        if (error) {
            throw error;
        }

        // Resumen de estadísticas
        const resumen = {
            total: stats.length,
            porOrigen: stats.reduce((acc, m) => {
                acc[m.origen] = (acc[m.origen] || 0) + 1;
                return acc;
            }, {}),
            porStatus: stats.reduce((acc, m) => {
                acc[m.status] = (acc[m.status] || 0) + 1;
                return acc;
            }, {})
        };

        res.json({
            resumen,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error en /stats-ventas:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// 🚀 ENDPOINTS ESPECÍFICOS DE ELEVENLABS (para pruebas directas de audio)
app.post('/api/generar-audio', async (req, res) => {
    const { texto, archivo } = req.body;
    if (!texto) return res.status(400).json({ error: 'Falta texto' });

    // Generar un nombre de archivo único si no se proporciona
    const nombreArchivo = archivo || `audio-directo-${Date.now()}.mp3`;
    const resultado = await generarAudioElevenLabs(texto, nombreArchivo);
    if (!resultado.success) return res.status(500).json({ error: resultado.error });
    res.json({ url: resultado.url });
});

app.post('/webhook-test-audio', async (req, res) => {
    const texto = req.body.text || 'Hola, este es un ejemplo de audio generado para un webhook de prueba.';
    const nombreArchivo = `webhook-prueba-${Date.now()}.mp3`; // Nombre de archivo único
    const resultado = await generarAudioElevenLabs(texto, nombreArchivo);
    if (!resultado.success) return res.status(500).json({ error: resultado.error });
    res.json({ audio_url: resultado.url });
});


// ⏰ Configuración de Polling para procesar mensajes
if (process.env.POLLING_ACTIVO === 'true') {
    console.log('🔁 Polling activo cada 10 segundos para procesar mensajes entrantes y salientes.');
    // Procesa mensajes que vienen de clientes y requieren respuesta del bot
    setInterval(responderMensajesEntrantesOptimizado, 10000);
    // Procesa mensajes generados por el bot que necesitan ser enviados
    setInterval(procesarMensajesDesdeUnicorn, 10000);
} else {
    console.log('⏸️ Polling desactivado según configuración en .env');
}

// 🚀 Inicio del servidor
app.listen(port, () => {
    console.log(`🟢 Servidor corriendo en puerto ${port}`);
});
