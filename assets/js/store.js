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
  const LS_MULTIMEDIA= 'gt_multimedia_v1';   // solo modo demo

  /* Subir este numero al cambiar la FORMA de los datos de prueba (campos
     nuevos, jerarquia distinta). Sin esto, un navegador que ya tenia la
     semilla vieja nunca recibia la nueva y quedaba con datos incoherentes
     respecto del codigo. Solo afecta al modo demo. */
  const SEMILLA_VERSION = '13-sin-actividad-y-cita-cedida';

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
    const mismaVersion = localStorage.getItem(LS_SEMILLA) === SEMILLA_VERSION;

    // Los datos de prueba se generan relativos al dia en que se sembraron.
    // Si pasan dias, "hoy" queda sin registros y la pagina de prueba deja
    // de parecerse a la realidad: todo el mundo sale sin reportar. Se
    // regeneran cuando envejecen mas de un dia.
    const ultima = leerLS(LS_REGISTROS, [])
      .reduce((m, r) => (r.fecha > m ? r.fecha : m), '');
    const frescos = ultima >= sumarDias(hoyISO(), -1);

    if (mismaVersion && frescos) return;

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

      // Los lideres tambien producen, con menor volumen porque dedican
      // parte del tiempo a su equipo. El MGA no carga reporte propio.
      for (const ag of agentes.filter(a => a.rol !== 'MGA')) {
        const esLider = ag.rol !== 'Agente';
        if (rnd() < (esLider ? 0.35 : 0.12)) continue;   // ausencias ocasionales

        // Dias declarados sin actividad: poco frecuentes pero repartidos,
        // para poder ver como se comportan la constancia y las tablas.
        if (rnd() < 0.05) {
          registros.push({
            id: nuevoId(),
            fecha,
            agenteId: ag.id,
            agenteNombre: ag.nombre,
            sinActividad: true,
            motivoSinActividad:
              MOTIVOS_SIN_ACTIVIDAD[entre(0, MOTIVOS_SIN_ACTIVIDAD.length - 1)].key,
            app: 0, press: 0, pressSale: 0, pressNoSale: 0, callerCalls: 0,
            noShow: 0, noCalifica: 0, reschedule: 0, citaCedida: 0,
            referidos: 0, alp: 0,
            creado: fecha,
          });
          continue;
        }

        const app       = esLider ? entre(1, 4) : entre(2, 9);
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
          citaCedida:  rnd() < 0.25 ? entre(1, 2) : 0,
          referidos:   entre(0, 6),
          alp:         pressSale * entre(400, 1800) + entre(0, 250),
          creado: fecha,
        });
      }
    }

    /* Metas de las ultimas 6 semanas. Se dejan dos agentes sin meta a
       proposito, para poder probar el caso "sin meta". */
    /* Metas base: se capturan una vez y valen para todas las semanas. Es
       lo normal. Solo se siembran un par de excepciones semanales, que es
       como deberia usarse. Dos agentes quedan sin base para poder ver el
       caso "sin meta". */
    const metas = [];
    const sinMeta = new Set(['a17', 'a19', 'a1']);   // a1 es el MGA: sin meta propia
    const conMeta = agentes.filter(a => !sinMeta.has(a.id));

    for (const ag of conMeta) {
      const esLider = ag.rol !== 'Agente';
      metas.push({
        id: nuevoId(),
        semana: META_BASE,
        agenteId: ag.id,
        agenteNombre: ag.nombre,
        alp:       (esLider ? entre(3, 7) : entre(6, 14)) * 1000,
        app:       esLider ? entre(8, 15) : entre(18, 30),
        referidos: esLider ? entre(4, 9)  : entre(8, 18),
        actualizado: hoyISO(),
      });
    }

    // Dos excepciones en la semana en curso: una meta reforzada y otra
    // rebajada, para ver la distincion entre heredada y fijada a mano.
    [['a9', 1.6], ['a12', 0.5]].forEach(([id, factor]) => {
      const base = metas.find(m => m.agenteId === id);
      if (!base) return;
      metas.push({
        id: nuevoId(),
        semana: semanaActual(),
        agenteId: id,
        agenteNombre: base.agenteNombre,
        alp:       Math.round(base.alp * factor),
        app:       Math.round(base.app * factor),
        referidos: Math.round(base.referidos * factor),
        actualizado: hoyISO(),
      });
    });

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
        // Puerta de equipo + requisito individual: nadie califica hasta
        // que la linea completa llegue a su numero.
        id: 'c5',
        nombre: 'Meta de Equipo MGA',
        desde: sumarDias(hoyISO(), -10),
        hasta: sumarDias(hoyISO(), 11),
        premioTipo: 'efectivo',
        premio: '$500 para cada uno que califique',
        requisitos: [
          { campo: 'alp', meta: 40000, ambito: 'equipo' },
          { campo: 'alp', meta: 2000,  ambito: 'individual' },
        ],
        combinacion: 'todos',
        alcanceTipo: 'linea',
        alcanceLinea: 'a1',                  // toda la linea del MGA
        alcanceIds: [],
        estatus: 'auto',
      },
      {
        // Contest de un SA para su propio equipo, sin tocar al resto de la
        // linea del GA ni del MGA.
        id: 'c6',
        nombre: 'Reto interno de Yeni',
        desde: sumarDias(hoyISO(), -6),
        hasta: sumarDias(hoyISO(), 8),
        premioTipo: 'experiencia',
        premio: 'Almuerzo de equipo + tarde libre',
        requisitos: [
          { campo: 'alp',       meta: 9000, ambito: 'equipo' },
          { campo: 'pressSale', meta: 3,    ambito: 'individual' },
        ],
        combinacion: 'todos',
        alcanceTipo: 'linea',
        alcanceLinea: 'a4',                  // solo el equipo de Yeni (SA)
        alcanceIds: [],
        estatus: 'auto',
      },
      {
        // Regla de certificacion: no importa la suma del equipo, importa
        // cuantos llegaron por su cuenta al numero de certificado.
        id: 'c7',
        nombre: 'Bono por Certificaciones',
        desde: sumarDias(hoyISO(), -8),
        hasta: sumarDias(hoyISO(), 13),
        premioTipo: 'efectivo',
        premio: '$1,000 para el equipo si certifican 4',
        requisitos: [
          { campo: 'alp', meta: 4, umbral: 4000, ambito: 'conteo' },
        ],
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
        // Termino por fecha y nadie lo ha resuelto: es el caso que muestra
        // los tres botones de resolucion.
        estatus: 'auto',
        ganadores: [],
      },
      {
        // Ya resuelto: calificaron varios, pero el premio se sorteo y lo
        // gano una sola persona. Sirve para ver el historial.
        id: 'c8',
        nombre: 'Bono de Medio Ano',
        desde: sumarDias(hoyISO(), -70),
        hasta: sumarDias(hoyISO(), -40),
        premioTipo: 'efectivo',
        premio: '$750 en efectivo',
        requisitos: [{ campo: 'pressSale', meta: 10, ambito: 'individual' }],
        combinacion: 'todos',
        alcanceTipo: 'todos',
        alcanceLinea: '',
        alcanceIds: [],
        estatus: 'pagado',
        ganadores: ['a12'],
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

    /* En demo no hay Drive: la imagen se queda como data URL en el propio
       navegador. Sirve para probar la interfaz completa sin tocar nada
       real. localStorage ronda los 5 MB, asi que aqui se es mas estricto
       que en produccion. */
    async subirMultimedia(archivo) {
      const bytes = Math.ceil((archivo.datos || '').length * 3 / 4);
      if (bytes > 1.5 * 1024 * 1024) {
        throw new Error('En modo de prueba las imagenes se guardan en el ' +
                        'navegador, asi que el tope es 1.5 MB.');
      }
      const id = nuevoId();
      const guardadas = leerLS(LS_MULTIMEDIA, {});
      guardadas[id] = `data:${archivo.tipo};base64,${archivo.datos}`;
      escribirLS(LS_MULTIMEDIA, guardadas);
      return { id, nombre: archivo.nombre, tipo: archivo.tipo, bytes };
    },

    async eliminarMultimedia(fileId) {
      const guardadas = leerLS(LS_MULTIMEDIA, {});
      delete guardadas[fileId];
      escribirLS(LS_MULTIMEDIA, guardadas);
      return true;
    },
  };

  /* =======================================================================
     BACKEND SHEETS — Google Apps Script
     Se usa POST con Content-Type text/plain para evitar el preflight CORS
     que Apps Script no responde.
     ======================================================================= */

  /**
   * Una llamada al Apps Script.
   *
   * `reintentos` es solo para lecturas. Google a veces tarda en arrancar la
   * ejecucion y termina devolviendo su pagina generica de 404: medido en
   * produccion, 5 de 12 lecturas seguidas. Es un fallo pasajero de la
   * plataforma —la misma llamada al rato sale bien— asi que reintentar lo
   * convierte en exito. Las escrituras no reintentan: crear algo dos veces
   * es peor que un error claro.
   *
   * Un error que devuelve la propia aplicacion (json.ok === false) no se
   * reintenta: un PIN malo o una accion desconocida no mejoran repitiendo.
   */
  async function llamar(accion, datos = {}, { reintentos = 0, limiteMs = 0 } = {}) {
    if (!CONFIG.SHEETS_URL) {
      throw new Error('Falta configurar CONFIG.SHEETS_URL en assets/js/config.js');
    }
    for (let intento = 0; ; intento++) {
      try {
        return await llamarUnaVez(accion, datos, limiteMs);
      } catch (err) {
        if (err.delServidor || intento >= reintentos) throw err;
        // Espera creciente con algo de azar, para que varios agentes que
        // fallaron a la vez no vuelvan a chocar todos en el mismo instante.
        const espera = [1000, 3000, 6000][Math.min(intento, 2)] + Math.random() * 500;
        await new Promise(r => setTimeout(r, espera));
      }
    }
  }

  /**
   * `limiteMs` corta una peticion colgada para poder reintentarla. Medido:
   * Google llego a retener una lectura 100 s antes de devolver un 404, y sin
   * tope todo lo que esperaba detras se quedaba igual de colgado.
   *
   * Solo lo usan las lecturas. Abortar una escritura en el navegador NO la
   * cancela en el servidor: el agente veria un error, guardaria otra vez, y
   * quedaria duplicado.
   */
  async function llamarUnaVez(accion, datos, limiteMs = 0) {
    const control = limiteMs ? new AbortController() : null;
    const reloj = control ? setTimeout(() => control.abort(), limiteMs) : null;

    let json;
    try {
      const res = await fetch(CONFIG.SHEETS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ accion, ...datos, pin: Sesion.pin() }),
        signal: control ? control.signal : undefined,
      });
      if (!res.ok) throw new Error(`Google no respondió (${res.status})`);

      try {
        json = await res.json();
      } catch (e) {
        if (e.name === 'AbortError') throw e;
        throw new Error('Google devolvió una página de error en lugar de los datos.');
      }
    } catch (e) {
      if (e.name === 'AbortError') {
        throw new Error(`Google tardó más de ${Math.round(limiteMs / 1000)} s en responder.`);
      }
      throw e;
    } finally {
      if (reloj) clearTimeout(reloj);
    }
    if (!json.ok) {
      const err = new Error(json.error || 'Error en el servidor.');
      err.delServidor = true;
      throw err;
    }
    return json.data;
  }

  /* =======================================================================
     PAQUETE DE DATOS

     Todo lo que la pagina lee —agentes, registros, metas y contests— viaja
     junto en un solo paquete, y se muestra primero lo que ya se tiene.

     Por que. Medido en produccion el 14/09 con 618 registros: la pagina
     estaba lista en 0.7 s y tardaba 24.5 s en pintar datos. El 97% de la
     espera era Google arrancando ejecuciones del Apps Script, no leer la
     hoja (eso son ~100 ms con el cache). Y la cola es compartida: el Web App
     corre como "Yo", asi que todos los agentes gastan el mismo cupo de
     ejecuciones simultaneas. Cada llamada de un agente es espera para otro.

     Tres decisiones:

     1. UN SOLO VIAJE. `cargaInicial` trae las cuatro listas en una ejecucion
        en vez de cuatro, y la pagina recorta por fecha, agente o semana en
        el navegador. Menos cola para todo el equipo, no solo para quien
        abre.

     2. LO QUE YA SE TIENE, AL INSTANTE. El ultimo paquete bueno se guarda
        en este dispositivo. Al abrir la pagina se pinta con el y se pide el
        nuevo por detras; cuando llega, si cambio algo, se avisa para
        repintar. Desde la segunda visita la pagina deja de esperar a Google.
        Nunca se hace pasar lo viejo por actual: mientras se actualiza, o si
        la actualizacion falla, la cabecera lo dice y da la hora de los datos.

     3. DESPUES DE ESCRIBIR, LA HOJA. Tras guardar, lo siguiente que se lee
        espera el paquete fresco: quien acaba de guardar tiene que ver lo
        suyo, no la copia de antes.
     ======================================================================= */

  /* Dentro de este plazo el paquete se usa sin preguntar a nadie. Cambiar
     de pestaña o de periodo no dispara ejecuciones; pasado el plazo se usa
     igual y se refresca por detras. */
  const FRESCO_MS = 60000;

  /* La version va en la clave: si el formato del paquete cambia, la copia
     vieja simplemente no se encuentra. */
  const CLAVE_COPIA = 'gt_paquete_v1';

  let paquete     = null;   // { agentes, registros, metas, contests, t }
  let enCurso     = null;   // { gen, promesa } de la actualizacion en vuelo
  let generacion  = 0;      // sube con cada escritura
  let forzarHoja  = false;  // tras escribir: la proxima lectura espera a la hoja
  let sinCargaInicial = false;

  const estado = { actualizando: false, error: null, desdeCopia: false };
  const oyentesDatos  = new Set();
  const oyentesEstado = new Set();

  function estadoPublico() {
    return {
      actualizando: estado.actualizando,
      error:        estado.error,
      desdeCopia:   estado.desdeCopia,
      hayDatos:     !!paquete,
      t:            paquete ? paquete.t : null,
    };
  }

  function notificar(oyentes, dato) {
    oyentes.forEach(fn => { try { fn(dato); } catch (e) { console.error(e); } });
  }

  function leerCopia() {
    try {
      const c = JSON.parse(localStorage.getItem(CLAVE_COPIA) || 'null');
      // La copia es de UNA hoja: si la URL cambio, no le pertenece.
      if (!c || c.url !== CONFIG.SHEETS_URL || !Array.isArray(c.registros)) return null;
      return c;
    } catch {
      return null;
    }
  }

  function guardarCopia(p) {
    try {
      localStorage.setItem(CLAVE_COPIA, JSON.stringify({ ...p, url: CONFIG.SHEETS_URL }));
    } catch {
      // Sin espacio o almacenamiento bloqueado (ventana privada): se sigue
      // funcionando, solo que cada visita espera a la hoja como antes.
    }
  }

  /** Para saber si lo que llego es distinto de lo que se esta mostrando. */
  function huella(p) {
    return JSON.stringify([p.agentes, p.registros, p.metas, p.contests]);
  }

  /* Politica de las lecturas: tres intentos, 20 s cada uno como maximo. */
  const LECTURA = { reintentos: 2, limiteMs: 20000 };

  async function traerDeLaHoja() {
    if (!sinCargaInicial) {
      try {
        const d = await llamar('cargaInicial', {}, LECTURA);
        return { agentes: d.agentes, registros: d.registros, metas: d.metas, contests: d.contests };
      } catch (err) {
        if (!esAccionDesconocida(err)) throw err;
        // El Apps Script publicado todavia no tiene cargaInicial. Se sigue
        // con las lecturas sueltas: mas lento, pero permite subir la pagina
        // antes de actualizar la hoja sin que nadie vea errores.
        sinCargaInicial = true;
      }
    }
    const [agentes, registros, metas, contests] = await Promise.all([
      llamar('listarAgentes',   {}, LECTURA),
      llamar('listarRegistros', {}, LECTURA),
      tolerante(() => llamar('listarMetas',    {}, LECTURA), []),
      tolerante(() => llamar('listarContests', {}, LECTURA), []),
    ]);
    return { agentes, registros, metas, contests };
  }

  /**
   * Pide el paquete a la hoja. Si ya hay una peticion en vuelo que sigue
   * siendo valida, se une a ella en vez de lanzar otra.
   *
   * `avisar` decide si un cambio se anuncia a los oyentes. Quien espera el
   * resultado para pintar no lo necesita; una actualizacion por detras si,
   * porque nadie mas va a repintar.
   */
  function actualizar({ avisar }) {
    if (enCurso && enCurso.gen === generacion) return enCurso.promesa;

    const gen = generacion;
    const habiaDatos = !!paquete;
    estado.actualizando = true;
    notificar(oyentesEstado, estadoPublico());

    const promesa = traerDeLaHoja()
      .then(nuevo => {
        // Una escritura cayo mientras esto viajaba: lo que trajo es de antes
        // de guardar. Se descarta y se vuelve a pedir.
        if (gen !== generacion) return actualizar({ avisar });

        const cambio = !paquete || huella(nuevo) !== huella(paquete);
        paquete = { ...nuevo, t: Date.now() };
        forzarHoja = false;
        estado.error = null;
        estado.desdeCopia = false;
        guardarCopia(paquete);

        if (cambio && avisar && habiaDatos) notificar(oyentesDatos, paquete);
        return paquete;
      })
      .catch(err => {
        estado.error = err;
        throw err;
      })
      .finally(() => {
        if (enCurso && enCurso.gen === gen) enCurso = null;
        estado.actualizando = !!enCurso;
        notificar(oyentesEstado, estadoPublico());
      });

    enCurso = { gen, promesa };
    return promesa;
  }

  /** El paquete para leer: lo que haya al instante, o la hoja si no hay nada. */
  async function obtenerPaquete() {
    if (forzarHoja) return actualizar({ avisar: false });

    if (!paquete) {
      const copia = leerCopia();
      if (copia) {
        paquete = copia;
        estado.desdeCopia = true;
      }
    }
    if (!paquete) return actualizar({ avisar: false });

    // La copia de una visita anterior se verifica SIEMPRE, sin importar su
    // edad: entre visitas otro agente pudo guardar. El plazo solo aplica a
    // lo que ya llego de la hoja en esta misma visita.
    if (estado.desdeCopia || Date.now() - paquete.t > FRESCO_MS) {
      // Con datos a la vista, un fallo al refrescar no rompe nada: queda
      // anotado en el estado y la cabecera lo muestra.
      actualizar({ avisar: true }).catch(() => {});
    }
    return paquete;
  }

  /** Envuelve una escritura para que lo siguiente que se lea sea fresco. */
  function escribir(fn) {
    return async (...args) => {
      const r = await fn(...args);
      generacion++;
      forzarHoja = true;
      return r;
    };
  }

  /* Marca si el Apps Script publicado todavia no conoce las funciones
     nuevas. Permite subir la pagina y actualizar la hoja despues, sin que
     el equipo se encuentre errores mientras tanto. */
  let backendViejo = false;

  function esAccionDesconocida(err) {
    return /Acci[oó]n desconocida/i.test(String(err && err.message));
  }

  /** Si el backend aun no tiene la accion, devuelve un valor vacio. */
  async function tolerante(fn, vacio) {
    try {
      return await fn();
    } catch (err) {
      if (esAccionDesconocida(err)) {
        backendViejo = true;
        return vacio;
      }
      throw err;
    }
  }

  /**
   * Filtra los registros como lo haria el backend.
   *
   * La lista llega ya ordenada por fecha descendente y filtrar no altera
   * el orden, asi que no hace falta reordenar.
   */
  function filtrarRegistros(regs, f = {}) {
    return regs.filter(r =>
      (!f.desde    || r.fecha >= f.desde) &&
      (!f.hasta    || r.fecha <= f.hasta) &&
      (!f.agenteId || r.agenteId === f.agenteId));
  }

  /** Filtra las metas como lo haria el backend. */
  function filtrarMetas(metas, f = {}) {
    return metas.filter(m =>
      (!f.semana || m.semana === f.semana) &&
      (!f.desde  || m.semana >= f.desde) &&
      (!f.hasta  || m.semana <= f.hasta));
  }

  const sheets = {
    // Todas las lecturas salen del mismo paquete: ninguna viaja por su
    // cuenta, y cambiar de pestaña o de periodo no cuesta una ejecucion.
    listarAgentes:  async ()       => (await obtenerPaquete()).agentes,
    listarContests: async ()       => (await obtenerPaquete()).contests,
    listarMetas:    async (f = {}) => filtrarMetas((await obtenerPaquete()).metas, f),

    async listarRegistros(f = {}) {
      return filtrarRegistros((await obtenerPaquete()).registros, f);
    },

    /**
     * Se consulta cada vez que se cambia la fecha o el agente en el
     * formulario. Si otro guardo ese mismo dia hace instantes, aqui podria
     * salir "no existe" y no avisarse de la correccion — pero el backend
     * reemplaza por fecha y agente, asi que no se duplica nada.
     */
    async obtenerRegistro({ fecha, agenteId }) {
      const { registros } = await obtenerPaquete();
      return registros.find(r => r.fecha === fecha && r.agenteId === agenteId) || null;
    },

    // Las escrituras si fallan a la vista: guardar algo que no se guarda
    // seria peor que un error claro. Tras cualquiera, lo siguiente que se
    // lee espera el paquete fresco de la hoja.
    crearAgente:       escribir((a)           => llamar('crearAgente', { agente: a })),
    actualizarAgente:  escribir((id, cambios) => llamar('actualizarAgente', { id, cambios })),
    eliminarAgente:    escribir((id, o = {})  => llamar('eliminarAgente', { id, ...o })),
    guardarRegistro:   escribir((r)           => llamar('guardarRegistro', { registro: r })),
    eliminarRegistro:  escribir((id)          => llamar('eliminarRegistro', { id })),
    guardarMetas:      escribir((lista)       => llamar('guardarMetas', { metas: lista })),
    guardarContest:    escribir((c)           => llamar('guardarContest', { contest: c })),
    eliminarContest:   escribir((id)          => llamar('eliminarContest', { id })),

    validarAdmin:      (pin)          => llamar('validarAdmin', { pinPrueba: pin }),
    reiniciarDemo:     async ()       => { throw new Error('No disponible en modo Sheets.'); },

    // No pasan por `escribir`: no tocan ninguna hoja, asi que no hay nada
    // que invalidar. Lo que si cambia la hoja es guardar el contest con la
    // lista de imagenes ya actualizada, y eso ya invalida por su cuenta.
    subirMultimedia:   (archivo)      => llamar('subirMultimedia', { archivo }),
    eliminarMultimedia:(fileId)       => llamar('eliminarMultimedia', { fileId }),
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

  /**
   * URL con la que mostrar una imagen guardada.
   *
   * El enlace de "compartir" de Drive —/file/d/ID/view— NO sirve dentro de
   * una etiqueta <img>: devuelve una pagina web, no la imagen, y se ve un
   * hueco roto. El de miniatura si devuelve la imagen, y ademas deja pedir
   * el ancho, asi que la rejilla no descarga el original de 3 MB para
   * mostrarlo a 300 px.
   */
  function urlMultimedia(fileId, ancho = 1200) {
    if (MODO_EFECTIVO === 'demo') {
      const guardadas = leerLS(LS_MULTIMEDIA, {});
      return guardadas[fileId] || '';
    }
    return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w${ancho}`;
  }

  const enHoja = MODO_EFECTIVO === 'sheets';

  return {
    ...backend,
    esDemo: MODO_EFECTIVO === 'demo',
    modo: MODO_EFECTIVO,
    esPaginaDePrueba: enLocalhost && CONFIG.MODO_LOCALHOST === 'demo',
    /** true si el Apps Script publicado aun no tiene Metas ni Contests. */
    backendDesactualizado: () => backendViejo,
    /** true si el Apps Script publicado aun no tiene cargaInicial. */
    backendSinCargaInicial: () => sinCargaInicial,
    urlMultimedia,

    /** Deja el paquete listo: al instante si hay copia, si no espera a la hoja. */
    precargar: () => (enHoja ? obtenerPaquete() : Promise.resolve()),

    /** Llegaron datos distintos de los que se estaban mostrando. */
    alActualizar:   fn => { if (enHoja) oyentesDatos.add(fn); },
    /** Empezo o termino una actualizacion, o fallo. */
    alCambiarEstado: fn => { if (enHoja) oyentesEstado.add(fn); },
    estadoDatos:    () => estadoPublico(),
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
