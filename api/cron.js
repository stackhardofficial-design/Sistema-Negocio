export default async function handler(req, res) {
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: "Missing Supabase credentials in env" });
  }

  try {
    // Solo hacemos un GET súper liviano (pedimos 1 solo registro)
    // Esto cuenta como actividad en la API y evita que Supabase pause el proyecto.
    // No usamos la IA (Groq) porque Groq no pausa cuentas por inactividad y no queremos gastar tokens.
    const response = await fetch(`${SUPABASE_URL}/rest/v1/users?select=id&limit=1`, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });

    if (!response.ok) {
      throw new Error(`Supabase ping failed: ${response.statusText}`);
    }

    return res.status(200).json({
      success: true,
      message: "Ping exitoso. Base de datos mantenida activa.",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
