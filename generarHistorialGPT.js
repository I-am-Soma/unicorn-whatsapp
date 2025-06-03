// generarHistorialGPT.js - Versión optimizada para debugging y ventas

// Importar Supabase - Usando variables de entorno
const { createClient } = require('@supabase/supabase-js');

// Verificar variables de entorno
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    console.error('❌ [ENV] Faltan variables de entorno de Supabase');
    console.error('- SUPABASE_URL:', process.env.SUPABASE_URL ? '✅' : '❌');
    console.error('- SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? '✅' : '❌');
}

const supabase = createClient(
    process.env.SUPABASE_URL || "https://agqzpygitmgfoxrqcptg.supabase.co",
    process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFncXpweWdpdG1nZm94cnFjcHRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA0MjcxMzIsImV4cCI6MjA1NjAwMzEzMn0.viDhdw0Ujc_rUXrTAluw_ZB8sfMAQEh3b61CtzorRnQ"
);

console.log('✅ [SUPABASE] Cliente configurado para backend');

async function generarHistorialGPT(leadPhone, mensajeNuevo) {
    try {
        console.log(`🚀 [GPT] Generando historial para: ${leadPhone}`);
        
        // 1. Obtener información del cliente por número de WhatsApp
        const clienteInfo = await obtenerClientePorNumero(leadPhone);
        if (!clienteInfo) {
            console.error(`❌ [GPT] No se encontró cliente para: ${leadPhone}`);
            return null;
        }

        console.log(`✅ [GPT] Cliente encontrado: ${clienteInfo.nombre} (ID: ${clienteInfo.id})`);
        
        // 2. Obtener historial de conversación
        const historial = await obtenerHistorialConversacion(leadPhone);
        console.log(`📋 [GPT] Historial obtenido: ${historial.length} mensajes`);
        
        // 3. Procesar servicios y precios
        const servicios = procesarServicios(clienteInfo.lista_servicios);
        console.log(`💰 [GPT] Servicios procesados: ${servicios.length} items`);
        
        // 4. DEBUG: Mostrar información completa
        console.log('🔍 [DEBUG] Información del cliente:');
        console.log('- Nombre:', clienteInfo.nombre);
        console.log('- Prompt inicial length:', clienteInfo.prompt_inicial?.length || 0);
        console.log('- Servicios:', servicios.map(s => `${s.nombre}: $${s.precio}`));
        
        // 5. Crear prompt optimizado para ventas
        const promptCompleto = crearPromptDeVentas(clienteInfo, servicios, historial, mensajeNuevo);
        
        // 6. DEBUG: Mostrar prompt final (primeros 500 caracteres)
        console.log('📝 [DEBUG] Prompt sistema (preview):', 
            promptCompleto[0].content.substring(0, 500) + '...');
        
        return promptCompleto;
        
    } catch (error) {
        console.error('❌ [GPT] Error en generarHistorialGPT:', error);
        return null;
    }
}

async function obtenerClientePorNumero(leadPhone) {
    try {
        // Normalizar número de teléfono
        const numeroNormalizado = normalizarNumero(leadPhone);
        console.log(`🔍 [DB] Buscando cliente para número: ${numeroNormalizado}`);
        
        const { data, error } = await supabase
            .from('clientes')
            .select('*')
            .eq('numero_whatsapp', numeroNormalizado)
            .single();
        
        if (error) {
            console.error('❌ [DB] Error obteniendo cliente:', error);
            return null;
        }
        
        return data;
    } catch (error) {
        console.error('❌ [DB] Error en obtenerClientePorNumero:', error);
        return null;
    }
}

async function obtenerHistorialConversacion(leadPhone) {
    try {
        const { data, error } = await supabase
            .from('conversations')
            .select('*')
            .eq('lead_phone', leadPhone)
            .order('created_at', { ascending: true })
            .limit(20); // Últimos 20 mensajes para contexto
        
        if (error) {
            console.error('❌ [DB] Error obteniendo historial:', error);
            return [];
        }
        
        return data.map(msg => ({
            sender: msg.origen || 'user',
            message: msg.last_message,
            timestamp: msg.created_at
        }));
    } catch (error) {
        console.error('❌ [DB] Error en obtenerHistorialConversacion:', error);
        return [];
    }
}

function procesarServicios(listaServicios) {
    try {
        if (!listaServicios) return [];
        
        // Si es string JSON, parsearlo
        let servicios = typeof listaServicios === 'string' 
            ? JSON.parse(listaServicios) 
            : listaServicios;
        
        // Normalizar formato
        return servicios.map(servicio => ({
            nombre: servicio.nombre || servicio.name || 'Servicio',
            precio: servicio.precio || servicio.price || '0',
            descripcion: servicio.descripcion || servicio.description || ''
        }));
    } catch (error) {
        console.error('❌ [PROC] Error procesando servicios:', error);
        return [];
    }
}

function crearPromptDeVentas(cliente, servicios, historial, mensajeNuevo) {
    const fechaHoy = new Date().toLocaleDateString('es-ES', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    
    const promptSistema = `ERES UN VENDEDOR EXPERTO DE ${cliente.nombre.toUpperCase()}

🎯 MISIÓN: Convertir este lead en cliente pagando HOY MISMO

📋 INFORMACIÓN DE TU EMPRESA:
${cliente.prompt_inicial}

💰 TUS SERVICIOS Y PRECIOS EXACTOS:
${servicios.map(s => `• ${s.nombre}: $${s.precio}${s.descripcion ? ` - ${s.descripcion}` : ''}`).join('\n')}

🔥 ESTRATEGIA DE VENTA (OBLIGATORIO SEGUIR):

1. CALIFICA AL LEAD:
   - Identifica su necesidad específica
   - Detecta su presupuesto aproximado
   - Entiende su urgencia

2. PRESENTA LA SOLUCIÓN PERFECTA:
   - Menciona el servicio EXACTO que necesita
   - Incluye el precio sin rodeos
   - Explica beneficios concretos (no genéricos)

3. CREA URGENCIA REAL:
   - "Solo me quedan 2 espacios esta semana"
   - "El precio especial vence hoy"
   - "Otros clientes están esperando"

4. MANEJA OBJECIONES:
   - Precio alto → Desglosar valor/beneficios
   - "Lo pensaré" → Crear escasez inmediata
   - Competencia → Diferenciadores únicos

5. CIERRA LA VENTA:
   - Pregunta directa: "¿Cuándo podemos empezar?"
   - Opciones limitadas: "¿Prefieres empezar mañana o el lunes?"
   - Facilita el pago: "¿Tienes WhatsApp Pay o prefieres transferencia?"

📅 CONTEXTO: Hoy es ${fechaHoy}

🚫 NUNCA HAGAS:
- Respuestas genéricas o roboticas
- Olvidar mencionar precios cuando sea relevante
- Terminar sin llamada a la acción
- Ser demasiado formal o frío
- Decir "soy un agente comercial proactivo"

✅ SIEMPRE HAZ:
- Usa un tono humano y cercano
- Menciona beneficios específicos
- Incluye precios cuando presentes servicios
- Termina con pregunta de cierre
- Crea sensación de escasez/urgencia

RESPONDE AHORA como el mejor vendedor de ${cliente.nombre}:`;

    const mensajes = [
        { role: "system", content: promptSistema },
        ...historial.map(msg => ({
            role: msg.sender === 'bot' || msg.sender === 'system' ? 'assistant' : 'user',
            content: msg.message
        })),
        { role: "user", content: mensajeNuevo }
    ];

    return mensajes;
}

function normalizarNumero(numero) {
    // Remover espacios y caracteres especiales
    let numeroLimpio = numero.replace(/[\s\-\(\)]/g, '');
    
    // Asegurar que empiece con +
    if (!numeroLimpio.startsWith('+')) {
        numeroLimpio = '+' + numeroLimpio;
    }
    
    return numeroLimpio;
}

// Función para testing manual
async function testPromptGeneration(leadPhone, mensaje = "Hola, necesito información") {
    console.log('🧪 [TEST] Iniciando test de generación de prompt...');
    const resultado = await generarHistorialGPT(leadPhone, mensaje);
    
    if (resultado) {
        console.log('✅ [TEST] Prompt generado exitosamente');
        console.log('📋 [TEST] Número de mensajes:', resultado.length);
        console.log('📝 [TEST] Prompt sistema completo:');
        console.log(resultado[0].content);
    } else {
        console.log('❌ [TEST] Error generando prompt');
    }
    
    return resultado;
}

module.exports = {
    generarHistorialGPT,
    testPromptGeneration
};
