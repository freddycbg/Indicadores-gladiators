/* =========================================================================
   store.js — Capa de datos
   Una sola interfaz para toda la app. Detrás puede estar:
     · localStorage  (CONFIG.MODO = 'demo')
     · Google Sheets (CONFIG.MODO = 'sheets', vía Apps Script)
   El resto de la aplicación nunca sabe cuál de los dos está activo.
   ========================================================================= */

const Store = (() => {

  /* =======================================================================
     BACKEND DEMO — localStorage
     ======================================================================= */

  const LS_AGENTES   = 'gt_agentes_v1';
  const LS_REGISTROS = 'gt_registros_v1';

  function leerLS(clave, porDefecto) {
    try {
      const raw = localStorage.getItem(clave);
      return raw ? JSON.parse(raw) : porDefecto;
    } catch {
      return porDefecto;
    }
  }

  function escribirLS(clave, valor) {
    localStorage.setItem(clave, JSON.stringify(valor));
  }

  /* --- Semilla de prueba: 8 agentes y ~45 días de registros -------------- */

  function sembrarDemo() {
    if (localStorage.getItem(LS_AGENTES)) return;

    const nombres = [
      ['Carlos Méndez',    'Alfa'],
      ['María Fernández',  'Alfa'],
      ['José Ramírez',     'Alfa'],
      ['Ana Lucía Pérez',  'Bravo'],
      ['Diego Castillo',   'Bravo'],
      ['Sofía Morales',    'Bravo'],
      ['Luis Enrique Gil', 'Charlie'],
      ['Karla Súchite',    'Charlie'],
    ];

    const agentes = nombres.map(([nombre, equipo], i) => ({
      id: 'a' + (i + 1),
      nombre,
      equipo,
      activo: true,
      creado: hoyISO(),
    }));

    // Generador pseudoaleatorio con semilla fija: los datos de prueba
    // son siempre los mismos, así las gráficas no cambian en cada recarga.
    let semilla = 20260807;
    const rnd = () => {
      semilla = (semilla * 1103515245 + 12345) % 2147483648;
      return semilla / 2147483648;
    };
    const entre = (a, b) => a + Math.floor(rnd() * (b - a + 1));

    const registros = [];
    for (let d = 44; d >= 0; d--) {
      const fecha = sumarDias(hoyISO(), -d);
      const diaSemana = new Date(fecha.replace(/-/g, '/')).getDay();
      if (diaSemana === 0) continue;                     // sin registros el domingo

      for (const ag of agentes) {
        if (rnd() < 0.12) continue;                      // ausencias ocasionales

        const app       = entre(2, 9);
        const press     = Math.max(0, app - entre(0, 3));
        const pressSale = Math.max(0, press - entre(0, press));
        registros.push({
          id: nuevoId(),
          fecha,
          agenteId: ag.id,
          agenteNombre: ag.nombre,
          app,
          press,
          pressSale,
          callerCalls: entre(20, 85),
          noShow:      entre(0, 3),
          noCalifica:  entre(0, 2),
          reschedule:  entre(0, 2),
          referidos:   entre(0, 6),
          alp:         pressSale * entre(400, 1800) + entre(0, 250),
          creado: fecha,
        });
      }
    }

    escribirLS(LS_AGENTES, agentes);
    escribirLS(LS_REGISTROS, registros);
  }

  const demo = {
    async listarAgentes() {
      return leerLS(LS_AGENTES, []);
    },

    async crearAgente({ nombre, equipo, activo }) {
      const agentes = leerLS(LS_AGENTES, []);
      if (agentes.some(a => a.nombre.toLowerCase() === nombre.toLowerCase())) {
        throw new Error('Ya existe un agente con ese nombre.');
      }
      const ag = { id: nuevoId(), nombre, equipo, activo: activo !== false, creado: hoyISO() };
      agentes.push(ag);
      escribirLS(LS_AGENTES, agentes);
      return ag;
    },

    async actualizarAgente(id, cambios) {
      const agentes = leerLS(LS_AGENTES, []);
      const i = agentes.findIndex(a => a.id === id);
      if (i < 0) throw new Error('Agente no encontrado.');

      const nombreNuevo = (cambios.nombre ?? agentes[i].nombre).toLowerCase();
      if (agentes.some((a, j) => j !== i && a.nombre.toLowerCase() === nombreNuevo)) {
        throw new Error('Ya existe otro agente con ese nombre.');
      }

      agentes[i] = { ...agentes[i], ...cambios };
      escribirLS(LS_AGENTES, agentes);

      // Mantener sincronizado el nombre desnormalizado en los registros
      if (cambios.nombre) {
        const regs = leerLS(LS_REGISTROS, []);
        regs.forEach(r => { if (r.agenteId === id) r.agenteNombre = cambios.nombre; });
        escribirLS(LS_REGISTROS, regs);
      }
      return agentes[i];
    },

    async eliminarAgente(id, { borrarRegistros = false } = {}) {
      const agentes = leerLS(LS_AGENTES, []).filter(a => a.id !== id);
      escribirLS(LS_AGENTES, agentes);
      if (borrarRegistros) {
        escribirLS(LS_REGISTROS, leerLS(LS_REGISTROS, []).filter(r => r.agenteId !== id));
      }
      return true;
    },

    async listarRegistros({ desde, hasta, agenteId } = {}) {
      let regs = leerLS(LS_REGISTROS, []);
      if (desde)    regs = regs.filter(r => r.fecha >= desde);
      if (hasta)    regs = regs.filter(r => r.fecha <= hasta);
      if (agenteId) regs = regs.filter(r => r.agenteId === agenteId);
      return regs.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
    },

    async obtenerRegistro({ fecha, agenteId }) {
      return leerLS(LS_REGISTROS, [])
        .find(r => r.fecha === fecha && r.agenteId === agenteId) || null;
    },

    async guardarRegistro(reg) {
      const regs = leerLS(LS_REGISTROS, []);
      // Un agente tiene un solo registro por día: si ya existe, se actualiza.
      const i = regs.findIndex(r => r.fecha === reg.fecha && r.agenteId === reg.agenteId);
      if (i >= 0) {
        regs[i] = { ...regs[i], ...reg, id: regs[i].id, actualizado: new Date().toISOString() };
        escribirLS(LS_REGISTROS, regs);
        return { registro: regs[i], reemplazado: true };
      }
      const nuevo = { ...reg, id: nuevoId(), creado: new Date().toISOString() };
      regs.push(nuevo);
      escribirLS(LS_REGISTROS, regs);
      return { registro: nuevo, reemplazado: false };
    },

    async eliminarRegistro(id) {
      const regs = leerLS(LS_REGISTROS, []);
      const quedan = regs.filter(r => r.id !== id);
      if (quedan.length === regs.length) throw new Error('El registro ya no existe.');
      escribirLS(LS_REGISTROS, quedan);
      return true;
    },

    async validarAdmin(pin) {
      return pin === CONFIG.ADMIN_PIN_DEMO;
    },

    async reiniciarDemo() {
      localStorage.removeItem(LS_AGENTES);
      localStorage.removeItem(LS_REGISTROS);
      sembrarDemo();
      return true;
    },
  };

  /* =======================================================================
     BACKEND SHEETS — Google Apps Script
     Se usa POST con Content-Type text/plain para evitar el preflight CORS
     que Apps Script no responde.
     ======================================================================= */

  async function llamar(accion, datos = {}) {
    if (!CONFIG.SHEETS_URL) {
      throw new Error('Falta configurar CONFIG.SHEETS_URL en assets/js/config.js');
    }
    const res = await fetch(CONFIG.SHEETS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ accion, ...datos, pin: Sesion.pin() }),
    });
    if (!res.ok) throw new Error(`Error de red (${res.status})`);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'Error en el servidor.');
    return json.data;
  }

  const sheets = {
    listarAgentes:     ()             => llamar('listarAgentes'),
    crearAgente:       (a)            => llamar('crearAgente', { agente: a }),
    actualizarAgente:  (id, cambios)  => llamar('actualizarAgente', { id, cambios }),
    eliminarAgente:    (id, opts = {})=> llamar('eliminarAgente', { id, ...opts }),
    listarRegistros:   (f = {})       => llamar('listarRegistros', f),
    obtenerRegistro:   (c)            => llamar('obtenerRegistro', c),
    guardarRegistro:   (r)            => llamar('guardarRegistro', { registro: r }),
    eliminarRegistro:  (id)           => llamar('eliminarRegistro', { id }),
    validarAdmin:      (pin)          => llamar('validarAdmin', { pinPrueba: pin }),
    reiniciarDemo:     async ()       => { throw new Error('No disponible en modo Sheets.'); },
  };

  /* =======================================================================
     Selección de backend
     ======================================================================= */

  if (CONFIG.MODO === 'demo') sembrarDemo();

  const backend = CONFIG.MODO === 'sheets' ? sheets : demo;

  return {
    ...backend,
    esDemo: CONFIG.MODO === 'demo',
  };
})();

/* =========================================================================
   Sesion — estado de administrador (solo en memoria + sessionStorage)
   ========================================================================= */

const Sesion = (() => {
  const CLAVE = 'gt_admin_pin';
  return {
    pin()          { return sessionStorage.getItem(CLAVE) || ''; },
    esAdmin()      { return !!sessionStorage.getItem(CLAVE); },
    entrar(pin)    { sessionStorage.setItem(CLAVE, pin); },
    salir()        { sessionStorage.removeItem(CLAVE); },
  };
})();
