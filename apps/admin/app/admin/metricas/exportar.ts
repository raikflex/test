/**
 * Helpers de exportacion para los reportes. Todo client-side: convierten
 * los datos crudos a CSV / Excel / PDF y disparan la descarga en el browser.
 */

import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { DatosReporte } from './reporte-actions';

function formatearFechaCorta(iso: string): string {
  const d = new Date(iso);
  const dia = d.getDate().toString().padStart(2, '0');
  const mes = (d.getMonth() + 1).toString().padStart(2, '0');
  const ano = d.getFullYear();
  const hora = d.getHours().toString().padStart(2, '0');
  const min = d.getMinutes().toString().padStart(2, '0');
  return `${dia}/${mes}/${ano} ${hora}:${min}`;
}

function etiquetaMetodo(m: string): string {
  switch (m) {
    case 'efectivo':
      return 'Efectivo';
    case 'tarjeta':
      return 'Tarjeta';
    case 'transferencia':
      return 'Transferencia';
    case 'no_seguro':
      return 'Sin definir';
    default:
      return m;
  }
}

function nombreBase(data: DatosReporte): string {
  return `reporte-${data.rango.desde}-a-${data.rango.hasta}`;
}

/** Dispara descarga de un blob en el browser. */
function descargar(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Escapa un campo CSV: comillas dobles dentro -> "" y envuelve en comillas si tiene caracteres especiales. */
function escaparCsv(valor: string | number): string {
  const s = String(valor);
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes(';')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function filasACsv(filas: (string | number)[][]): string {
  return filas.map((fila) => fila.map(escaparCsv).join(',')).join('\n');
}

/* ============= Ranking de productos mas vendidos (top 10) ============= */

type ProductoRanking = {
  nombre: string;
  unidades: number;
  ingresos: number;
  pctUnidades: number;
  pctIngresos: number;
};

const TOP_N_PRODUCTOS = 10;

/**
 * Agrupa los items de todas las comandas por nombre_snapshot, suma unidades e ingresos,
 * calcula porcentajes sobre el total general y devuelve el top N ordenado por unidades.
 */
function calcularRankingProductos(data: DatosReporte): ProductoRanking[] {
  const mapa = new Map<string, { unidades: number; ingresos: number }>();

  for (const c of data.comandas) {
    for (const it of c.items) {
      const actual = mapa.get(it.nombre) ?? { unidades: 0, ingresos: 0 };
      actual.unidades += it.cantidad;
      actual.ingresos += it.subtotal;
      mapa.set(it.nombre, actual);
    }
  }

  // Totales generales (sobre TODOS los productos, no solo el top)
  let totalUnidades = 0;
  let totalIngresos = 0;
  for (const v of mapa.values()) {
    totalUnidades += v.unidades;
    totalIngresos += v.ingresos;
  }

  const ranking: ProductoRanking[] = [];
  for (const [nombre, v] of mapa.entries()) {
    ranking.push({
      nombre,
      unidades: v.unidades,
      ingresos: v.ingresos,
      pctUnidades: totalUnidades > 0 ? (v.unidades / totalUnidades) * 100 : 0,
      pctIngresos: totalIngresos > 0 ? (v.ingresos / totalIngresos) * 100 : 0,
    });
  }

  ranking.sort((a, b) => b.unidades - a.unidades);
  return ranking.slice(0, TOP_N_PRODUCTOS);
}

/* ============= Pedidos por sesion (timeline de visitas con items agregados) ============= */

type SesionConPedidos = {
  sesionId: string;
  fecha: string; // primera comanda de la sesion
  mesaNumero: string;
  cliente: string;
  cantidadComandas: number;
  totalSesion: number;
  items: Array<{
    nombre: string;
    cantidad: number;
    subtotal: number;
  }>;
};

/**
 * Agrupa las comandas del reporte por sesionId. Para cada sesion calcula:
 * total, cantidad de comandas, y agrega los items duplicados (si pidieron
 * 2 cafes en 2 comandas distintas de la misma sesion -> "Cafe x4").
 * Devuelve la lista ordenada por fecha ascendente (timeline cronologico).
 */
function calcularPedidosPorSesion(data: DatosReporte): SesionConPedidos[] {
  const mapaSesiones = new Map<string, DatosReporte['comandas']>();

  for (const c of data.comandas) {
    const arr = mapaSesiones.get(c.sesionId) ?? [];
    arr.push(c);
    mapaSesiones.set(c.sesionId, arr);
  }

  const resultado: SesionConPedidos[] = [];

  for (const [sesionId, comandas] of mapaSesiones.entries()) {
    const ordenadas = [...comandas].sort((a, b) => a.fecha.localeCompare(b.fecha));
    const primera = ordenadas[0];
    if (!primera) continue;

    const mapaItems = new Map<string, { cantidad: number; subtotal: number }>();
    for (const c of ordenadas) {
      for (const it of c.items) {
        const actual = mapaItems.get(it.nombre) ?? { cantidad: 0, subtotal: 0 };
        actual.cantidad += it.cantidad;
        actual.subtotal += it.subtotal;
        mapaItems.set(it.nombre, actual);
      }
    }

    const items = Array.from(mapaItems.entries())
      .map(([nombre, v]) => ({ nombre, cantidad: v.cantidad, subtotal: v.subtotal }))
      .sort((a, b) => b.cantidad - a.cantidad);

    const totalSesion = ordenadas.reduce((acc, c) => acc + c.total, 0);

    resultado.push({
      sesionId,
      fecha: primera.fecha,
      mesaNumero: primera.mesaNumero,
      cliente: primera.cliente,
      cantidadComandas: ordenadas.length,
      totalSesion,
      items,
    });
  }

  resultado.sort((a, b) => a.fecha.localeCompare(b.fecha));
  return resultado;
}

/* ============= CSV (4 archivos: sesiones + comandas + productos + pedidos-por-sesion) ============= */

export function exportarCSV(data: DatosReporte): void {
  // Archivo 1: sesiones con encabezado de resumen
  const filasSesiones: (string | number)[][] = [
    [`Reporte: ${data.restaurante.nombre}`],
    [`Periodo: ${data.rango.desde} a ${data.rango.hasta}`],
    [`Generado: ${formatearFechaCorta(new Date().toISOString())}`],
    [],
    ['RESUMEN'],
    ['Total facturado', data.resumen.totalFacturado],
    ['Propinas totales', data.resumen.propinasTotal],
    ['Cantidad de sesiones', data.resumen.cantidadSesiones],
    ['Cantidad de comandas', data.resumen.cantidadComandas],
    ['Ticket promedio', data.resumen.ticketPromedio],
    [],
    ['SESIONES'],
    ['Fecha', 'Mesa', 'Cantidad de comandas', 'Total', 'Propina', 'Metodo'],
    ...data.sesiones.map((s) => [
      formatearFechaCorta(s.fecha),
      s.mesaNumero,
      s.cantidadComandas,
      s.total,
      s.propina,
      etiquetaMetodo(s.metodo),
    ]),
  ];

  const csvSesiones = filasACsv(filasSesiones);
  descargar(
    new Blob(['\uFEFF' + csvSesiones], { type: 'text/csv;charset=utf-8' }),
    `${nombreBase(data)}-sesiones.csv`,
  );

  // Archivo 2: comandas con sus items aplanados
  const filasComandas: (string | number)[][] = [
    [`Reporte: ${data.restaurante.nombre} - Comandas detalladas`],
    [`Periodo: ${data.rango.desde} a ${data.rango.hasta}`],
    [],
    [
      'Fecha',
      'Numero diario',
      'Mesa',
      'Cliente',
      'Estado',
      'Producto',
      'Cantidad',
      'Precio unitario',
      'Subtotal',
      'Total comanda',
    ],
  ];

  for (const c of data.comandas) {
    if (c.items.length === 0) {
      filasComandas.push([
        formatearFechaCorta(c.fecha),
        c.numeroDiario,
        c.mesaNumero,
        c.cliente,
        c.estado,
        '(sin items)',
        '',
        '',
        '',
        c.total,
      ]);
    } else {
      c.items.forEach((it, idx) => {
        filasComandas.push([
          formatearFechaCorta(c.fecha),
          c.numeroDiario,
          c.mesaNumero,
          c.cliente,
          c.estado,
          it.nombre,
          it.cantidad,
          it.precio,
          it.subtotal,
          idx === 0 ? c.total : '', // total solo en la primera fila de cada comanda
        ]);
      });
    }
  }

  const csvComandas = filasACsv(filasComandas);
  descargar(
    new Blob(['\uFEFF' + csvComandas], { type: 'text/csv;charset=utf-8' }),
    `${nombreBase(data)}-comandas.csv`,
  );

  // Archivo 3: Top N productos mas vendidos
  const ranking = calcularRankingProductos(data);
  const filasProductos: (string | number)[][] = [
    [`Reporte: ${data.restaurante.nombre} - Top ${TOP_N_PRODUCTOS} productos mas vendidos`],
    [`Periodo: ${data.rango.desde} a ${data.rango.hasta}`],
    [],
    ['Posicion', 'Producto', 'Unidades', 'Ingresos', '% unidades', '% ingresos'],
  ];

  if (ranking.length === 0) {
    filasProductos.push(['', '(sin productos vendidos en el periodo)', '', '', '', '']);
  } else {
    ranking.forEach((p, idx) => {
      filasProductos.push([
        idx + 1,
        p.nombre,
        p.unidades,
        p.ingresos,
        `${p.pctUnidades.toFixed(1)}%`,
        `${p.pctIngresos.toFixed(1)}%`,
      ]);
    });
  }

  const csvProductos = filasACsv(filasProductos);
  descargar(
    new Blob(['\uFEFF' + csvProductos], { type: 'text/csv;charset=utf-8' }),
    `${nombreBase(data)}-productos.csv`,
  );

  // Archivo 4: Pedidos por sesion (timeline con items agregados)
  const sesionesConPedidos = calcularPedidosPorSesion(data);
  const filasPedidosSesion: (string | number)[][] = [
    [`Reporte: ${data.restaurante.nombre} - Pedidos por sesion`],
    [`Periodo: ${data.rango.desde} a ${data.rango.hasta}`],
    [],
    [
      'Fecha',
      'Mesa',
      'Cliente',
      'Comandas',
      'Total sesion',
      'Producto',
      'Cantidad',
      'Subtotal',
    ],
  ];

  if (sesionesConPedidos.length === 0) {
    filasPedidosSesion.push(['', '', '', '', '', '(sin sesiones en el periodo)', '', '']);
  } else {
    for (const s of sesionesConPedidos) {
      if (s.items.length === 0) {
        filasPedidosSesion.push([
          formatearFechaCorta(s.fecha),
          s.mesaNumero,
          s.cliente,
          s.cantidadComandas,
          s.totalSesion,
          '(sin items)',
          '',
          '',
        ]);
      } else {
        s.items.forEach((it, idx) => {
          filasPedidosSesion.push([
            idx === 0 ? formatearFechaCorta(s.fecha) : '',
            idx === 0 ? s.mesaNumero : '',
            idx === 0 ? s.cliente : '',
            idx === 0 ? s.cantidadComandas : '',
            idx === 0 ? s.totalSesion : '',
            it.nombre,
            it.cantidad,
            it.subtotal,
          ]);
        });
      }
    }
  }

  const csvPedidosSesion = filasACsv(filasPedidosSesion);
  descargar(
    new Blob(['\uFEFF' + csvPedidosSesion], { type: 'text/csv;charset=utf-8' }),
    `${nombreBase(data)}-pedidos-por-sesion.csv`,
  );
}

/* ============= EXCEL (1 archivo, 4 hojas) ============= */

export function exportarExcel(data: DatosReporte): void {
  const wb = XLSX.utils.book_new();

  // Hoja 1: Resumen + sesiones
  const hojaSesionesData: (string | number)[][] = [
    [`Reporte: ${data.restaurante.nombre}`],
    [`Periodo: ${data.rango.desde} a ${data.rango.hasta}`],
    [`Generado: ${formatearFechaCorta(new Date().toISOString())}`],
    [],
    ['RESUMEN'],
    ['Total facturado', data.resumen.totalFacturado],
    ['Propinas totales', data.resumen.propinasTotal],
    ['Cantidad de sesiones', data.resumen.cantidadSesiones],
    ['Cantidad de comandas', data.resumen.cantidadComandas],
    ['Ticket promedio', data.resumen.ticketPromedio],
    [],
    ['SESIONES'],
    ['Fecha', 'Mesa', 'Cantidad de comandas', 'Total', 'Propina', 'Metodo'],
    ...data.sesiones.map((s) => [
      formatearFechaCorta(s.fecha),
      s.mesaNumero,
      s.cantidadComandas,
      s.total,
      s.propina,
      etiquetaMetodo(s.metodo),
    ]),
  ];
  const hojaSesiones = XLSX.utils.aoa_to_sheet(hojaSesionesData);

  // Ajuste de anchos
  hojaSesiones['!cols'] = [
    { wch: 18 }, // Fecha
    { wch: 8 }, // Mesa
    { wch: 22 }, // Cantidad comandas
    { wch: 14 }, // Total
    { wch: 12 }, // Propina
    { wch: 16 }, // Metodo
  ];

  XLSX.utils.book_append_sheet(wb, hojaSesiones, 'Resumen y sesiones');

  // Hoja 2: Comandas con items
  const hojaComandasData: (string | number)[][] = [
    [
      'Fecha',
      'Numero diario',
      'Mesa',
      'Cliente',
      'Estado',
      'Producto',
      'Cantidad',
      'Precio unitario',
      'Subtotal',
      'Total comanda',
    ],
  ];

  for (const c of data.comandas) {
    if (c.items.length === 0) {
      hojaComandasData.push([
        formatearFechaCorta(c.fecha),
        c.numeroDiario,
        c.mesaNumero,
        c.cliente,
        c.estado,
        '(sin items)',
        '',
        '',
        '',
        c.total,
      ]);
    } else {
      c.items.forEach((it, idx) => {
        hojaComandasData.push([
          formatearFechaCorta(c.fecha),
          c.numeroDiario,
          c.mesaNumero,
          c.cliente,
          c.estado,
          it.nombre,
          it.cantidad,
          it.precio,
          it.subtotal,
          idx === 0 ? c.total : '',
        ]);
      });
    }
  }
  const hojaComandas = XLSX.utils.aoa_to_sheet(hojaComandasData);
  hojaComandas['!cols'] = [
    { wch: 18 }, // Fecha
    { wch: 14 }, // Numero
    { wch: 8 }, // Mesa
    { wch: 18 }, // Cliente
    { wch: 12 }, // Estado
    { wch: 28 }, // Producto
    { wch: 10 }, // Cantidad
    { wch: 14 }, // Precio
    { wch: 14 }, // Subtotal
    { wch: 14 }, // Total comanda
  ];

  XLSX.utils.book_append_sheet(wb, hojaComandas, 'Comandas detalladas');

  // Hoja 3: Top N productos mas vendidos
  const ranking = calcularRankingProductos(data);
  const hojaProductosData: (string | number)[][] = [
    [`Top ${TOP_N_PRODUCTOS} productos mas vendidos`],
    [`Periodo: ${data.rango.desde} a ${data.rango.hasta}`],
    [],
    ['Posicion', 'Producto', 'Unidades', 'Ingresos', '% unidades', '% ingresos'],
  ];

  if (ranking.length === 0) {
    hojaProductosData.push(['', '(sin productos vendidos en el periodo)', '', '', '', '']);
  } else {
    ranking.forEach((p, idx) => {
      hojaProductosData.push([
        idx + 1,
        p.nombre,
        p.unidades,
        p.ingresos,
        Number(p.pctUnidades.toFixed(1)),
        Number(p.pctIngresos.toFixed(1)),
      ]);
    });
  }

  const hojaProductos = XLSX.utils.aoa_to_sheet(hojaProductosData);
  hojaProductos['!cols'] = [
    { wch: 10 }, // Posicion
    { wch: 28 }, // Producto
    { wch: 10 }, // Unidades
    { wch: 14 }, // Ingresos
    { wch: 12 }, // % unidades
    { wch: 12 }, // % ingresos
  ];
  XLSX.utils.book_append_sheet(wb, hojaProductos, 'Top productos');

  // Hoja 4: Pedidos por sesion (timeline con items agregados)
  const sesionesConPedidos = calcularPedidosPorSesion(data);
  const hojaPedidosSesionData: (string | number)[][] = [
    [
      'Fecha',
      'Mesa',
      'Cliente',
      'Comandas',
      'Total sesion',
      'Producto',
      'Cantidad',
      'Subtotal',
    ],
  ];

  if (sesionesConPedidos.length === 0) {
    hojaPedidosSesionData.push(['', '', '', '', '', '(sin sesiones en el periodo)', '', '']);
  } else {
    for (const s of sesionesConPedidos) {
      if (s.items.length === 0) {
        hojaPedidosSesionData.push([
          formatearFechaCorta(s.fecha),
          s.mesaNumero,
          s.cliente,
          s.cantidadComandas,
          s.totalSesion,
          '(sin items)',
          '',
          '',
        ]);
      } else {
        s.items.forEach((it, idx) => {
          hojaPedidosSesionData.push([
            idx === 0 ? formatearFechaCorta(s.fecha) : '',
            idx === 0 ? s.mesaNumero : '',
            idx === 0 ? s.cliente : '',
            idx === 0 ? s.cantidadComandas : '',
            idx === 0 ? s.totalSesion : '',
            it.nombre,
            it.cantidad,
            it.subtotal,
          ]);
        });
      }
    }
  }

  const hojaPedidosSesion = XLSX.utils.aoa_to_sheet(hojaPedidosSesionData);
  hojaPedidosSesion['!cols'] = [
    { wch: 18 }, // Fecha
    { wch: 8 },  // Mesa
    { wch: 18 }, // Cliente
    { wch: 10 }, // Comandas
    { wch: 14 }, // Total sesion
    { wch: 28 }, // Producto
    { wch: 10 }, // Cantidad
    { wch: 14 }, // Subtotal
  ];
  XLSX.utils.book_append_sheet(wb, hojaPedidosSesion, 'Pedidos por sesion');

  // Generar y descargar
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  descargar(
    new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `${nombreBase(data)}.xlsx`,
  );
}

/* ============= PDF (con jspdf-autotable) ============= */

export function exportarPDF(data: DatosReporte): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margenIzq = 40;
  let yPos = 50;

  // Encabezado
  doc.setFontSize(18);
  doc.text(data.restaurante.nombre, margenIzq, yPos);
  yPos += 18;
  doc.setFontSize(11);
  doc.setTextColor(100);
  doc.text(
    `Reporte del ${data.rango.desde} al ${data.rango.hasta}`,
    margenIzq,
    yPos,
  );
  yPos += 14;
  doc.setFontSize(9);
  doc.text(
    `Generado: ${formatearFechaCorta(new Date().toISOString())}`,
    margenIzq,
    yPos,
  );
  yPos += 24;
  doc.setTextColor(0);

  // Resumen como tabla 2 columnas
  doc.setFontSize(13);
  doc.text('Resumen', margenIzq, yPos);
  yPos += 8;

  autoTable(doc, {
    startY: yPos,
    head: [['Concepto', 'Valor']],
    body: [
      ['Total facturado', `$${data.resumen.totalFacturado.toLocaleString('es-CO')}`],
      ['Propinas totales', `$${data.resumen.propinasTotal.toLocaleString('es-CO')}`],
      ['Cantidad de sesiones', String(data.resumen.cantidadSesiones)],
      ['Cantidad de comandas', String(data.resumen.cantidadComandas)],
      ['Ticket promedio', `$${data.resumen.ticketPromedio.toLocaleString('es-CO')}`],
    ],
    theme: 'striped',
    headStyles: { fillColor: [60, 60, 60] },
    styles: { fontSize: 10 },
    margin: { left: margenIzq, right: margenIzq },
  });

  // Sesiones
  // @ts-expect-error - lastAutoTable es agregado en runtime
  yPos = (doc.lastAutoTable?.finalY ?? yPos) + 30;
  doc.setFontSize(13);
  doc.text('Sesiones', margenIzq, yPos);
  yPos += 8;

  autoTable(doc, {
    startY: yPos,
    head: [['Fecha', 'Mesa', 'Comandas', 'Total', 'Propina', 'Metodo']],
    body: data.sesiones.map((s) => [
      formatearFechaCorta(s.fecha),
      s.mesaNumero,
      String(s.cantidadComandas),
      `$${s.total.toLocaleString('es-CO')}`,
      `$${s.propina.toLocaleString('es-CO')}`,
      etiquetaMetodo(s.metodo),
    ]),
    theme: 'striped',
    headStyles: { fillColor: [60, 60, 60] },
    styles: { fontSize: 9 },
    margin: { left: margenIzq, right: margenIzq },
  });

  // Top productos en pagina nueva
  doc.addPage();
  yPos = 50;
  doc.setFontSize(13);
  doc.text(`Top ${TOP_N_PRODUCTOS} productos mas vendidos`, margenIzq, yPos);
  yPos += 8;

  const ranking = calcularRankingProductos(data);
  const filasProductos: string[][] = ranking.length === 0
    ? [['', '(sin productos vendidos en el periodo)', '', '', '', '']]
    : ranking.map((p, idx) => [
        String(idx + 1),
        p.nombre,
        String(p.unidades),
        `$${p.ingresos.toLocaleString('es-CO')}`,
        `${p.pctUnidades.toFixed(1)}%`,
        `${p.pctIngresos.toFixed(1)}%`,
      ]);

  autoTable(doc, {
    startY: yPos,
    head: [['#', 'Producto', 'Unidades', 'Ingresos', '% unid.', '% ingr.']],
    body: filasProductos,
    theme: 'striped',
    headStyles: { fillColor: [60, 60, 60] },
    styles: { fontSize: 10 },
    margin: { left: margenIzq, right: margenIzq },
  });

  // Pedidos por sesion en pagina nueva
  doc.addPage();
  yPos = 50;
  doc.setFontSize(13);
  doc.text('Pedidos por sesion', margenIzq, yPos);
  yPos += 16;

  const sesionesConPedidos = calcularPedidosPorSesion(data);

  if (sesionesConPedidos.length === 0) {
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text('(sin sesiones en el periodo)', margenIzq, yPos);
    doc.setTextColor(0);
  } else {
    const pageHeight = doc.internal.pageSize.getHeight();
    const margenInf = 40;

    for (const s of sesionesConPedidos) {
      // Si no queda espacio para sub-header + tabla minima, saltar de pagina
      if (yPos + 80 > pageHeight - margenInf) {
        doc.addPage();
        yPos = 50;
      }

      // Sub-header de la sesion
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      const partes = [
        formatearFechaCorta(s.fecha),
        `Mesa ${s.mesaNumero}`,
      ];
      if (s.cliente) partes.push(s.cliente);
      partes.push(`${s.cantidadComandas} ${s.cantidadComandas === 1 ? 'comanda' : 'comandas'}`);
      partes.push(`Total $${s.totalSesion.toLocaleString('es-CO')}`);
      doc.text(partes.join(' - '), margenIzq, yPos);
      doc.setFont('helvetica', 'normal');
      yPos += 6;

      // Tabla de items de la sesion
      const filasItems = s.items.length === 0
        ? [['(sin items)', '', '']]
        : s.items.map((it) => [
            it.nombre,
            String(it.cantidad),
            `$${it.subtotal.toLocaleString('es-CO')}`,
          ]);

      autoTable(doc, {
        startY: yPos,
        head: [['Producto', 'Cantidad', 'Subtotal']],
        body: filasItems,
        theme: 'striped',
        headStyles: { fillColor: [60, 60, 60] },
        styles: { fontSize: 9 },
        margin: { left: margenIzq, right: margenIzq },
      });

      // @ts-expect-error - lastAutoTable es agregado en runtime
      yPos = (doc.lastAutoTable?.finalY ?? yPos) + 14;
    }
  }

  // Comandas con items en pagina nueva
  doc.addPage();
  yPos = 50;
  doc.setFontSize(13);
  doc.text('Comandas detalladas', margenIzq, yPos);
  yPos += 8;

  const filasComandas: string[][] = [];
  for (const c of data.comandas) {
    if (c.items.length === 0) {
      filasComandas.push([
        formatearFechaCorta(c.fecha),
        String(c.numeroDiario),
        c.mesaNumero,
        c.cliente,
        '(sin items)',
        '',
        '',
        `$${c.total.toLocaleString('es-CO')}`,
      ]);
    } else {
      c.items.forEach((it, idx) => {
        filasComandas.push([
          idx === 0 ? formatearFechaCorta(c.fecha) : '',
          idx === 0 ? String(c.numeroDiario) : '',
          idx === 0 ? c.mesaNumero : '',
          idx === 0 ? c.cliente : '',
          it.nombre,
          String(it.cantidad),
          `$${it.subtotal.toLocaleString('es-CO')}`,
          idx === 0 ? `$${c.total.toLocaleString('es-CO')}` : '',
        ]);
      });
    }
  }

  autoTable(doc, {
    startY: yPos,
    head: [
      [
        'Fecha',
        'No.',
        'Mesa',
        'Cliente',
        'Producto',
        'Cant',
        'Subtotal',
        'Total',
      ],
    ],
    body: filasComandas,
    theme: 'striped',
    headStyles: { fillColor: [60, 60, 60] },
    styles: { fontSize: 8 },
    margin: { left: margenIzq, right: margenIzq },
  });

  doc.save(`${nombreBase(data)}.pdf`);
}
