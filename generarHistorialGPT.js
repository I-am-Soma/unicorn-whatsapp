const { Configuration, OpenAIApi } = require('openai');
const { generarHistorialGPT } = require('./generarHistorialGPT');
const ElevenLabs = require('./elevenLabs');
const supabase = require('./supabaseClient');

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

const generarRespuestaIA = async (leadPhone) => {
  try {
    console.log(`🤖 Generando respuesta para: ${leadPhone}`);

    const resultado = await generarHistorialGPT(leadPhone, supabase);
    if (!resultado || !Array.isArray(resultado.messages)) throw new Error('No se pudo generar historial GPT');

    const { messages, tipo_respuesta } = resultado;
    console.log(`📦 Tipo de respuesta: ${tipo_respuesta}`);

    const completion = await openai.createChatCompletion({
      model: 'gpt-4-1106-preview',
      messages,
      temperature: 0.9,
      max_tokens: 300,
    });

    const respuestaIA = completion.data.choices[0].message.content.trim();
    console.log(`💬 Respuesta generada: ${respuestaIA}`);

    let mensajeFinal = respuestaIA;

    // Si el tipo de respuesta es "voz", generar audio con ElevenLabs y guardar URL
    if (tipo_respuesta === 'voz') {
      try {
        const audioUrl = await ElevenLabs.generarAudio(respuestaIA, leadPhone);
        console.log(`🔊 Audio generado: ${audioUrl}`);
        mensajeFinal = audioUrl;
      } catch (audioErr) {
        console.error('❌ Error generando audio:', audioErr.message);
      }
    }

    // Guardar mensaje (texto o URL de voz) en Supabase
    const { error: insertError } = await supabase.from('conversations').insert([
      {
        lead_phone: leadPhone,
        last_message: mensajeFinal,
        agent_name: 'Unicorn AI',
        created_at: new Date().toISOString(),
        status: 'In Progress',
        origen: 'unicorn',
        procesar: false,
      },
    ]);

    if (insertError) {
      console.error('❌ Error guardando respuesta IA:', insertError.message);
    }

    return mensajeFinal;
  } catch (err) {
    console.error('❌ Error generando respuesta IA:', err.message);
    return null;
  }
};

module.exports = { generarRespuestaIA };



