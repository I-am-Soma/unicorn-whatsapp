const generarHistorialGPT = async (leadPhone, supabase) => {
  try {
    console.log(`🔍 Generando historial para: ${leadPhone}`);
    
    const baseNumero = leadPhone.replace(/^whatsapp:/, '').replace(/\D/g, '');
    console.log(`📱 Número base extraído: ${baseNumero}`);
    
    // Primero obtener el cliente_id basado en el número
    const numeroConFormato = `+${baseNumero}`;
    const { data: clienteMatch, error: clienteError } = await supabase
      .from('clientes')
      .select('id, prompt_inicial, lista_servicios, nombre, numero_whatsapp')
      .eq('numero_whatsapp', numeroConFormato)
      .single();

    if (clienteError && clienteError.code !== 'PGRST116') { // PGRST116 = no rows found
      console.error('❌ Error consultando cliente:', clienteError.message);
    }

    const cliente_id = clienteMatch?.id || 1;
    console.log(`👤 Cliente ID detectado: ${cliente_id} (${clienteMatch?.nombre || 'Cliente por defecto'})`);

    // Obtener historial de conversaciones
    const { data: todos, error } = await supabase
      .from('conversations')
      .select('last_message, created_at, origen, cliente_id, lead_phone, agent_name')
      .order('created_at', { ascending: true })
      .limit(200);

    if (error || !todos) {
      console.error('❌ Error al consultar historial:', error?.message);
      return null;
    }

    // Filtrar mensajes que coincidan con este número de teléfono
    const mensajes = todos.filter(m =>
      m.lead_phone && m.lead_phone.replace(/\D/g, '').includes(baseNumero)
    );

    console.log(`💬 Mensajes encontrados en historial: ${mensajes.length}`);

    // Obtener configuración del cliente (usar el cliente detectado, no el del primer mensaje)
    const { data: cliente, error: errorCliente } = await supabase
      .from('clientes')
      .select('prompt_inicial, lista_servicios, nombre')
      .eq('id', cliente_id)
      .single();

    if (errorCliente) {
      console.error('❌ Error consultando configuración del cliente:', errorCliente.message);
    }

    // Validar y preparar el prompt
    const promptBase = cliente?.prompt_inicial?.trim();
    const servicios = cliente?.lista_servicios?.trim();
    const nombreCliente = cliente?.nombre?.trim();

    console.log(`📝 Prompt inicial encontrado: ${promptBase ? 'SÍ' : 'NO'}`);
    console.log(`🛍️ Servicios encontrados: ${servicios ? 'SÍ' : 'NO'}`);
    console.log(`🏢 Nombre cliente: ${nombreCliente || 'No definido'}`);

    // Si no hay prompt personalizado, usar uno por defecto pero INFORMATIVO
    const promptFinal = promptBase || 
      `Eres un asistente comercial profesional${nombreCliente ? ` de ${nombreCliente}` : ''}. Responde de manera amable y profesional, ofreciendo ayuda y servicios según lo que el cliente necesite.`;

    // Preparar lista de servicios formateada
    let serviciosFormateados = '';
    if (servicios) {
      serviciosFormateados = servicios
        .split('\n')
        .filter(linea => linea.trim())
        .map(linea => `• ${linea.trim()}`)
        .join('\n');
    }

    // Determinar si usar historial (no más de 7 días)
    const fechaPrimerMensaje = mensajes.length > 0 ? new Date(mensajes[0].created_at) : new Date();
    const diasDesdePrimerMensaje = (Date.now() - fechaPrimerMensaje.getTime()) / (1000 * 60 * 60 * 24);
    const ignorarHistorial = diasDesdePrimerMensaje > 7;
    
    console.log(`📅 Días desde primer mensaje: ${diasDesdePrimerMensaje.toFixed(1)}`);
    console.log(`🔄 Usar historial: ${!ignorarHistorial}`);

    // Verificar si hay mensajes del usuario (no solo del bot)
    const hayMensajesUsuario = mensajes.some(m => 
      m.origen !== 'unicorn' && 
      m.agent_name !== 'Unicorn AI' && 
      m.agent_name !== 'bot'
    );

    console.log(`👤 Hay mensajes del usuario: ${hayMensajesUsuario}`);

    // Construir el contexto del sistema
    let contextoPrincipal = promptFinal;
    
    if (serviciosFormateados) {
      contextoPrincipal += `\n\nServicios disponibles:\n${serviciosFormateados}`;
    }

    // Construir mensajes para GPT
    const messages = [
      {
        role: 'system',
        content: contextoPrincipal
      }
    ];

    // Si es primera interacción o no hay historial válido, agregar mensaje de bienvenida
    if (!hayMensajesUsuario || ignorarHistorial) {
      let mensajeBienvenida = `Hola 👋`;
      
      if (nombreCliente) {
        mensajeBienvenida += `, soy parte del equipo de ${nombreCliente}`;
      }
      
      if (serviciosFormateados) {
        mensajeBienvenida += `.\n\nEstos son algunos de nuestros servicios:\n${serviciosFormateados}\n\n¿Hay alguno que te interese o en qué puedo ayudarte?`;
      } else {
        mensajeBienvenida += `. ¿En qué puedo ayudarte hoy?`;
      }

      messages.push({
        role: 'assistant',
        content: mensajeBienvenida
      });
    }

    // Agregar historial si existe y es válido
    if (hayMensajesUsuario && !ignorarHistorial) {
      // Tomar los últimos 10 mensajes para no sobrecargar el contexto
      const mensajesRecientes = mensajes.slice(-10);
      
      mensajesRecientes.forEach(msg => {
        if (msg.last_message && msg.last_message.trim()) {
          const esBot = msg.origen === 'unicorn' || 
                       msg.agent_name === 'Unicorn AI' || 
                       msg.agent_name === 'bot';
          
          messages.push({
            role: esBot ? 'assistant' : 'user',
            content: msg.last_message.slice(0, 500) // Limitar longitud
          });
        }
      });
    }

    console.log(`📤 Mensajes enviados a GPT: ${messages.length}`);
    console.log(`🎯 Prompt del sistema: ${contextoPrincipal.substring(0, 100)}...`);
    
    return messages;
    
  } catch (err) {
    console.error('❌ Error generando historial para GPT:', err.message);
    console.error('Stack trace:', err.stack);
    return null;
  }
};

module.exports = { generarHistorialGPT };
