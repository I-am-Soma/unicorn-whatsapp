const generarHistorialGPT = async (leadPhone, supabase) => {
  try {
    const baseNumero = leadPhone.replace(/^whatsapp:/, '').replace(/\D/g, '');

    // Obtener todos los mensajes
    const { data: todos, error } = await supabase
      .from('conversations')
      .select('last_message, created_at, origen, cliente_id, lead_phone')
      .order('created_at', { ascending: true })
      .limit(200);

    if (error || !todos) {
      console.error('❌ Error al consultar historial:', error?.message);
      return null;
    }

    // Filtrar mensajes del mismo número
    const mensajes = todos.filter(m =>
      m.lead_phone && m.lead_phone.replace(/\D/g, '').includes(baseNumero)
    );

    // Si no hay mensajes coincidentes, se usa un cliente_id por default
    let cliente_id = 1;
    if (mensajes.length > 0 && mensajes[0].cliente_id) {
      cliente_id = mensajes[0].cliente_id;
    } else {
      // Intentar obtener cliente desde número
      const { data: clientePorNumero, error: errCliente } = await supabase
        .from('clientes')
        .select('id')
        .eq('numero_whatsapp', `+${baseNumero}`)
        .single();

      if (clientePorNumero) cliente_id = clientePorNumero.id;
    }

    // Cargar los datos del cliente
    const { data: cliente, error: errorCliente } = await supabase
      .from('clientes')
      .select('prompt_inicial, lista_servicios, nombre')
      .eq('id', cliente_id)
      .single();

    // Preparar contenido del prompt personalizado
    const promptBase = cliente?.prompt_inicial?.trim() ||
      'Eres un agente comercial proactivo. Ofreces servicios desde el primer mensaje, sin esperar a que el usuario hable.';

    const servicios = cliente?.lista_servicios
      ?.split('\n')
      .map(linea => `• ${linea.trim()}`)
      .join('\n') || 'Actualmente no hay servicios cargados.';

    const preciosExtra = `\n\nServicios disponibles:\n${servicios}`;

    const fechaPrimerMensaje = mensajes.length > 0 ? new Date(mensajes[0].created_at) : null;
    const diasDesdePrimerMensaje = fechaPrimerMensaje
      ? (Date.now() - fechaPrimerMensaje.getTime()) / (1000 * 60 * 60 * 24)
      : 0;

    const ignorarHistorialAntiguo = diasDesdePrimerMensaje > 7;
    const hayUsuarioPrevio = mensajes.some(m => m.origen !== 'unicorn') && !ignorarHistorialAntiguo;

    const messages = [
      {
        role: 'system',
        content: `${promptBase}${preciosExtra}`
      },
      ...(hayUsuarioPrevio
        ? mensajes.map(msg => ({
            role: msg.origen === 'unicorn' ? 'assistant' : 'user',
            content: msg.last_message?.slice(0, 300) || ''
          }))
        : [
            {
              role: 'user',
              content: 'Hola, ¿me puedes decir qué servicios ofrecen?'
            }
          ])
    ];

    return messages;
  } catch (err) {
    console.error('❌ Error generando historial para GPT:', err.message);
    return null;
  }
};

module.exports = { generarHistorialGPT };

