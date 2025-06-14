const generarHistorialGPT = async (leadPhone, supabase) => {
  try {
    console.log(`🔍 Generando historial para: ${leadPhone}`);
    
    const baseNumero = leadPhone.replace(/^whatsapp:/, '').replace(/\D/g, '');
    console.log(`📱 Número base extraído: ${baseNumero}`);
    
    // Obtener cliente basado en el número
    const numeroConFormato = `+${baseNumero}`;
    const { data: clienteMatch, error: clienteError } = await supabase
      .from('clientes')
      .select('id, prompt_inicial, lista_servicios, nombre, numero_whatsapp')
      .eq('numero_whatsapp', numeroConFormato)
      .single();

    if (clienteError && clienteError.code !== 'PGRST116') {
      console.error('❌ Error consultando cliente:', clienteError.message);
    }

    const cliente_id = clienteMatch?.id || 1;
    console.log(`👤 Cliente ID detectado: ${cliente_id} (${clienteMatch?.nombre || 'Cliente por defecto'})`);

    // ✅ CORRECCIÓN 1: Filtro más preciso para el historial
    const { data: todos, error } = await supabase
      .from('conversations')
      .select('last_message, created_at, origen, cliente_id, lead_phone, agent_name')
      .eq('lead_phone', leadPhone) // ✅ Buscar por teléfono exacto
      .order('created_at', { ascending: true })
      .limit(50); // ✅ Reducir límite para mejor contexto

    if (error || !todos) {
      console.error('❌ Error al consultar historial:', error?.message);
      return null;
    }

    console.log(`💬 Mensajes encontrados en historial: ${todos.length}`);

    // Obtener configuración del cliente
    const { data: cliente, error: errorCliente } = await supabase
      .from('clientes')
      .select('prompt_inicial, lista_servicios, nombre')
      .eq('id', cliente_id)
      .single();

    if (errorCliente) {
      console.error('❌ Error consultando configuración del cliente:', errorCliente.message);
    }

    // Preparar datos del cliente
    const promptBase = cliente?.prompt_inicial?.trim();
    const servicios = cliente?.lista_servicios?.trim();
    const nombreCliente = cliente?.nombre?.trim();

    console.log(`📝 Prompt inicial encontrado: ${promptBase ? 'SÍ' : 'NO'}`);
    console.log(`🛍️ Servicios encontrados: ${servicios ? 'SÍ' : 'NO'}`);
    console.log(`🏢 Nombre cliente: ${nombreCliente || 'No definido'}`);

    // PROCESAMIENTO INTELIGENTE DE SERVICIOS
    let serviciosProcesados = [];
    if (servicios) {
      try {
        const serviciosArray = typeof servicios === 'string' ? JSON.parse(servicios) : servicios;
        serviciosProcesados = Array.isArray(serviciosArray) ? serviciosArray : [];
      } catch (e) {
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

    // ✅ CORRECCIÓN 2: Separar mensajes de usuario vs bot correctamente
    const mensajesUsuario = todos.filter(m => 
      m.origen !== 'unicorn' && 
      m.agent_name !== 'Unicorn AI' && 
      m.agent_name !== 'bot'
    );
    
    const mensajesBot = todos.filter(m => 
      m.origen === 'unicorn' || 
      m.agent_name === 'Unicorn AI' || 
      m.agent_name === 'bot'
    );

    console.log(`👤 Mensajes de usuario: ${mensajesUsuario.length}`);
    console.log(`🤖 Mensajes de bot: ${mensajesBot.length}`);

    // ANALIZAR EL ÚLTIMO MENSAJE DEL USUARIO
    const ultimoMensajeUsuario = mensajesUsuario.length > 0 
      ? mensajesUsuario[mensajesUsuario.length - 1].last_message?.toLowerCase() || ''
      : '';

    const esPreguntaPrecio = /cuanto|cuesta|precio|cost|dollar|peso|barato|caro|vale/.test(ultimoMensajeUsuario);
    const esPreguntaServicios = /servicio|que hac|ofrec|tratamiento|procedimiento/.test(ultimoMensajeUsuario);
    const esObjecion = /caro|expensive|mucho|pensarlo|despues|luego|maybe/.test(ultimoMensajeUsuario);
    const esInteresPorUno = serviciosProcesados.some(s => 
      ultimoMensajeUsuario.includes(s.nombre.toLowerCase().substring(0, 5))
    );

    console.log(`🎯 Análisis del mensaje: precio=${esPreguntaPrecio}, servicios=${esPreguntaServicios}, objeción=${esObjecion}, interés=${esInteresPorUno}`);

    // ✅ CORRECCIÓN 3: Usar prompt del cliente directamente si existe
    let promptSistema;
    if (promptBase && promptBase.length > 100) {
      // Si el cliente ya tiene un prompt personalizado, usarlo
      promptSistema = promptBase;
      console.log('✅ Usando prompt personalizado del cliente');
    } else {
      // Crear prompt de ventas por defecto
      promptSistema = `Eres ${nombreCliente ? `el asistente comercial de ${nombreCliente}` : 'un experto asistente comercial'}. 

🎯 TU OBJETIVO: Convertir cada conversación en una VENTA. No solo informar, sino VENDER.

🔥 ESTRATEGIA DE VENTAS:
1. CALIFICAR: Identificar necesidad específica y urgencia
2. PRESENTAR: Servicio exacto + precio + beneficios concretos
3. CREAR URGENCIA: Escasez, tiempo limitado, ofertas especiales
4. MANEJAR OBJECIONES: Respuestas preparadas para "es caro", "lo pensaré", etc.
5. CERRAR: Preguntas directas que faciliten la decisión

📋 SERVICIOS DISPONIBLES:`;

      if (serviciosProcesados.length > 0) {
        serviciosProcesados.forEach(servicio => {
          promptSistema += `\n• ${servicio.nombre}`;
          if (servicio.precio) {
            promptSistema += ` - $${servicio.precio}`;
          }
        });
      }

      promptSistema += `\n\n💪 REGLAS DE RESPUESTA:
- SIEMPRE menciona precios específicos cuando pregunten por costos
- USA urgencia: "Solo disponible esta semana", "Últimos 3 espacios"
- HAZ preguntas que lleven al cierre: "¿Cuándo te gustaría empezar?"
- MANEJA objeciones con valor: Si dicen "es caro" → explica beneficios
- SÉ directo y confiado, no tímido ni genérico`;
    }

    // ✅ CORRECCIÓN 4: Construcción limpia de mensajes
    const messages = [
      {
        role: 'system',
        content: promptSistema
      }
    ];

    // ✅ CORRECCIÓN 5: Solo agregar historial real si existe
    if (todos.length > 0) {
      // Tomar los últimos 10 mensajes para contexto
      const mensajesRecientes = todos.slice(-10);
      
      mensajesRecientes.forEach(msg => {
        if (msg.last_message && msg.last_message.trim()) {
          const esBot = msg.origen === 'unicorn' || 
                       msg.agent_name === 'Unicorn AI' || 
                       msg.agent_name === 'bot';
          
          messages.push({
            role: esBot ? 'assistant' : 'user',
            content: msg.last_message.slice(0, 300)
          });
        }
      });
    }

    console.log(`📤 Mensajes enviados a GPT: ${messages.length}`);
    console.log(`🎯 Primer usuario: ${mensajesUsuario.length === 0 ? 'SÍ' : 'NO'}`);
    
    return messages;
    
  } catch (err) {
    console.error('❌ Error generando historial para GPT:', err.message);
    console.error('Stack trace:', err.stack);
    return null;
  }
};

module.exports = { generarHistorialGPT };
