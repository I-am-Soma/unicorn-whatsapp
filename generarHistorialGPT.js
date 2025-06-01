const generarHistorialGPT = async (leadPhone, supabase) => {
  try {
    const baseNumero = leadPhone.replace(/^whatsapp:/, '').replace(/\D/g, '');

    const { data: todos, error } = await supabase
      .from('conversations')
      .select('last_message, created_at, origen, cliente_id, lead_phone')
      .order('created_at', { ascending: true })
      .limit(200);

    if (error || !todos) {
      console.error('❌ Error al consultar historial:', error?.message);
      return null;
    }

    const mensajes = todos.filter(m =>
      m.lead_phone && m.lead_phone.replace(/\D/g, '').includes(baseNumero)
    );

    // DETERMINAR SI YA HAY HISTORIAL DE USUARIO
    // Se considera que hay historial si hay mensajes y al menos uno NO es de 'unicorn'
    // O si los mensajes son de unicorn pero han pasado más de 7 días (para reiniciar la conversación)
    const fechaPrimerMensaje = mensajes.length > 0 ? new Date(mensajes[0].created_at) : null;
    const diasDesdePrimerMensaje = fechaPrimerMensaje ? (Date.now() - fechaPrimerMensaje.getTime()) / (1000 * 60 * 60 * 24) : 0;
    const ignorarHistorialAntiguo = diasDesdePrimerMensaje > 7; // Si el último mensaje es de hace más de 7 días

    // `hayConversacionPrevia` es true si hay mensajes relevantes del usuario O si los mensajes son de unicorn y no han pasado 7 días (es decir, una conversación activa iniciada por unicorn)
    const hayConversacionPrevia = mensajes.some(m => m.origen !== 'unicorn') && !ignorarHistorialAntiguo;


    // MODIFICACIÓN CLAVE: Asegurarse de obtener el cliente_id correcto
    // Buscar el cliente_id del lead en la tabla 'clientes' usando su número de WhatsApp
    // Esto asume que el 'lead_phone' en 'conversations' debería mapearse a un 'numero_whatsapp' en 'clientes'
    let cliente_id_usar = 1; // Default fallback to client_id 1
    const { data: clientePorNumero, error: errorClientePorNumero } = await supabase
      .from('clientes')
      .select('id')
      .eq('numero_whatsapp', leadPhone.replace(/^whatsapp:/, '')) // Limpiar 'whatsapp:' del leadPhone para la búsqueda
      .single();

    if (clientePorNumero) {
      cliente_id_usar = clientePorNumero.id;
    } else if (mensajes.length > 0 && mensajes[0].cliente_id) {
        // Fallback: si no se encuentra por número de WhatsApp, intentar usar el cliente_id del primer mensaje
        cliente_id_usar = mensajes[0].cliente_id;
    }

    const { data: cliente, error: errorCliente } = await supabase
      .from('clientes')
      .select('prompt_inicial, lista_servicios, nombre')
      .eq('id', cliente_id_usar) // Usar el cliente_id determinado
      .single();

    // Si no se encuentra el cliente o hay un error, se usará el fallback del promptBase y servicios
    const promptBase = cliente?.prompt_inicial?.trim() || 'Eres un agente comercial proactivo. Ofreces servicios desde el primer mensaje, sin esperar a que el usuario hable.';
    const servicios = cliente?.lista_servicios
      ?.split('\n')
      .map(linea => `• ${linea.trim()}`)
      .join('\n') || 'Actualmente no hay servicios cargados.';
    const preciosExtra = `\n\nServicios disponibles:\n${servicios}`;

    const messages = [
      {
        role: 'system',
        content: `${promptBase}${preciosExtra}`
      }
    ];

    // Comportamiento esperado:
    // Si hay historial (mensajes del usuario o conversación reciente iniciada por unicorn), se añade el historial real.
    // Si NO hay historial (es una conversación nueva o antigua ignorada), se simula un mensaje del usuario.
    if (hayConversacionPrevia) {
      messages.push(
        ...mensajes.map(msg => ({
          role: msg.origen === 'unicorn' ? 'assistant' : 'user',
          content: msg.last_message?.slice(0, 300) || ''
        }))
      );
    } else {
      // Simular la pregunta inicial del usuario para que la IA genere la primera respuesta personalizada
      messages.push({
        role: 'user',
        content: `Hola, me interesa saber qué ofrecen.` // O una pregunta más genérica como "Hola, ¿qué servicios tienen?"
      });
    }

    return messages;
  } catch (err) {
    console.error('❌ Error generando historial para GPT:', err.message);
    return null;
  }
};

module.exports = { generarHistorialGPT };
