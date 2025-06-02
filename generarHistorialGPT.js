const generarHistorialGPT = async (leadPhone, supabase, userId = null) => {
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

    const fechaPrimerMensaje = mensajes.length > 0 ? new Date(mensajes[0].created_at) : null;
    const diasDesdePrimerMensaje = fechaPrimerMensaje ? (Date.now() - fechaPrimerMensaje.getTime()) / (1000 * 60 * 60 * 24) : 0;
    const ignorarHistorialAntiguo = diasDesdePrimerMensaje > 7;
    const hayConversacionPrevia = mensajes.some(m => m.origen !== 'unicorn') && !ignorarHistorialAntiguo;

    // 🔍 Buscar cliente_id según userId o número de WhatsApp
    let cliente_id_usar = 1;

    if (userId) {
      const { data: clienteUsuario, error: errorClienteUsuario } = await supabase
        .from('clientes')
        .select('id')
        .eq('user_id', userId)
        .single();

      if (clienteUsuario) {
        cliente_id_usar = clienteUsuario.id;
      }
    } else {
      const { data: clientePorNumero, error: errorClientePorNumero } = await supabase
        .from('clientes')
        .select('id')
        .eq('numero_whatsapp', leadPhone.replace(/^whatsapp:/, ''))
        .single();

      if (clientePorNumero) {
        cliente_id_usar = clientePorNumero.id;
      } else if (mensajes.length > 0 && mensajes[0].cliente_id) {
        cliente_id_usar = mensajes[0].cliente_id;
      }
    }

    const { data: cliente, error: errorCliente } = await supabase
      .from('clientes')
      .select('prompt_inicial, lista_servicios, nombre')
      .eq('id', cliente_id_usar)
      .single();

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

    if (hayConversacionPrevia) {
      messages.push(
        ...mensajes.map(msg => ({
          role: msg.origen === 'unicorn' ? 'assistant' : 'user',
          content: msg.last_message?.slice(0, 300) || ''
        }))
      );
    } else {
      messages.push({
        role: 'user',
        content: `Hola, me interesa saber qué ofrecen.`
      });
    }

    return messages;
  } catch (err) {
    console.error('❌ Error generando historial para GPT:', err.message);
    return null;
  }
};

