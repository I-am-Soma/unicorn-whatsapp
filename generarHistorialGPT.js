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

    const client_id = clienteMatch?.id || 1;
    console.log(`👤 Client ID detectado: ${client_id} (${clienteMatch?.nombre || 'Cliente por defecto'})`);

    const { data: todos, error } = await supabase
      .from('conversations')
      .select('last_message, created_at, origen, client_id, lead_phone, agent_name')
      .order('created_at', { ascending: true })
      .limit(200);

    if (error || !todos) {
      console.error('❌ Error al consultar historial:', error?.message);
      return null;
    }

    const mensajes = todos.filter(m =>
      m.lead_phone && m.lead_phone.replace(/\D/g, '').includes(baseNumero)
    );

    console.log(`💬 Mensajes encontrados en historial: ${mensajes.length}`);

    const { data: cliente, error: errorCliente } = await supabase
      .from('clientes')
      .select('prompt_inicial, lista_servicios, nombre')
      .eq('id', client_id)
      .single();

    if (errorCliente) {
      console.error('❌ Error consultando configuración del cliente:', errorCliente.message);
    }

    const promptBase = cliente?.prompt_inicial?.trim();
    const servicios = cliente?.lista_servicios?.trim();
    const nombreCliente = cliente?.nombre?.trim();

    console.log(`📝 Prompt inicial encontrado: ${promptBase ? 'SÍ' : 'NO'}`);
    console.log(`🛍️ Servicios encontrados: ${servicios ? 'SÍ' : 'NO'}`);
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

    const ultimoMensajeUsuario = mensajes
      .filter(m => m.origen !== 'unicorn' && m.agent_name !== 'Unicorn AI')
      .pop()?.last_message?.toLowerCase() || '';

    const esPreguntaPrecio = /cuanto|cuesta|precio|cost|dollar|peso|barato|caro|vale/.test(ultimoMensajeUsuario);
    const esPreguntaServicios = /servicio|que hac|ofrec|tratamiento|procedimiento/.test(ultimoMensajeUsuario);
    const esObjecion = /caro|expensive|mucho|pensarlo|despues|luego|maybe/.test(ultimoMensajeUsuario);
    const esInteresPorUno = serviciosProcesados.some(s => 
      ultimoMensajeUsuario.includes(s.nombre.toLowerCase().substring(0, 5))
    );
    const esPreguntaGobierno = /maru campos|gobernadora|gobierno|acciones|programas|estado|chihuahua|politic[ao]|obras|campan[ãa]/.test(ultimoMensajeUsuario);

    console.log(`🎯 Análisis del mensaje: precio=${esPreguntaPrecio}, servicios=${esPreguntaServicios}, objeción=${esObjecion}, interés=${esInteresPorUno}, gobierno=${esPreguntaGobierno}`);

    let promptSistema = "";

    if (esPreguntaGobierno) {
      promptSistema = `
Eres un asistente informativo oficial del Gobierno del Estado de Chihuahua.

Tu objetivo es informar clara, breve y positivamente sobre las acciones de la Gobernadora María Eugenia Campos Galván. Menciona logros clave, programas sociales, obras importantes y avances en temas como seguridad, salud, educación y desarrollo económico. Si no hay un detalle disponible, responde con cortesía y ofrece una fuente de contacto.

🎯 Reglas:
- Responde con tono institucional y cercano.
- No exageres ni repitas slogans.
- Si aplica, invita al usuario a conocer más en el sitio oficial o redes sociales.
\`;
    } else {
      promptSistema = `Eres ${nombreCliente ? \`el asistente comercial de \${nombreCliente}\` : 'un experto asistente comercial'}. 

🎯 TU OBJETIVO: Convertir cada conversación en una VENTA. No solo informar, sino VENDER.

🔥 ESTRATEGIA DE VENTAS:
1. CALIFICAR: Identificar necesidad específica y urgencia
2. PRESENTAR: Servicio exacto + precio + beneficios concretos
3. CREAR URGENCIA: Escasez, tiempo limitado, ofertas especiales
4. MANEJAR OBJECIONES: Respuestas preparadas para "es caro", "lo pensaré", etc.
5. CERRAR: Preguntas directas que faciliten la decisión

📋 SERVICIOS DISPONIBLES:`;

      serviciosProcesados.forEach(servicio => {
        promptSistema += `\n• \${servicio.nombre}`;
        if (servicio.precio) {
          promptSistema += ` - $\${servicio.precio}`;
        }
      });

      promptSistema += `\n\n💪 REGLAS DE RESPUESTA:
- SIEMPRE menciona precios específicos cuando pregunten por costos
- USA urgencia: "Solo disponible esta semana", "Últimos 3 espacios", "Oferta por tiempo limitado"
- HAZ preguntas que lleven al cierre: "¿Cuándo te gustaría empezar?", "¿Prefieres la cita mañana o el jueves?"
- MANEJA objeciones con valor: Si dicen "es caro" → explica beneficios, ofrece facilidades de pago
- SÉ directo y confiado, no tímido ni genérico`;

      if (esPreguntaPrecio) {
        promptSistema += `\n🎯 El cliente está preguntando por PRECIOS - Da precios específicos + beneficios + urgencia.`;
      }
      if (esObjecion) {
        promptSistema += `\n⚠️ El cliente tiene una OBJECIÓN - Manéjala con beneficios y facilidades de pago.`;
      }
      if (esInteresPorUno) {
        promptSistema += `\n✨ El cliente mostró interés en un servicio específico - ENFÓCATE en ese servicio y cierra la venta.`;
      }
    }

    const fechaPrimerMensaje = mensajes.length > 0 ? new Date(mensajes[0].created_at) : new Date();
    const diasDesdePrimerMensaje = (Date.now() - fechaPrimerMensaje.getTime()) / (1000 * 60 * 60 * 24);
    const usarHistorial = diasDesdePrimerMensaje <= 3;
    
    console.log(`📅 Días desde primer mensaje: \${diasDesdePrimerMensaje.toFixed(1)}`);
    console.log(`🔄 Usar historial: \${usarHistorial}`);

    const hayMensajesUsuario = mensajes.some(m => 
      m.origen !== 'unicorn' && 
      m.agent_name !== 'Unicorn AI' && 
      m.agent_name !== 'bot'
    );

    const messages = [{ role: 'system', content: promptSistema }];

    const yaSaludoUnicorn = mensajes.some(m =>
      m.origen === 'unicorn' &&
      m.agent_name === 'Unicorn AI' &&
      m.last_message &&
      m.last_message.trim().length > 10
    );

    if (!yaSaludoUnicorn && !esPreguntaGobierno) {
      let mensajeBienvenida = `¡Hola! 👋`;
      if (promptBase) mensajeBienvenida += ` \${promptBase}`;

      if (serviciosProcesados.length > 0) {
        const servicioDestacado = serviciosProcesados[0];
        mensajeBienvenida += ` 🔥 OFERTA ESPECIAL: \${servicioDestacado.nombre}`;
        if (servicioDestacado.precio) {
          mensajeBienvenida += ` por solo $\${servicioDestacado.precio}`;
        }
        mensajeBienvenida += `\n\n✨ ¿Cuál te interesa más?`;

        serviciosProcesados.slice(0, 3).forEach((s, i) => {
          mensajeBienvenida += `\n\${i + 1}. \${s.nombre}`;
          if (s.precio) mensajeBienvenida += ` - $\${s.precio}`;
        });

        mensajeBienvenida += `\n\n📞 ¿Cuándo te gustaría empezar? Solo quedan 3 espacios disponibles esta semana.`;
      } else {
        mensajeBienvenida += ` ¿En qué puedo ayudarte hoy?`;
      }

      messages.push({ role: 'assistant', content: mensajeBienvenida });
    }

    if (hayMensajesUsuario && usarHistorial) {
      const mensajesRecientes = mensajes.slice(-8);
      mensajesRecientes.forEach(msg => {
        if (msg.last_message?.trim()) {
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

    console.log(`📤 Mensajes enviados a GPT: \${messages.length}`);
    return messages;
    
  } catch (err) {
    console.error('❌ Error generando historial para GPT:', err.message);
    console.error('Stack trace:', err.stack);
    return null;
  }
};

module.exports = { generarHistorialGPT };
