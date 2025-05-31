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

    const promptBase = cliente?.prompt_inicial?.trim() || 'Eres un agente comercial proactivo. Ofreces servicios desde el primer mensaje, sin esperar a que el usuario hable.';
    const preciosExtra = cliente?.lista_servicios?.trim()
      ? `\nServicios disponibles:\n${cliente.lista_servicios}`
      : '';

    const fechaPrimerMensaje = new Date(mensajes[0].created_at);
    const diasDesdePrimerMensaje = (Date.now() - fechaPrimerMensaje.getTime()) / (1000 * 60 * 60 * 24);
    const ignorarHistorial = diasDesdePrimerMensaje > 7;

    const hayUsuarioPrevio = mensajes.some(m => m.origen !== 'unicorn') && !ignorarHistorial;

    const messages = [
      {
        role: 'system',
        content: `${promptBase}${preciosExtra}`
      },
      ...(
        hayUsuarioPrevio
          ? mensajes.map(msg => ({
              role: msg.origen === 'unicorn' ? 'assistant' : 'user',
              content: msg.last_message?.slice(0, 300) || ''
            }))
          : [
              {
                role: 'assistant',
                content: `Hola 👋, soy parte del equipo. Te comparto algunos de nuestros servicios:\n` +
                         (cliente?.lista_servicios?.split('\n').slice(0, 3).join('\n') || '¿Deseas más información?')
              }
            ]
      )
    ];

    return messages;
  } catch (err) {
    console.error('❌ Error generando historial para GPT:', err.message);
    return null;
  }
};

module.exports = { generarHistorialGPT };
