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

    const cliente_id = clienteData?.id || 1;
    console.log(`👤 Cliente detectado: ID ${cliente_id} - ${clienteData?.nombre || 'Cliente por defecto'}`);

    // Guardar mensaje en conversations
    const { error } = await supabase.from('conversations').insert([{
      lead_phone: phone,
      last_message: message,
      agent_name: name,
      status: 'New',
      created_at: new Date().toISOString(),
      origen: 'whatsapp',
      procesar: false,
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
    console.error('Stack trace:', err.stack);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// 🔁 Procesa mensajes salientes desde Unicorn
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

  console.log(`🤖 Procesando ${pendientes.length} mensajes de Unicorn`);

  for (const mensaje of pendientes) {
    const { id, lead_phone, cliente_id } = mensaje;
    console.log(`\n🔄 Procesando mensaje ID: ${id} para ${lead_phone}`);
    
    try {
      const messages = await generarHistorialGPT(lead_phone, supabase);
      if (!messages) {
        console.error('❌ No se pudo generar historial para GPT');
        continue;
      }

      console.log('🧠 Enviando a OpenAI...');
      
      const aiResponse = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        { 
          model: 'gpt-3.5-turbo', 
          messages,
          max_tokens: 150,
temperature: 0.7,
presence_penalty: 0.6,
frequency_penalty: 0.3
        },
        { 
          headers: { 
            'Content-Type': 'application/json', 
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` 
          } 
        }
      );

      const textoAI = aiResponse.data.choices[0].message.content.trim();
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
        cliente_id: cliente_id || 1
      }]);

      // Enviar por WhatsApp
      await enviarMensajeTwilio(lead_phone, textoAI);
      
      console.log('✅ Mensaje Unicorn procesado exitosamente');
      
    } catch (err) {
      console.error(`❌ Error procesando unicorn ${lead_phone}:`, err.message);
      console.error('Stack trace:', err.stack);
    }
  }
};

// 🔁 Responde automáticamente entradas de leads
const responderMensajesEntrantes = async () => {
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

  console.log(`📨 Procesando ${mensajes.length} mensajes entrantes`);

  for (const mensaje of mensajes) {
    const { id, lead_phone, cliente_id } = mensaje;
    console.log(`\n📞 Procesando lead ID: ${id} de ${lead_phone}`);
    
    try {
      const messages = await generarHistorialGPT(lead_phone, supabase);
      if (!messages) {
        console.error('❌ No se pudo generar historial para GPT');
        continue;
      }

      console.log('🧠 Enviando a OpenAI...');
      
      const aiResponse = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        { 
          model: 'gpt-3.5-turbo', 
          messages,
          max_tokens: 500,
          temperature: 0.7
        },
        { 
          headers: { 
            'Content-Type': 'application/json', 
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` 
          } 
        }
      );

      const textoAI = aiResponse.data.choices[0].message.content.trim();
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
        cliente_id: cliente_id || 1
      }]);

      // Enviar por WhatsApp
      await enviarMensajeTwilio(lead_phone, textoAI);
      
      console.log('✅ Mensaje entrante procesado exitosamente');
      
    } catch (err) {
      console.error(`❌ Error procesando entrada ${lead_phone}:`, err.message);
      console.error('Stack trace:', err.stack);
      
      // Si hay error con OpenAI, enviar respuesta genérica
      if (err.response?.status === 429 || err.response?.status >= 500) {
        console.log('⚠️ Enviando respuesta de fallback...');
        const fallbackMessage = "Gracias por tu mensaje. En breve un miembro de nuestro equipo se pondrá en contacto contigo.";
        await enviarMensajeTwilio(lead_phone, fallbackMessage);
        await supabase.from('conversations').update({ procesar: true }).eq('id', id);
      }
    }
  }
};

app.get('/', (req, res) => {
  res.send('🟢 Unicorn AI backend escuchando - ' + new Date().toISOString());
});

// Endpoint para testing manual
// Agregar estos endpoints a tu server.js principal

// Endpoint para testear prompts específicos
app.get('/test-prompt/:phone', async (req, res) => {
    try {
        const { phone } = req.params;
        const mensaje = req.query.mensaje || "Hola, necesito información sobre sus servicios";
        
        console.log(`🧪 [TEST] Testing prompt para: ${phone}`);
        
        // Generar prompt
        const { generarHistorialGPT } = require('./generarHistorialGPT');
        const prompt = await generarHistorialGPT(phone, mensaje);
        
        if (!prompt) {
            return res.status(404).json({
                error: 'No se pudo generar prompt',
                phone: phone
            });
        }
        
        // Enviar a OpenAI para test
        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: prompt,
            max_tokens: 300,
            temperature: 0.7
        });
        
        const respuestaGPT = response.choices[0].message.content;
        
        res.json({
            success: true,
            phone: phone,
            mensaje_enviado: mensaje,
            prompt_sistema: prompt[0].content.substring(0, 500) + '...',
            respuesta_gpt: respuestaGPT,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ [TEST] Error en test-prompt:', error);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint para verificar configuración de cliente
app.get('/debug-cliente/:phone', async (req, res) => {
    try {
        const { phone } = req.params;
        
        // Normalizar número
        const numeroNormalizado = phone.startsWith('+') ? phone : `+${phone}`;
        
        // Buscar cliente
        const { data: cliente, error } = await supabase
            .from('clientes')
            .select('*')
            .eq('numero_whatsapp', numeroNormalizado)
            .single();
        
        if (error) {
            return res.status(404).json({
                error: 'Cliente no encontrado',
                phone: numeroNormalizado,
                supabase_error: error.message
            });
        }
        
        // Procesar servicios
        let servicios = [];
        try {
            servicios = typeof cliente.lista_servicios === 'string' 
                ? JSON.parse(cliente.lista_servicios)
                : cliente.lista_servicios || [];
        } catch (e) {
            servicios = [];
        }
        
        res.json({
            cliente_encontrado: true,
            datos_cliente: {
                id: cliente.id,
                nombre: cliente.nombre,
                numero_whatsapp: cliente.numero_whatsapp,
                prompt_inicial_length: cliente.prompt_inicial?.length || 0,
                prompt_preview: cliente.prompt_inicial?.substring(0, 200) + '...',
                servicios_count: servicios.length,
                servicios: servicios.map(s => ({
                    nombre: s.nombre || s.name,
                    precio: s.precio || s.price,
                    descripcion: s.descripcion || s.description
                }))
            },
            debug_info: {
                numero_buscado: numeroNormalizado,
                timestamp: new Date().toISOString()
            }
        });
        
    } catch (error) {
        console.error('❌ [DEBUG] Error en debug-cliente:', error);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint para simular conversación completa
app.post('/simulate-conversation', async (req, res) => {
    try {
        const { phone, mensajes } = req.body;
        
        if (!phone || !mensajes || !Array.isArray(mensajes)) {
            return res.status(400).json({
                error: 'Se requiere phone y mensajes (array)'
            });
        }
        
        const resultados = [];
        
        for (let i = 0; i < mensajes.length; i++) {
            const mensaje = mensajes[i];
            
            // Generar respuesta
            const { generarHistorialGPT } = require('./generarHistorialGPT');
            const prompt = await generarHistorialGPT(phone, mensaje);
            
            if (prompt) {
                const response = await openai.chat.completions.create({
                    model: "gpt-3.5-turbo",
                    messages: prompt,
                    max_tokens: 300,
                    temperature: 0.7
                });
                
                const respuesta = response.choices[0].message.content;
                
                // Guardar en BD simulada (opcional)
                await supabase
                    .from('conversations')
                    .insert({
                        lead_phone: phone,
                        last_message: respuesta,
                        origen: 'bot',
                        procesar: true,
                        agent_name: 'simulation',
                        status: 'active'
                    });
                
                resultados.push({
                    mensaje_usuario: mensaje,
                    respuesta_bot: respuesta,
                    paso: i + 1
                });
            }
        }
        
        res.json({
            success: true,
            phone: phone,
            conversacion: resultados,
            total_intercambios: resultados.length
        });
        
    } catch (error) {
        console.error('❌ [SIM] Error en simulate-conversation:', error);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint para verificar formato de números en BD
app.get('/check-numbers-format', async (req, res) => {
    try {
        const { data: clientes, error } = await supabase
            .from('clientes')
            .select('id, nombre, numero_whatsapp');
        
        if (error) throw error;
        
        const analisis = clientes.map(cliente => ({
            id: cliente.id,
            nombre: cliente.nombre,
            numero_original: cliente.numero_whatsapp,
            formato_correcto: cliente.numero_whatsapp?.startsWith('+'),
            sugerido: cliente.numero_whatsapp?.startsWith('+') 
                ? cliente.numero_whatsapp 
                : '+' + cliente.numero_whatsapp
        }));
        
        const problemasFormato = analisis.filter(c => !c.formato_correcto);
        
        res.json({
            total_clientes: clientes.length,
            clientes_con_formato_correcto: analisis.length - problemasFormato.length,
            clientes_con_problemas: problemasFormato.length,
            detalles: analisis,
            problemas: problemasFormato
        });
        
    } catch (error) {
        console.error('❌ [CHECK] Error verificando formatos:', error);
        res.status(500).json({ error: error.message });
    }
});
// 🔁 Activar polling
if (process.env.POLLING_ACTIVO === 'true') {
  console.log('🔁 Polling activo cada 10s');
  setInterval(procesarMensajesDesdeUnicorn, 10000);
  setInterval(responderMensajesEntrantes, 12000); // Ligeramente desfasado para evitar conflictos
} else {
  console.log('⏸️ Polling desactivado (.env)');
}

app.listen(port, () => {
  console.log(`🟢 Servidor corriendo en puerto ${port} - ${new Date().toISOString()}`);
});
