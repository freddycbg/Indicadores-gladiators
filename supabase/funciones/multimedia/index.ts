// =========================================================================
// multimedia — sube y borra las imagenes de los contests
//
// Reemplaza a subirMultimedia/eliminarMultimedia del Apps Script (Drive).
//
// Por que una funcion y no subir directo desde la pagina: el contenedor no
// admite escrituras con la clave publicable, porque la pagina no tiene
// sesiones de usuario con las que distinguir a un administrador. Aqui se
// valida el PIN EN LA BASE (con su bloqueo por intentos) y solo entonces se
// escribe con la clave secreta, que nunca sale del servidor.
//
// Se despliega con verify_jwt = false: la clave publicable no es un JWT, y
// la autorizacion real es el PIN, que se comprueba abajo.
//
// Peticion (POST, JSON):
//   { accion: "subir",    pin, archivo: { nombre, tipo, datos(base64) } }
//   { accion: "eliminar", pin, fileId }
// Respuesta: el mismo sobre que la base, { ok, data } o { ok, error }.
// =========================================================================

const URL_BASE = Deno.env.get('SUPABASE_URL')!;
const CLAVE_SECRETA: string =
  JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}')['default'] ??
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CONTENEDOR = 'contests';
const MAX_BYTES = 8 * 1024 * 1024;
const EXTENSIONES: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif',
};

// Solo se borran rutas con la forma exacta que genera esta funcion: nadie
// puede pedir borrar otra cosa del contenedor por mucho que tenga el PIN.
const RUTA_VALIDA = /^\d{4}-\d{2}\/[0-9a-f-]{36}\.(png|jpg|webp|gif)$/;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'apikey, content-type, authorization, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function responder(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
const bien = (data: unknown) => responder({ ok: true, data });
const mal = (error: string) => responder({ ok: false, error });

/** Direccion del agente, para que el bloqueo por intentos sea suyo y no global. */
function direccion(req: Request): string {
  const reenviada = req.headers.get('x-forwarded-for') ?? '';
  return reenviada.split(',')[0].trim() || req.headers.get('cf-connecting-ip') || 'desconocida';
}

/** Devuelve null si el PIN vale; si no, el mensaje para el agente. */
async function problemaConPin(pin: string, ip: string): Promise<string | null> {
  const r = await fetch(`${URL_BASE}/rest/v1/rpc/validar_pin_servicio`, {
    method: 'POST',
    headers: { apikey: CLAVE_SECRETA, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_pin: pin ?? '', p_ip: ip }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j) return 'No se pudo validar el PIN. Vuelve a intentarlo.';
  if (!j.ok) return j.error;                       // p. ej. bloqueo por intentos
  if (j.data !== true) return 'No autorizado: se requiere PIN de administrador.';
  return null;
}

function decodificar(base64: string): Uint8Array | null {
  try {
    const binario = atob(base64);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

async function subir(archivo: { nombre?: string; tipo?: string; datos?: string }) {
  if (!archivo || !archivo.datos) return mal('No llegó ningún archivo.');

  const tipo = String(archivo.tipo ?? '');
  const extension = EXTENSIONES[tipo];
  if (!extension) return mal('Solo se aceptan imágenes (PNG, JPG, WEBP o GIF).');

  const bytes = decodificar(archivo.datos);
  if (!bytes) return mal('El archivo llegó dañado. Vuelve a intentarlo.');
  if (bytes.length > MAX_BYTES) return mal('La imagen pesa más de 8 MB.');

  const mes = new Date().toISOString().slice(0, 7);
  const ruta = `${mes}/${crypto.randomUUID()}.${extension}`;

  const r = await fetch(`${URL_BASE}/storage/v1/object/${CONTENEDOR}/${ruta}`, {
    method: 'POST',
    headers: { apikey: CLAVE_SECRETA, 'Content-Type': tipo, 'x-upsert': 'false' },
    body: bytes,
  });
  if (!r.ok) {
    const detalle = await r.text().catch(() => '');
    return mal(`No se pudo guardar la imagen (${r.status}). ${detalle.slice(0, 120)}`);
  }

  return bien({
    id: ruta,
    nombre: String(archivo.nombre ?? 'imagen').slice(0, 120),
    tipo,
    bytes: bytes.length,
  });
}

async function eliminar(fileId: string) {
  if (!fileId) return mal('Falta el identificador del archivo.');

  // Una imagen de la epoca de Drive no vive aqui: no hay nada que borrar, y
  // que no exista ya es justo lo que se queria.
  if (!RUTA_VALIDA.test(fileId)) return bien(true);

  const r = await fetch(`${URL_BASE}/storage/v1/object/${CONTENEDOR}`, {
    method: 'DELETE',
    headers: { apikey: CLAVE_SECRETA, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: [fileId] }),
  });
  if (!r.ok) return mal(`No se pudo borrar la imagen (${r.status}).`);
  return bien(true);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return mal('Método no permitido.');
  if (!CLAVE_SECRETA) return mal('La función no tiene acceso a la clave secreta.');

  let cuerpo: {
    accion?: string;
    pin?: string;
    archivo?: { nombre?: string; tipo?: string; datos?: string };
    fileId?: string;
  };
  try {
    cuerpo = await req.json();
  } catch {
    return mal('Petición inválida.');
  }

  try {
    const problema = await problemaConPin(String(cuerpo.pin ?? ''), direccion(req));
    if (problema) return mal(problema);

    if (cuerpo.accion === 'subir')    return await subir(cuerpo.archivo ?? {});
    if (cuerpo.accion === 'eliminar') return await eliminar(String(cuerpo.fileId ?? ''));
    return mal('Acción desconocida: ' + cuerpo.accion);
  } catch (err) {
    return mal('Error en el servidor: ' + String((err as Error)?.message ?? err));
  }
});
