app.post('/webhook', async (req, res) => {
  console.log('Body recibido en /webhook:', req.body); // 👈 Para ver qué llega exactamente

  // ATENCIÓN: Cambiamos las variables
  const { user_message, phone_number, agent_name } = req.body;

  if (!user_message || !phone_number) {
    console.error('Faltan datos importantes:', { user_message, phone_number });
    return res.status(400).json({ error: 'Missing user_message or phone_number' });
  }

  try {
    const { data, error } = await supabase
      .from('conversations')
      .insert([
        {
          lead_phone: phone_number,
          last_message: user_message,
          agent_name: agent_name || 'Vapi Default',
          status: 'New',
          created_at: new Date().toISOString()
        }
      ]);

    if (error) {
      console.error('Error al insertar en Supabase:', error);
      return res.status(500).json({ error: 'Error inserting data' });
    }

    console.log('Mensaje guardado en Supabase:', data);
    res.status(200).json({ message: 'Data received and inserted successfully' });
  } catch (err) {
    console.error('Unexpected error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
