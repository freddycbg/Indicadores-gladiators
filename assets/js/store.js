/* =========================================================================
   store.js — Capa de datos
   Una sola interfaz para toda la app. Detrás puede estar:
     · localStorage  (CONFIG.MODO = 'demo')
     · Google Sheets (CONFIG.MODO = 'sheets', vía Apps Script)
   El resto de la aplicación nunca sabe cuál de los dos está activo.
   ========================================================================= */

/* =========================================================================
   Jerarquia — utilidades puras, sin acceso a datos.
   Se usan igual en el navegador y (traducidas) en el Apps Script.
   ========================================================================= */

const Jerarquia = {

  /**
   * Valida una relacion "reporta a". Devuelve null si es valida, o el
   * mensaje de error si no lo es.
   * @param {Array}  agentes  catalogo completo (con el cambio ya aplicado o no)
   * @param {string} id       agente que se esta editando
   * @param {string} superiorId  a quien reportaria
   * @param {string} rol      rol que tendra el agente
   */
  validar(agentes, id, superiorId, rol) {
    if (!superiorId) return null;                 // sin superior: nivel mas alto

    if (superiorId === id) {
      return 'Un agente no puede reportarse a si mismo.';
    }

    const superior = agentes.find(a => a.id === superiorId);
    if (!superior) return 'El superior seleccionado no existe.';

    if (rangoDeRol(superior.rol) <= rangoDeRol(rol)) {
      return `${superior.nombre} es ${superior.rol || 'Agente'} y no puede ser superior de un ${rol}. ` +
             `El superior debe tener un nivel mas alto.`;
    }

    // Recorrer hacia arriba: si volvemos al propio agente, hay un ciclo.
    const vistos = new Set([id]);
    let actual = superior;
    let guarda = 0;
    while (actual && guarda++ < 50) {
      if (vistos.has(actual.id)) {
        return 'Esa asignacion crea un ciclo en la jerarquia.';
      }
      vistos.add(actual.id);
      actual = agentes.find(a => a.id === actual.reportaA);
    }
    return null;
  },

  /** Hijos directos de un agente. */
  hijos(agentes, id) {
    return agentes.filter(a => a.reportaA === id);
  },

  /** Todos los descendientes, a cualquier profundidad, sin incluirse. */
  descendientes(agentes, id) {
    const out = [];
    const pila = [id];
    const vistos = new Set([id]);
    while (pila.length) {
      // pop() va fuera del filter: dentro se evaluaria una vez por elemento
      // y vaciaria la pila antes de tiempo.
      const actual = pila.pop();
      for (const h of agentes.filter(a => a.reportaA === actual)) {
        if (vistos.has(h.id)) continue;
        vistos.add(h.id);
        out.push(h);
        pila.push(h.id);
      }
    }
    return out;
  },

  /** Cadena de mando hacia arriba: [superior, superior del superior, ...]. */
  ancestros(agentes, id) {
    const out = [];
    const vistos = new Set([id]);
    let actual = agentes.find(a => a.id === id);
    let guarda = 0;
    while (actual && actual.reportaA && guarda++ < 50) {
      const sup = agentes.find(a => a.id === actual.reportaA);
      if (!sup || vistos.has(sup.id)) break;
      vistos.add(sup.id);
      out.push(sup);
      actual = sup;
    }
    return out;
  },

  /** Raices del arbol: los que no reportan a nadie existente. */
  raices(agentes) {
    return agentes.filter(a => !a.reportaA || !agentes.some(b => b.id === a.reportaA));
  },

  /**
   * Aplana el arbol en orden de lectura, anotando la profundidad de cada
   * nodo. Los agentes cuyo superior no existe cuelgan de la raiz.
   */
  aplanar(agentes) {
    const orden = (a, b) => (rangoDeRol(b.rol) - rangoDeRol(a.rol)) ||
                            a.nombre.localeCompare(b.nombre, 'es');
    const out = [];
    const visitar = (nodo, nivel) => {
      out.push({ agente: nodo, nivel });
      this.hijos(agentes, nodo.id).sort(orden).forEach(h => visitar(h, nivel + 1));
    };
    this.raices(agentes).sort(orden).forEach(r => visitar(r, 0));
    return out;
  },
};

const Store = (() => {

  /* =======================================================================
     BACKEND DEMO — localStorage
     ======================================================================= */

  const LS_AGENTES   = 'gt_agentes_v1';
  const LS_REGISTROS = 'gt_registros_v1';
  const LS_METAS     = 'gt_metas_v1';
  const LS_CONTESTS  = 'gt_contests_v1';
  const LS_SEMILLA   = 'gt_semilla_version';

  /* Subir este numero al cambiar la FORMA de los datos de prueba (campos
     nuevos, jerarquia distinta). Sin esto, un navegador que ya tenia la
     semilla vieja nunca recibia la nueva y quedaba con datos incoherentes
     respecto del codigo. Solo afecta al modo demo. */
  const SEMILLA_VERSION = '3-jerarquia-y-metas';

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
    if (localStorage.getItem(LS_SEMILLA) === SEMILLA_VERSION) return;

    /* Arbol de prueba, con la misma forma del organigrama real:
         Domenico (MGA)
         +- Freddy (GA)
         |  +- Yeni, Grecia, Genesis, Raul, Gabriela (SA) -> sus agentes
         +- Marco (SA)  <- cuelga directo del MGA, sin GA de por medio  */
    const plantilla = [
      // [id, nombre, equipo, rol, reportaA]
      ['a1',  'Domenico Rivas',   'Direccion', 'MGA', ''],
      ['a2',  'Freddy Mota',      'Direccion', 'GA',  'a1'],
      ['a3',  'Marco Aurelio',    'Independiente', 'SA', 'a1'],

      ['a4',  'Yeni Alvarado',    'Alfa',    'SA', 'a2'],
      ['a5',  'Grecia Ferrer',    'Bravo',   'SA', 'a2'],
      ['a6',  'Genesis Lopez',    'Charlie', 'SA', 'a2'],
      ['a7',  'Raul Contreras',   'Delta',   'SA', 'a2'],
      ['a8',  'Gabriela Ruano',   'Echo',    'SA', 'a2'],

      ['a9',  'Carlos Mendez',    'Alfa',    'Agente', 'a4'],
      ['a10', 'Maria Fernandez',  'Alfa',    'Agente', 'a4'],
      ['a11', 'Jose Ramirez',     'Alfa',    'Agente', 'a4'],
      ['a12', 'Ana Lucia Perez',  'Bravo',   'Agente', 'a5'],
      ['a13', 'Diego Castillo',   'Bravo',   'Agente', 'a5'],
      ['a14', 'Sofia Morales',    'Charlie', 'Agente', 'a6'],
      ['a15', 'Luis Enrique Gil', 'Charlie', 'Agente', 'a6'],
      ['a16', 'Karla Suchite',    'Delta',   'Agente', 'a7'],
      ['a17', 'Andres Lopez',     'Delta',   'Agente', 'a7'],
      ['a18', 'Patricia Solis',   'Echo',    'Agente', 'a8'],
      ['a19', 'Erick Barrios',    'Echo',    'Agente', 'a8'],
      // Reporta directo al GA, saltando el nivel de SA
      ['a20', 'Nadia Estrada',    'Direccion', 'Agente', 'a2'],
      // Reporta directo al SA independiente
      ['a21', 'Hugo Palacios',   'Independiente', 'Agente', 'a3'],
    ];

    const agentes = plantilla.map(([id, nombre, equipo, rol, reportaA]) => ({
      id, nombre, equipo, rol, reportaA,
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

      // Solo los agentes de campo cargan reporte diario; SA/GA/MGA reciben
      // el rollup de su linea.
      for (const ag of agentes.filter(a => a.rol === 'Agente')) {
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

    /* Metas de las ultimas 6 semanas. Se dejan dos agentes sin meta a
       proposito, para poder probar el caso "sin meta". */
    const metas = [];
    const sinMeta = new Set(['a17', 'a19']);
    const deCampo = agentes.filter(a => a.rol === 'Agente' && !sinMeta.has(a.id));

    for (let s = 5; s >= 0; s--) {
      const semana = sumarDias(semanaActual(), -7 * s);
      for (const ag of deCampo) {
        metas.push({
          id: nuevoId(),
          semana,
          agenteId: ag.id,
          agenteNombre: ag.nombre,
          alp:       entre(6, 14) * 1000,
          app:       entre(18, 30),
          referidos: entre(8, 18),
          actualizado: semana,
        });
      }
    }

    /* Contests de ejemplo: dos vigentes, uno terminado y uno cancelado. */
    const contests = [
      {
        id: 'c1',
        nombre: 'Contest Cancún Agosto',
        desde: sumarDias(hoyISO(), -12),
        hasta: sumarDias(hoyISO(), 9),
        premioTipo: 'viaje',
        premio: 'Viaje a Cancún, 3 noches todo incluido',
        requisitos: [{ campo: 'alp', meta: 12000 }, { campo: 'pressSale', meta: 8 }],
        combinacion: 'todos',
        alcanceTipo: 'todos',
        alcanceLinea: '',
        alcanceIds: [],
        estatus: 'auto',
      },
      {
        id: 'c2',
        nombre: 'Reto de Referidos',
        desde: sumarDias(hoyISO(), -5),
        hasta: sumarDias(hoyISO(), 2),
        premioTipo: 'efectivo',
        premio: '$500 en efectivo',
        requisitos: [{ campo: 'referidos', meta: 20 }],
        combinacion: 'todos',
        alcanceTipo: 'linea',
        alcanceLinea: 'a2',                  // linea del GA
        alcanceIds: [],
        estatus: 'auto',
      },
      {
        id: 'c3',
        nombre: 'Cierre de Julio',
        desde: sumarDias(hoyISO(), -40),
        hasta: sumarDias(hoyISO(), -10),
        premioTipo: 'experiencia',
        premio: 'Cena para dos + noche de hotel',
        requisitos: [{ campo: 'alp', meta: 25000 }, { campo: 'app', meta: 60 }],
        combinacion: 'alguno',
        alcanceTipo: 'todos',
        alcanceLinea: '',
        alcanceIds: [],
        estatus: 'auto',
      },
      {
        id: 'c4',
        nombre: 'Sprint de Llamadas',
        desde: sumarDias(hoyISO(), -20),
        hasta: sumarDias(hoyISO(), -6),
        premioTipo: 'otro',
        premio: 'Día libre adicional',
        requisitos: [{ campo: 'callerCalls', meta: 400 }],
        combinacion: 'todos',
        alcanceTipo: 'seleccion',
        alcanceIds: ['a9', 'a12', 'a16'],
        alcanceLinea: '',
        estatus: 'cancelado',
      },
    ];

    escribirLS(LS_AGENTES, agentes);
    escribirLS(LS_REGISTROS, registros);
    escribirLS(LS_METAS, metas);
    escribirLS(LS_CONTESTS, contests);
    localStorage.setItem(LS_SEMILLA, SEMILLA_VERSION);
  }

  const demo = {
    async listarAgentes() {
      return leerLS(LS_AGENTES, []);
    },

    async crearAgente({ nombre, equipo, activo, rol, reportaA }) {
      const agentes = leerLS(LS_AGENTES, []);
      if (agentes.some(a => a.nombre.toLowerCase() === nombre.toLowerCase())) {
        throw new Error('Ya existe un agente con ese nombre.');
      }

      const ag = {
        id: nuevoId(), nombre, equipo,
        rol: rol || ROL_POR_DEFECTO,
        reportaA: reportaA || '',
        activo: activo !== false,
        creado: hoyISO(),
      };

      const error = Jerarquia.validar([...agentes, ag], ag.id, ag.reportaA, ag.rol);
      if (error) throw new Error(error);

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

      const propuesto = { ...agentes[i], ...cambios };
      const conCambio = agentes.map((a, j) => (j === i ? propuesto : a));
      const error = Jerarquia.validar(conCambio, id, propuesto.reportaA, propuesto.rol);
      if (error) throw new Error(error);

      // Al bajar de rango, quienes le reportaban quedarian mal colgados.
      if (cambios.rol && cambios.rol !== agentes[i].rol) {
        const malColgados = conCambio.filter(
          a => a.reportaA === id && rangoDeRol(a.rol) >= rangoDeRol(propuesto.rol));
        if (malColgados.length) {
          throw new Error(
            `No se puede cambiar el rol a ${propuesto.rol}: ` +
            `${malColgados.map(a => a.nombre).join(', ')} le reporta(n) y tiene(n) ` +
            `un nivel igual o mayor. Reasignalos primero.`);
        }
      }

      agentes[i] = propuesto;
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
      const todos = leerLS(LS_AGENTES, []);
      const saliente = todos.find(a => a.id === id);

      // Quienes le reportaban pasan a su superior, para que no queden
      // sueltos fuera del arbol.
      const agentes = todos
        .filter(a => a.id !== id)
        .map(a => (a.reportaA === id ? { ...a, reportaA: saliente ? saliente.reportaA : '' } : a));

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

    /* ---- Metas -------------------------------------------------------- */

    async listarMetas({ semana, desde, hasta } = {}) {
      let metas = leerLS(LS_METAS, []);
      if (semana) metas = metas.filter(m => m.semana === semana);
      if (desde)  metas = metas.filter(m => m.semana >= desde);
      if (hasta)  metas = metas.filter(m => m.semana <= hasta);
      return metas;
    },

    /**
     * Guarda varias metas de una vez (la tabla se edita completa y se
     * manda junta). Una meta por agente y semana: si ya existe, se
     * reemplaza. Una meta con los tres valores en cero se borra, que es
     * como se quita una meta desde la tabla.
     */
    async guardarMetas(lista) {
      const metas = leerLS(LS_METAS, []);
      let guardadas = 0, borradas = 0;

      for (const entrada of lista) {
        const i = metas.findIndex(
          m => m.semana === entrada.semana && m.agenteId === entrada.agenteId);
        const vacia = METAS_CAMPOS.every(c => !Number(entrada[c.key]));

        if (vacia) {
          if (i >= 0) { metas.splice(i, 1); borradas++; }
          continue;
        }

        const fila = {
          semana: entrada.semana,
          agenteId: entrada.agenteId,
          agenteNombre: entrada.agenteNombre || '',
          actualizado: new Date().toISOString(),
        };
        METAS_CAMPOS.forEach(c => { fila[c.key] = Number(entrada[c.key]) || 0; });

        if (i >= 0) metas[i] = { ...metas[i], ...fila };
        else        metas.push({ ...fila, id: nuevoId() });
        guardadas++;
      }

      escribirLS(LS_METAS, metas);
      return { guardadas, borradas };
    },

    /* ---- Contests ------------------------------------------------------ */

    async listarContests() {
      return leerLS(LS_CONTESTS, []);
    },

    async guardarContest(contest) {
      const lista = leerLS(LS_CONTESTS, []);
      const fila = { ...contest, actualizado: new Date().toISOString() };

      const i = lista.findIndex(c => c.id === contest.id);
      if (i >= 0) {
        lista[i] = { ...lista[i], ...fila };
      } else {
        lista.push({ ...fila, id: nuevoId(), creado: new Date().toISOString() });
      }
      escribirLS(LS_CONTESTS, lista);
      return true;
    },

    async eliminarContest(id) {
      const lista = leerLS(LS_CONTESTS, []).filter(c => c.id !== id);
      escribirLS(LS_CONTESTS, lista);
      return true;
    },

    async validarAdmin(pin) {
      return pin === CONFIG.ADMIN_PIN_DEMO;
    },

    async reiniciarDemo() {
      localStorage.removeItem(LS_SEMILLA);
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
    listarMetas:       (f = {})       => llamar('listarMetas', f),
    guardarMetas:      (lista)        => llamar('guardarMetas', { metas: lista }),
    listarContests:    ()             => llamar('listarContests'),
    guardarContest:    (c)            => llamar('guardarContest', { contest: c }),
    eliminarContest:   (id)           => llamar('eliminarContest', { id }),
    validarAdmin:      (pin)          => llamar('validarAdmin', { pinPrueba: pin }),
    reiniciarDemo:     async ()       => { throw new Error('No disponible en modo Sheets.'); },
  };

  /* =======================================================================
     Selección de backend

     Desde localhost manda CONFIG.MODO_LOCALHOST: la página de pruebas
     trabaja con datos ficticios y nunca escribe en la hoja real.
     ======================================================================= */

  const enLocalhost = ['localhost', '127.0.0.1', '::1', ''].includes(location.hostname);
  const MODO_EFECTIVO = (enLocalhost && CONFIG.MODO_LOCALHOST)
    ? CONFIG.MODO_LOCALHOST
    : CONFIG.MODO;

  if (MODO_EFECTIVO === 'demo') sembrarDemo();

  const backend = MODO_EFECTIVO === 'sheets' ? sheets : demo;

  return {
    ...backend,
    esDemo: MODO_EFECTIVO === 'demo',
    modo: MODO_EFECTIVO,
    esPaginaDePrueba: enLocalhost && CONFIG.MODO_LOCALHOST === 'demo',
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
