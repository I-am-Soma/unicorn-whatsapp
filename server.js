const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const twilio = require('twilio');
const { generarHistorialGPT } = require('./generarHistorialGPT');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8080;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

// 🔧 PARÁMETROS OPTIMIZADOS PARA VENTAS
const parametrosGPTVentas = {
  model: 'gpt-3.5-turbo',
  max_tokens: 300, // Aumentado para respuestas más completas
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

// 🎯 FUNCIÓN OPTIMIZADA PARA RESPUESTAS DE VENTAS
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

const enviarMensajeTwilio = async (numero, mensaje) => {
  try {
    const to = numero.startsWith('whatsapp:') ? numero : `whatsapp:${numero}`;
    const from = process.env.TWILIO_WHATSAPP_NUMBER;
    const enviado = await twilioClient.messages.create({ from, to, body: mensaje });
    console.log(`📤 Enviado a ${to}: ${mensaje.substring(0, 100)}...`);
    return enviado;
  } catch (error) {
    console.error(`❌ Error enviando a ${numero}:`, error.message);
  }
};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 🧩 Webhook de entrada de mensajes
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
    // Extraer número limpio
    const numero = phone.replace(/^whatsapp:/, '').replace(/\D/g, '');
    console.log(`📱 Número procesado: +${numero} (original: ${phone})`);

    // Buscar cliente basado en el número
    const { data: clienteData, error: clienteError } = await supabase
      .from('clientes')
      .select('id, nombre, numero_whatsapp')
      .eq('numero_whatsapp', `+${numero}`)
      .single();

    if (clienteError && clienteError.code !== 'PGRST116') {
      console.error('❌ Error consultando cliente:', clienteError.message);
    }

    const client_id = clienteData?.id || 1;
    console.log(`👤 Cliente detectado: ID ${client_id} - ${clienteData?.nombre || 'Cliente por defecto'}`);

    // Guardar mensaje en conversations
    const { error } = await supabase.from('conversations').insert([{
      lead_phone: phone,
      last_message: message,
      agent_name: name,
      status: 'New',
      created_at: new Date().toISOString(),
      origen: 'whatsapp',
      procesar: false,
      client_id
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

  console.log(`📨 Procesando ${mensajes.length} mensajes entrantes con OPTIMIZACIÓN DE VENTAS`);

  for (const mensaje of mensajes) {
    const { id, lead_phone, client_id, last_message } = mensaje;
    console.log(`\n📞 Procesando lead ID: ${id} de ${lead_phone}`);
    
    try {
      // Detectar intención del mensaje
      const intencion = detectarIntencionVenta(last_message || '');
      console.log(`🎯 Intención detectada:`, Object.keys(intencion).filter(k => intencion[k]).join(', ') || 'general');

      const messages = await generarHistorialGPT(lead_phone, supabase);
      if (!messages) {
        console.error('❌ No se pudo generar historial para GPT');
        continue;
      }
      // ✅ Marcar como procesado para evitar reprocesamiento
await supabase
  .from('conversations')
  .update({ procesar: true })
  .eq('id', mensaje.id);

console.log(`✅ Mensaje ID ${mensaje.id} marcado como procesado.`);


      console.log('🧠 Enviando a OpenAI con parámetros optimizados...');
      
      const textoAI = await generarRespuestaVentas(messages, intencion);
      console.log(`🎯 Respuesta de AI optimizada: ${textoAI.substring(0, 100)}...`);

      // Validar que la respuesta sea orientada a ventas
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
        client_id: client_id || 1
      }]);

      // Enviar por WhatsApp
      await enviarMensajeTwilio(lead_phone, textoAI);
      
      console.log('✅ Mensaje entrante procesado exitosamente');
      
    } catch (err) {
      console.error(`❌ Error procesando entrada ${lead_phone}:`, err.message);
      
      // Respuesta de fallback orientada a ventas
      if (err.response?.status === 429 || err.response?.status >= 500) {
        console.log('⚠️ Enviando respuesta de fallback orientada a ventas...');
        const fallbackMessage = "¡Hola! Tengo exactamente lo que necesitas. Permíteme llamarte en 5 minutos para darte precios especiales que solo ofrezco por teléfono. ¿Cuál es el mejor número para contactarte?";
        await enviarMensajeTwilio(lead_phone, fallbackMessage);
        await supabase.from('conversations').update({ procesar: true }).eq('id', id);
      }
    }
  }
};

// 🔁 Procesa mensajes salientes desde Unicorn (TAMBIÉN OPTIMIZADO)
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

  console.log(`🤖 Procesando ${pendientes.length} mensajes de Unicorn con OPTIMIZACIÓN`);

  for (const mensaje of pendientes) {
    const { id, lead_phone, client_id, last_message } = mensaje;
    console.log(`\n🔄 Procesando mensaje ID: ${id} para ${lead_phone}`);
    
    try {
      // Detectar intención
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
        client_id: client_id || 1
      }]);

      // Enviar por WhatsApp
      await enviarMensajeTwilio(lead_phone, textoAI);
      
      console.log('✅ Mensaje Unicorn procesado exitosamente');
      
    } catch (err) {
      console.error(`❌ Error procesando unicorn ${lead_phone}:`, err.message);
    }
  }
};

// 🔄 FUNCIÓN PARA ACTUALIZAR TODOS LOS PROMPTS A ORIENTACIÓN DE VENTAS
const actualizarPromptsAVentas = async () => {
  try {
    console.log('🚀 Iniciando actualización masiva de prompts a orientación de ventas...');
    
    // Obtener todos los clientes
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
        
        // Procesar servicios existentes
        let serviciosProcesados = [];
        if (cliente.lista_servicios) {
          try {
            serviciosProcesados = typeof cliente.lista_servicios === 'string' 
              ? JSON.parse(cliente.lista_servicios)
              : cliente.lista_servicios;
          } catch (e) {
            // Si no es JSON, procesar como texto línea por línea
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
        
        // Generar nuevo prompt orientado a ventas
        const nuevoPrompt = generarPromptVentasPersonalizado(cliente, serviciosProcesados);
        
        // Backup del prompt anterior
        const backupPrompt = cliente.prompt_inicial;
        
        // Actualizar en la base de datos
        const { error: updateError } = await supabase
          .from('clientes')
          .update({ 
            prompt_inicial: nuevoPrompt,
            prompt_backup: backupPrompt, // Guardar backup por seguridad
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
        
        // Pequeña pausa para no sobrecargar la BD
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (err) {
        console.error(`❌ Error procesando cliente ${cliente.id}:`, err);
        errores++;
      }
    }
    
    console.log(`\n📊 RESUMEN DE ACTUALIZACIÓN:`);
    console.log(`✅ Clientes actualizados: ${actualizados}`);
    console.log(`❌ Errores: ${errores}`);
    console.log(`📈 Tasa de éxito: ${((actualizados / clientes.length) * 100).toFixed(1)}%`);
    
    // Verificar algunos resultados
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
    
    return { actualizados, errores, total: clientes.length };
    
  } catch (error) {
    console.error('❌ Error general en actualización:', error);
    throw error;
  }
};

app.get('/', (req, res) => {
  res.send('🟢 Unicorn AI backend con OPTIMIZACIONES DE VENTAS - ' + new Date().toISOString());
});

// 🧪 ENDPOINTS DE TESTING OPTIMIZADOS

// Endpoint para testear respuestas optimizadas
app.get('/test-respuesta-ventas/:phone', async (req, res) => {
  try {
    const { phone } = req.params;
    const mensaje = req.query.mensaje || "Hola, ¿cuánto cuesta el servicio?";
    
    console.log(`🧪 Test de respuesta para ${phone} con mensaje: "${mensaje}"`);
    
    // Detectar intención
    const intencion = detectarIntencionVenta(mensaje);
    console.log('🎯 Intención detectada:', Object.keys(intencion).filter(k => intencion[k]));
    
    // Generar historial mock
    const messages = await generarHistorialGPT(`whatsapp:${phone}`, supabase);
    
    if (!messages) {
      return res.json({
        error: 'No se pudo generar historial',
        phone,
        mensaje
      });
    }
    
    // Generar respuesta optimizada
    const respuesta = await generarRespuestaVentas(messages, intencion);
    
    // Análisis de la respuesta
    const analisis = {
      contienePrecios: /\$|\d+|precio|costo/i.test(respuesta),
      creaUrgencia: /urgente|limitado|solo|esta semana|hoy/i.test(respuesta),
      preguntaCierre: /cuando|empezamos|confirmar|reservar/i.test(respuesta),
      manejaObjeciones: /inversion|beneficio|facilidad|pago/i.test(respuesta)
    };
    
    res.json({
      phone,
      mensajeOriginal: mensaje,
      intencionDetectada: intencion,
      respuestaGenerada: respuesta,
      analisisVentas: analisis,
      esOrientadaVentas: Object.values(analisis).some(v => v),
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error en test de respuesta:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para actualizar prompts masivamente
app.post('/actualizar-prompts-ventas', async (req, res) => {
  try {
    console.log('🚀 Iniciando actualización masiva desde endpoint...');
    const resultado = await actualizarPromptsAVentas();
    res.json({
      success: true,
      mensaje: 'Actualización completada',
      ...resultado,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error en actualización masiva:', error.message);
    res.status(500).json({ 
      error: error.message,
      success: false,
      timestamp: new Date().toISOString()
    });
  }
});

// Endpoint para testear un cliente específico
app.get('/test-cliente-ventas/:clienteId', async (req, res) => {
  try {
    const { clienteId } = req.params;
    
    // Obtener cliente
    const { data: cliente, error } = await supabase
      .from('clientes')
      .select('*')
      .eq('id', clienteId)
      .single();
    
    if (error) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    
    // Procesar servicios
    let servicios = [];
    if (cliente.lista_servicios) {
      try {
        servicios = typeof cliente.lista_servicios === 'string' 
          ? JSON.parse(cliente.lista_servicios)
          : cliente.lista_servicios;
      } catch (e) {
        servicios = [];
      }
    }
    
    // Generar prompt de ventas
    const promptVentas = generarPromptVentasPersonalizado(cliente, servicios);
    const industria = detectarIndustria(cliente.nombre, servicios);
    
    // Análisis del prompt actual
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
      promptActual: promptActual.substring(0, 500) + '...',
      promptVentasGenerado: promptVentas.substring(0, 500) + '...',
      analisisPromptActual: analisisActual,
      necesitaActualizacion: !Object.values(analisisActual).every(v => v),
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error testeando cliente:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para stats de conversaciones (últimas 24 horas)
app.get('/stats-ventas', async (req, res) => {
  try {
    const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: stats, error } = await supabase
      .from('conversations')
      .select('status, origen, created_at')
      .gte('created_at', desde);

    if (error) {
      throw error;
    }

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
if (process.env.POLLING_ACTIVO === 'true') {
  console.log('🔁 Polling activo cada 10s');
  setInterval(procesarMensajesDesdeUnicorn, 10000);
  setInterval(responderMensajesEntrantesOptimizado, 10000);
} else {
  console.log('⏸️ Polling desactivado (.env)');
}

// 🚀 Inicio del servidor
app.listen(port, () => {
  console.log(`🟢 Servidor corriendo en puerto ${port}`);
});

