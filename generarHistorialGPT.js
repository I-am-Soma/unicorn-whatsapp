const generarHistorialGPT = async (leadPhone, supabase) => {
  try {
    console.log(`🔍 Generando historial para: ${leadPhone}`);

    const baseNumero = leadPhone.replace(/^whatsapp:/, '').replace(/\D/g, '');
    console.log(`📱 Número base extraído: ${baseNumero}`);

    const numeroConFormato = `+${baseNumero}`;
    
    // 🔥 CAMBIO 1: Buscar cliente por número de WhatsApp
    const { data: clienteMatch, error: clienteError } = await supabase
      .from('clientes')
      .select('id, prompt_inicial, lista_servicios, nombre, numero_whatsapp')
      const generarHistorialGPT = async (leadPhone, supabase, client_id) => {
  try {
    console.log(`🔍 Generando historial para: ${leadPhone}`);
    console.log(`👤 Client ID recibido: ${client_id}`);

    if (!client_id) {
      console.error('❌ Conversation sin client_id, abortando');
      return null;
    }

    const baseNumero = leadPhone.replace(/^whatsapp:/, '').replace(/\D/g, '');

    // 🔥 CLIENTE SIEMPRE POR ID
    const { data: clienteMatch, error: clienteError } = await supabase
      .from('clientes')
      .select('id, prompt_inicial, lista_servicios, nombre')
      .eq('id', client_id)
      .single();

    if (clienteError || !clienteMatch) {
      console.error('❌ No se encontró cliente por client_id:', client_id);
      return null;
    }

    // Historial SOLO por client_id
    const { data: todos, error } = await supabase
      .from('conversations')
      .select('last_message, created_at, origen, lead_phone, agent_name')
      .eq('client_id', client_id)
      .order('created_at', { ascending: true })
      .limit(200);

    if (error || !todos) return null;

    const mensajes = todos.filter(m =>
      m.lead_phone && m.lead_phone.replace(/\D/g, '').includes(baseNumero)
    );

    // Prompt base
    let promptSistema = clienteMatch.prompt_inicial?.trim()
      || `Eres un asistente comercial de ${clienteMatch.nombre}.`;

    const messages = [{ role: 'system', content: promptSistema }];

    mensajes.slice(-6).forEach(msg => {
      if (!msg.last_message) return;
      const esBot = msg.origen === 'unicorn' || msg.agent_name === 'Unicorn AI';
      messages.push({
        role: esBot ? 'assistant' : 'user',
        content: msg.last_message.slice(0, 500)
      });
    });

    return messages;

  } catch (err) {
    console.error('❌ Error generando historial:', err.message);
    return null;
  }
};
      .single();

    if (clienteError && clienteError.code !== 'PGRST116') {
      console.error('❌ Error consultando cliente:', clienteError.message);
    }

    // 🔥 CAMBIO 2: NO usar fallback - debe ser el cliente específico
    if (!clienteMatch) {
      console.error('❌ No se encontró cliente para el número:', numeroConFormato);
      return null;
    }

    const client_id = clienteMatch.id;
    console.log(`👤 Client ID detectado: ${client_id} (${clienteMatch.nombre})`);

    // 🔥 CAMBIO 3: Filtrar conversaciones POR CLIENT_ID específico
    const { data: todos, error } = await supabase
      .from('conversations')
      .select('last_message, created_at, origen, client_id, lead_phone, agent_name')
      .eq('client_id', client_id) // <- FILTRAR POR CLIENTE ESPECÍFICO
      .order('created_at', { ascending: true })
      .limit(200);

    if (error || !todos) {
      console.error('❌ Error al consultar historial:', error?.message);
      return null;
    }

    // Filtrar mensajes para este lead específico
    const mensajes = todos.filter(m =>
      m.lead_phone && m.lead_phone.replace(/\D/g, '').includes(baseNumero)
    );

    console.log(`💬 Mensajes encontrados en historial: ${mensajes.length}`);

    // 🔥 CAMBIO 4: Usar datos del cliente encontrado directamente
    const promptBase = clienteMatch.prompt_inicial?.trim();
    const servicios = clienteMatch.lista_servicios?.trim();
    const nombreCliente = clienteMatch.nombre?.trim();

    console.log(`📝 Prompt inicial encontrado: ${promptBase ? 'SÍ' : 'NO'}`);
    console.log(`🛍️ Servicios encontrados: ${servicios ? 'SÍ' : 'NO'}`);
    console.log(`🏢 Nombre cliente: ${nombreCliente}`);

    let serviciosProcesados = [];
    if (servicios) {
      try {
        const serviciosArray = typeof servicios === 'string' ? JSON.parse(servicios) : servicios;
        serviciosProcesados = Array.isArray(serviciosArray) ? serviciosArray : [];
      } catch (e) {
        // Si no es JSON, procesar como texto plano
        serviciosProcesados = servicios
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

    console.log(`💰 Servicios procesados: ${serviciosProcesados.length}`);

    // Analizar el último mensaje del usuario
    const ultimoMensajeUsuario = mensajes
      .filter(m => m.origen !== 'unicorn' && m.agent_name !== 'Unicorn AI')
      .pop()?.last_message?.toLowerCase() || '';

    const esPreguntaPrecio = /cuanto|cuesta|precio|cost|dollar|peso|barato|caro|vale/.test(ultimoMensajeUsuario);
    const esPreguntaServicios = /servicio|que hac|ofrec|tratamiento|procedimiento/.test(ultimoMensajeUsuario);
    const esObjecion = /caro|expensive|mucho|pensarlo|despues|luego|maybe/.test(ultimoMensajeUsuario);
    const esInteresPorUno = serviciosProcesados.some(s =>
      ultimoMensajeUsuario.includes(s.nombre.toLowerCase().substring(0, 5))
    );

    console.log(`🎯 Análisis del mensaje: precio=${esPreguntaPrecio}, servicios=${esPreguntaServicios}, objeción=${esObjecion}, interés=${esInteresPorUno}`);

    // 🔥 CAMBIO 5: Usar el prompt inicial del cliente DIRECTAMENTE
    let promptSistema = promptBase || `Eres un asistente comercial de ${nombreCliente || 'nuestra empresa'}.`;

    // Si hay servicios, agregarlos al final del prompt
    if (serviciosProcesados.length > 0) {
      promptSistema += `\n\nServicios disponibles:\n`;
      serviciosProcesados.forEach(servicio => {
        promptSistema += `• ${servicio.nombre}`;
        if (servicio.precio) {
          promptSistema += ` - $${servicio.precio}`;
        }
        promptSistema += `\n`;
      });
    }

    // Lógica de historial
    const fechaPrimerMensaje = mensajes.length > 0 ? new Date(mensajes[0].created_at) : new Date();
    const diasDesdePrimerMensaje = (Date.now() - fechaPrimerMensaje.getTime()) / (1000 * 60 * 60 * 24);
    const usarHistorial = diasDesdePrimerMensaje <= 3;

    console.log(`📅 Días desde primer mensaje: ${diasDesdePrimerMensaje.toFixed(1)}`);
    console.log(`🔄 Usar historial: ${usarHistorial}`);

    const hayMensajesUsuario = mensajes.some(m =>
      m.origen !== 'unicorn' &&
      m.agent_name !== 'Unicorn AI' &&
      m.agent_name !== 'bot'
    );

    console.log(`👤 Hay mensajes del usuario: ${hayMensajesUsuario}`);

    const messages = [
      { role: 'system', content: promptSistema }
    ];

    // 🔥 CAMBIO 6: Controlar mejor el flujo de mensajes
    if (hayMensajesUsuario && usarHistorial) {
      const mensajesRecientes = mensajes.slice(-6); // Reducir a 6 mensajes recientes
      mensajesRecientes.forEach(msg => {
        if (msg.last_message && msg.last_message.trim()) {
          const esBot = msg.origen === 'unicorn' ||
                        msg.agent_name === 'Unicorn AI' ||
                        msg.agent_name === 'bot';
          messages.push({
            role: esBot ? 'assistant' : 'user',
            content: msg.last_message.slice(0, 500) // Aumentar límite de caracteres
          });
        }
      });
    } else {
      // Si no hay historial reciente, solo agregar el último mensaje del usuario
      const ultimoMensaje = mensajes
        .filter(m => m.origen !== 'unicorn' && m.agent_name !== 'Unicorn AI')
        .pop();
      
      if (ultimoMensaje && ultimoMensaje.last_message) {
        messages.push({
          role: 'user',
          content: ultimoMensaje.last_message
        });
      }
    }

    console.log(`📤 Mensajes enviados a GPT: ${messages.length}`);

    // 🔥 CAMBIO 7: Determinar tipo de respuesta esperada
    let tipoRespuesta = 'INFORMATIVA';
    if (esPreguntaPrecio) tipoRespuesta = 'PRECIO';
    else if (esPreguntaServicios) tipoRespuesta = 'SERVICIOS';
    else if (esObjecion) tipoRespuesta = 'OBJECION';
    else if (esInteresPorUno) tipoRespuesta = 'SERVICIO_ESPECIFICO';
    else tipoRespuesta = 'VENTA_GENERAL';

    console.log(`🎯 Tipo de respuesta esperada: ${tipoRespuesta}`);

    return messages;
  } catch (err) {
    console.error('❌ Error generando historial para GPT:', err.message);
    console.error('Stack trace:', err.stack);
    return null;
  }
};

module.exports = { generarHistorialGPT };
