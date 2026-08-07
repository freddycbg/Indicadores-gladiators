/* =========================================================================
   charts.js — Gráficas en SVG puro (sin librerías externas)
   Paleta validada para modo claro y oscuro.
   ========================================================================= */

const Charts = (() => {

  const NS = 'http://www.w3.org/2000/svg';

  function svgEl(tag, attrs = {}) {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined) continue;
      n.setAttribute(k, v);
    }
    return n;
  }

  function modoOscuro() {
    const stamp = document.documentElement.getAttribute('data-theme');
    if (stamp === 'dark')  return true;
    if (stamp === 'light') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  /* --- Paleta -----------------------------------------------------------
     Categórica: los 3 primeros slots (validados en ambos modos, todas las
     parejas). Secuencial: un solo tono azul; en claro más-es-oscuro, en
     oscuro más-es-claro, para que el paso extremo nunca se funda con el
     fondo.
     --------------------------------------------------------------------- */
  function paleta() {
    const osc = modoOscuro();
    return {
      oscuro: osc,
      serie:  osc ? ['#3987e5', '#d95926', '#199e70']
                  : ['#2a78d6', '#eb6834', '#1baf7a'],
      rampa:  osc ? ['#184f95', '#256abf', '#2a78d6', '#3987e5', '#5598e7', '#6da7ec', '#86b6ef']
                  : ['#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#184f95'],
      tinta:      osc ? '#ffffff' : '#0b0b0b',
      tintaSec:   osc ? '#c3c2b7' : '#52514e',
      apagado:    '#898781',
      malla:      osc ? '#2c2c2a' : '#e1e0d9',
      linea:      osc ? '#383835' : '#c3c2b7',
      superficie: osc ? '#1a1a19' : '#fcfcfb',
    };
  }

  /* --- Tooltip compartido ------------------------------------------------ */

  let _tip = null;

  function tooltip() {
    if (!_tip) {
      _tip = el('div', { class: 'tip', role: 'status' });
      document.body.appendChild(_tip);
    }
    return _tip;
  }

  function mostrarTip(html, evt) {
    const t = tooltip();
    t.innerHTML = html;
    t.classList.add('is-visible');
    const r = t.getBoundingClientRect();
    let x = evt.clientX + 14;
    let y = evt.clientY - r.height - 12;
    if (x + r.width > window.innerWidth - 8) x = evt.clientX - r.width - 14;
    if (y < 8) y = evt.clientY + 18;
    t.style.left = x + 'px';
    t.style.top  = y + 'px';
  }

  function ocultarTip() {
    if (_tip) _tip.classList.remove('is-visible');
  }

  /* --- Escala "bonita" para el eje de valores ---------------------------- */

  function escalaBonita(max) {
    if (max <= 0) return { max: 1, paso: 1 };
    const mag  = Math.pow(10, Math.floor(Math.log10(max)));
    const norm = max / mag;
    const pasoNorm = norm <= 1 ? 0.2 : norm <= 2 ? 0.5 : norm <= 5 ? 1 : 2;
    const paso = pasoNorm * mag;
    return { max: Math.ceil(max / paso) * paso, paso };
  }

  /* =======================================================================
     BARRAS HORIZONTALES — comparar magnitud entre agentes
     Color secuencial (un solo tono): más alto = paso más contrastado.
     ======================================================================= */

  function barrasH(cont, { items, formato = 'entero', sufijo = '' }) {
    cont.innerHTML = '';
    if (!items.length) {
      cont.appendChild(el('p', { class: 'vacio', text: 'Sin datos en el rango seleccionado.' }));
      return;
    }

    const P = paleta();
    const filaAlto = 34;
    const margen = { arriba: 8, derecha: 78, abajo: 8, izquierda: 150 };
    const ancho = 720;
    const alto  = margen.arriba + items.length * filaAlto + margen.abajo;
    const anchoTrama = ancho - margen.izquierda - margen.derecha;
    const maxVal = Math.max(...items.map(i => i.valor), 1);

    const svg = svgEl('svg', {
      viewBox: `0 0 ${ancho} ${alto}`,
      class: 'grafica',
      role: 'img',
      preserveAspectRatio: 'xMidYMid meet',
    });

    items.forEach((it, i) => {
      const y = margen.arriba + i * filaAlto;
      const cy = y + filaAlto / 2;
      const w  = Math.max(2, (it.valor / maxVal) * anchoTrama);
      // El paso de la rampa sigue la magnitud, no la posición en la lista.
      const paso = P.rampa[Math.min(P.rampa.length - 1,
                    Math.round((it.valor / maxVal) * (P.rampa.length - 1)))];

      // Etiqueta del agente
      const et = svgEl('text', {
        x: margen.izquierda - 12, y: cy + 4,
        'text-anchor': 'end', class: 'g-etiqueta', fill: P.tintaSec,
      });
      et.textContent = it.label.length > 20 ? it.label.slice(0, 19) + '…' : it.label;
      svg.appendChild(et);

      // Barra: extremo redondeado 4px, anclada a la línea base
      const barra = svgEl('rect', {
        x: margen.izquierda, y: y + 7, width: w, height: filaAlto - 14,
        rx: 4, fill: paso,
      });
      svg.appendChild(barra);

      // Valor directamente etiquetado (releva el aviso de contraste)
      const val = svgEl('text', {
        x: margen.izquierda + w + 10, y: cy + 4,
        class: 'g-valor', fill: P.tinta,
      });
      val.textContent = fmt(it.valor, formato) + sufijo;
      svg.appendChild(val);

      // Zona de contacto más grande que la barra
      const golpe = svgEl('rect', {
        x: 0, y, width: ancho, height: filaAlto,
        fill: 'transparent', class: 'g-golpe',
      });
      golpe.addEventListener('mousemove', e => {
        barra.setAttribute('opacity', '0.82');
        mostrarTip(
          `<strong>${esc(it.label)}</strong><br>${esc(it.detalle || '')}` +
          `<span class="tip-val">${fmt(it.valor, formato)}${sufijo}</span>`, e);
      });
      golpe.addEventListener('mouseleave', () => {
        barra.removeAttribute('opacity');
        ocultarTip();
      });
      svg.appendChild(golpe);
    });

    // Línea base
    svg.appendChild(svgEl('line', {
      x1: margen.izquierda, y1: margen.arriba,
      x2: margen.izquierda, y2: alto - margen.abajo,
      stroke: P.linea, 'stroke-width': 1,
    }));

    cont.appendChild(svg);
  }

  /* =======================================================================
     LÍNEAS — tendencia diaria, hasta 3 series categóricas
     Retícula vertical + tooltip con todas las series del día.
     ======================================================================= */

  function lineas(cont, { fechas, series }) {
    cont.innerHTML = '';
    if (!fechas.length) {
      cont.appendChild(el('p', { class: 'vacio', text: 'Sin datos en el rango seleccionado.' }));
      return;
    }

    const P = paleta();
    const ancho = 760, alto = 300;
    const margen = { arriba: 18, derecha: 92, abajo: 34, izquierda: 46 };
    const w = ancho - margen.izquierda - margen.derecha;
    const h = alto  - margen.arriba    - margen.abajo;

    const maxDato = Math.max(1, ...series.flatMap(s => s.valores));
    const escala  = escalaBonita(maxDato);

    const px = i => margen.izquierda + (fechas.length === 1 ? w / 2 : (i / (fechas.length - 1)) * w);
    const py = v => margen.arriba + h - (v / escala.max) * h;

    const svg = svgEl('svg', {
      viewBox: `0 0 ${ancho} ${alto}`,
      class: 'grafica',
      role: 'img',
      preserveAspectRatio: 'xMidYMid meet',
    });

    /* Retícula horizontal y eje de valores */
    for (let v = 0; v <= escala.max + 1e-9; v += escala.paso) {
      const y = py(v);
      svg.appendChild(svgEl('line', {
        x1: margen.izquierda, y1: y, x2: margen.izquierda + w, y2: y,
        stroke: v === 0 ? P.linea : P.malla, 'stroke-width': 1,
      }));
      const t = svgEl('text', {
        x: margen.izquierda - 10, y: y + 4,
        'text-anchor': 'end', class: 'g-tick', fill: P.apagado,
      });
      t.textContent = fmtCompacto(v);
      svg.appendChild(t);
    }

    /* Eje de fechas — como máximo 7 marcas para que no colisionen.
       La última marca solo se dibuja si queda lejos de la anterior. */
    const salto  = Math.max(1, Math.ceil(fechas.length / 7));
    const ultimo = fechas.length - 1;
    const resto  = ultimo % salto;
    const dibujarUltimo = resto === 0 || resto >= salto / 2;

    fechas.forEach((f, i) => {
      if (i === ultimo) {
        if (!dibujarUltimo) return;
      } else if (i % salto !== 0) {
        return;
      }
      const t = svgEl('text', {
        x: px(i), y: alto - margen.abajo + 20,
        'text-anchor': 'middle', class: 'g-tick', fill: P.apagado,
      });
      t.textContent = fechaCorta(f).slice(0, 5);
      svg.appendChild(t);
    });

    /* Trazos: 2px, sin marcador por punto (solo en hover) */
    series.forEach((s, si) => {
      const color = P.serie[si % P.serie.length];
      const d = s.valores.map((v, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ');
      svg.appendChild(svgEl('path', {
        d, fill: 'none', stroke: color,
        'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
      }));

      /* Etiqueta directa al final del trazo — la identidad nunca depende
         solo del color, y releva el aviso de contraste del tono aqua. */
      const ult = s.valores[s.valores.length - 1];
      const et = svgEl('text', {
        x: margen.izquierda + w + 10, y: py(ult) + 4,
        class: 'g-directa', fill: color,
      });
      et.textContent = s.nombre;
      svg.appendChild(et);
    });

    /* Capa de interacción: retícula vertical + puntos + tooltip */
    const guia = svgEl('line', {
      y1: margen.arriba, y2: margen.arriba + h,
      stroke: P.linea, 'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: 0,
    });
    svg.appendChild(guia);

    const puntos = series.map((s, si) => {
      const c = svgEl('circle', {
        r: 5, fill: P.serie[si % P.serie.length],
        stroke: P.superficie, 'stroke-width': 2, opacity: 0,
      });
      svg.appendChild(c);
      return c;
    });

    const capa = svgEl('rect', {
      x: margen.izquierda, y: margen.arriba, width: w, height: h, fill: 'transparent',
    });
    capa.addEventListener('mousemove', e => {
      const caja = svg.getBoundingClientRect();
      const rel  = ((e.clientX - caja.left) / caja.width) * ancho;
      const i = Math.max(0, Math.min(fechas.length - 1,
        Math.round(((rel - margen.izquierda) / w) * (fechas.length - 1))));

      guia.setAttribute('x1', px(i));
      guia.setAttribute('x2', px(i));
      guia.setAttribute('opacity', 1);

      puntos.forEach((c, si) => {
        c.setAttribute('cx', px(i));
        c.setAttribute('cy', py(series[si].valores[i]));
        c.setAttribute('opacity', 1);
      });

      const filas = series.map((s, si) => `
        <span class="tip-fila">
          <i style="background:${P.serie[si % P.serie.length]}"></i>
          ${esc(s.nombre)}<b>${fmt(s.valores[i], s.formato || 'entero')}</b>
        </span>`).join('');
      mostrarTip(`<strong>${esc(fechaEtiqueta(fechas[i]))}</strong>${filas}`, e);
    });
    capa.addEventListener('mouseleave', () => {
      guia.setAttribute('opacity', 0);
      puntos.forEach(c => c.setAttribute('opacity', 0));
      ocultarTip();
    });
    svg.appendChild(capa);

    cont.appendChild(svg);

    /* Leyenda — siempre presente con 2 o más series */
    if (series.length >= 2) {
      const leyenda = el('div', { class: 'leyenda' });
      series.forEach((s, si) => {
        leyenda.appendChild(el('span', { class: 'leyenda-item' }, [
          el('i', { style: `background:${P.serie[si % P.serie.length]}` }),
          document.createTextNode(s.nombre),
        ]));
      });
      cont.appendChild(leyenda);
    }
  }

  /* Redibuja al cambiar de tema */
  const suscriptores = [];
  function alCambiarTema(fn) { suscriptores.push(fn); }
  function notificarTema()   { suscriptores.forEach(fn => fn()); }

  return { barrasH, lineas, alCambiarTema, notificarTema, paleta };
})();
