const generarHistorialGPT = async (leadPhone, supabase) => {
  try {
    const baseNumero = leadPhone.replace(/^whatsapp:/, '').replace(/\D/g, '');

    // 1. Traer todos los mensajes recientes
    const { data: todos, error } = await supabase
      .from('conversations')
      .select('last_message, created_at, origen, cliente_id, lead_phone')
      .order('created_at', { ascending: true })
      .limit(200);

    if (error || !todos) {
      console.error('❌ Error al consultar historial:', error?.message);
      return null;
    }

    // 2. Filtrar por coincidencia numérica
    const mensajes = todos.filter(m =>
      m.lead_phone && m.lead_phone.replace(/\D/g, '').includes(baseNumero)
    );

    if (mensajes.length === 0) {
      console.warn('⚠️ No se encontró historial coincidente para', baseNumero);
      return null;
    }

    const cliente_id = mensajes[0].cliente_id || 1;

    const { data: cliente, error: errorCliente } = await supabase
      .from('clientes')
      .select('prompt_inicial, lista_servicios')
      .eq('id', cliente_id)
      .single();

    const promptBase = cliente?.prompt_inicial || 'Eres un asistente comercial que responde con cortesía y busca generar interés.';
    const preciosExtra = cliente?.lista_servicios
      ? ` Aquí tienes los servicios disponibles:\n${cliente.lista_servicios.map(s => `- ${s.servicio}: ${s.precio}`).join('\n')}`
      : '';

    const messages = [
      {
        role: 'system',
        content: `${promptBase}${preciosExtra}`
      },
      ...mensajes.map(msg => ({
        role: msg.origen === 'unicorn' ? 'assistant' : 'user',
        content: msg.last_message
      }))
    ];

    return messages;
  } catch (err) {
    console.error('❌ Error generando historial para GPT:', err.message);
    return null;
  }
};

module.exports = { generarHistorialGPT };
