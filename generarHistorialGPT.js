const generarHistorialGPT = async (leadPhone, supabase) => {
  try {
    console.log(`🔍 Generando historial para: ${leadPhone}`);

    const baseNumero = leadPhone.replace(/^whatsapp:/, '').replace(/\D/g, '');
    console.log(`📱 Número base extraído: ${baseNumero}`);

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

    const { data: todos, error } = await supabase
      .from('conversations')
      .select('last_message, created_at, origen, cliente_id, lead_phone, agent_name')
      .eq('lead_phone', leadPhone)
      .order('created_at', { ascending: true })
      .limit(50);

    if (error || !todos) {
      console.error('❌ Error al consultar historial:', error?.message);
      return null;
    }

    console.log(`💬 Mensajes encontrados en historial: ${todos.length}`);

    let { data: cliente, error: errorCliente } = await supabase
      .from('clientes')
      .select('prompt_inicial, lista_servicios, nombre')
      .eq('id', cliente_id)
      .single();

    let clienteData = cliente;

    if (errorCliente || !clienteData) {
      console.warn("⚠️ Cliente no encontrado o error. Usando configuración por defecto.");
      clienteData = {
        nombre: "Cliente por defecto",
        prompt_inicial: null,
        lista_servicios: null
      };
    }

    const promptBase = clienteData.prompt_inicial?.trim();
    const servicios = clienteData.lista_servicios?.trim();
    const nombreCliente = clienteData.nombre?.trim();

    console.log(`📝 Prompt inicial encontrado: ${promptBase ? 'SÍ' : 'NO'}`);
    console.log(`💍 Servicios encontrados: ${servicios ? 'SÍ' : 'NO'}`);
    console.log(`🏢 Nombre cliente: ${nombreCliente || 'No definido'}`);

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

    const ultimoMensajeUsuario = mensajesUsuario.length > 0 
      ? mensajesUsuario[mensajesUsuario.length - 1].last_message?.toLowerCase() || ''
      : '';

    const esPreguntaPrecio = /cuanto|cuesta|precio|cost|dollar|peso|barato|caro|vale/.test(ultimoMensajeUsuario);
    const esPreguntaServicios = /servicio|que hac|ofrec|tratamiento|procedimiento/.test(ultimoMensajeUsuario);
    const esObjecion = /caro|expensive|mucho|pensarlo|despues|luego|maybe/.test(ultimoMensajeUsuario);
    const esInteresPorUno = serviciosProcesados.some(s => 
      ultimoMensajeUsuario.includes(s.nombre.toLowerCase().substring(0, 5))
    );

    console.log(`🌟 Análisis del mensaje: precio=${esPreguntaPrecio}, servicios=${esPreguntaServicios}, objeción=${esObjecion}, interés=${esInteresPorUno}`);

    let promptSistema;
    if (promptBase && promptBase.length > 100) {
      promptSistema = promptBase;
      console.log('✅ Usando prompt personalizado del cliente');
    } else {
      promptSistema = `Eres ${nombreCliente ? `el asistente comercial de ${nombreCliente}` : 'un experto asistente comercial'}. \n\n🎯 TU OBJETIVO: Convertir cada conversación en una VENTA. No solo informar, sino VENDER.\n\n🔥 ESTRATEGIA DE VENTAS:\n1. CALIFICAR: Identificar necesidad específica y urgencia\n2. PRESENTAR: Servicio exacto + precio + beneficios concretos\n3. CREAR URGENCIA: Escasez, tiempo limitado, ofertas especiales\n4. MANEJAR OBJECIONES: Respuestas preparadas para \"es caro\", \"lo pensaré\", etc.\n5. CERRAR: Preguntas directas que faciliten la decisión\n\n📋 SERVICIOS DISPONIBLES:`;

      if (serviciosProcesados.length > 0) {
        serviciosProcesados.forEach(servicio => {
          promptSistema += `\n• ${servicio.nombre}`;
          if (servicio.precio) {
            promptSistema += ` - $${servicio.precio}`;
          }
        });
      }

      promptSistema += `\n\n💪 REGLAS DE RESPUESTA:\n- SIEMPRE menciona precios específicos cuando pregunten por costos\n- USA urgencia: \"Solo disponible esta semana\", \"Últimos 3 espacios\"\n- HAZ preguntas que lleven al cierre: \"¿Cuándo te gustaría empezar?\"\n- MANEJA objeciones con valor: Si dicen \"es caro\" → explica beneficios\n- SÉ directo y confiado, no tímido ni genérico`;
    }

    const messages = [
      {
        role: 'system',
        content: promptSistema
      }
    ];

    if (todos.length > 0) {
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

    console.log(`📬 Mensajes enviados a GPT: ${messages.length}`);
    console.log(`🌟 Primer usuario: ${mensajesUsuario.length === 0 ? 'SÍ' : 'NO'}`);

    return messages;

  } catch (err) {
    console.error('❌ Error generando historial para GPT:', err.message);
    console.error('Stack trace:', err.stack);
    return null;
  }
};

module.exports = { generarHistorialGPT };
