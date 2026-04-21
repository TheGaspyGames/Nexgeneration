'use strict';

/**
 * @fileoverview Logger centralizado con niveles, colores ANSI y timestamps.
 * Reemplaza todos los console.log/warn/error directos del proyecto.
 *
 * Niveles disponibles (de menor a mayor severidad):
 *   DEBUG < INFO < WARN < ERROR
 *
 * Uso:
 *   const logger = require('./logger');
 *   logger.info('[MongoDB]', 'Conexión establecida');
 *   logger.warn('[Uptime]', 'Heartbeat tardó demasiado');
 *   logger.error('[Discord]', 'Token inválido', error);
 *   logger.debug('[Cache]', 'Hit en channelCache', { id: '123' });
 */

// ── Colores ANSI ──────────────────────────────────────────────────────────────
const COLORES = {
    reset:   '\x1b[0m',
    negrita: '\x1b[1m',
    tenue:   '\x1b[2m',
    // Texto
    cian:    '\x1b[36m',
    verde:   '\x1b[32m',
    amarillo:'\x1b[33m',
    rojo:    '\x1b[31m',
    magenta: '\x1b[35m',
    blanco:  '\x1b[37m',
    gris:    '\x1b[90m',
};

// ── Niveles de log ────────────────────────────────────────────────────────────
const NIVELES = {
    DEBUG: 0,
    INFO:  1,
    WARN:  2,
    ERROR: 3,
};

/**
 * Lee el nivel mínimo desde la variable de entorno LOG_LEVEL.
 * Por defecto es INFO en producción y DEBUG en desarrollo.
 * @returns {number}
 */
function resolverNivelMinimo() {
    const env = (process.env.LOG_LEVEL || '').toUpperCase();
    if (env in NIVELES) return NIVELES[env];
    return process.env.NODE_ENV === 'development' ? NIVELES.DEBUG : NIVELES.INFO;
}

// ── Formato de timestamp ──────────────────────────────────────────────────────
/**
 * Devuelve la hora actual formateada como HH:MM:SS.
 * @returns {string}
 */
function timestamp() {
    const ahora = new Date();
    const h = String(ahora.getHours()).padStart(2, '0');
    const m = String(ahora.getMinutes()).padStart(2, '0');
    const s = String(ahora.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
}

// ── Utilidad para serializar extras ──────────────────────────────────────────
/**
 * Convierte un valor extra (objeto, Error, string) en texto legible.
 * @param {*} extra
 * @returns {string}
 */
function serializarExtra(extra) {
    if (extra === undefined || extra === null) return '';
    if (extra instanceof Error) {
        return extra.stack || extra.message;
    }
    if (typeof extra === 'object') {
        try {
            return JSON.stringify(extra, null, 2);
        } catch {
            return String(extra);
        }
    }
    return String(extra);
}

// ── Núcleo del logger ─────────────────────────────────────────────────────────
const nivelMinimo = resolverNivelMinimo();

/**
 * Imprime un mensaje con el nivel, timestamp, prefijo y contexto indicados.
 *
 * @param {'DEBUG'|'INFO'|'WARN'|'ERROR'} nivel   - Nivel del mensaje.
 * @param {string}                         prefijo - Etiqueta del módulo, p.ej. '[MongoDB]'.
 * @param {string}                         mensaje - Texto principal.
 * @param {*}                             [extra]  - Dato adicional (objeto, Error, string).
 */
function log(nivel, prefijo, mensaje, extra) {
    if (NIVELES[nivel] < nivelMinimo) return;

    const coloresNivel = {
        DEBUG: COLORES.magenta,
        INFO:  COLORES.cian,
        WARN:  COLORES.amarillo,
        ERROR: COLORES.rojo,
    };

    const flechas = {
        DEBUG: '·',
        INFO:  '›',
        WARN:  '⚠',
        ERROR: '✖',
    };

    const color     = coloresNivel[nivel] || COLORES.blanco;
    const flecha    = flechas[nivel] || '>';
    const ts        = `${COLORES.gris}${timestamp()}${COLORES.reset}`;
    const etiqueta  = `${color}${COLORES.negrita}${flecha} ${nivel.padEnd(5)}${COLORES.reset}`;
    const tag       = prefijo ? `${COLORES.tenue}${prefijo}${COLORES.reset} ` : '';
    const texto     = `${COLORES.blanco}${mensaje}${COLORES.reset}`;

    const linea = `${ts} ${etiqueta} ${tag}${texto}`;

    if (nivel === 'ERROR') {
        process.stderr.write(linea + '\n');
    } else {
        process.stdout.write(linea + '\n');
    }

    if (extra !== undefined && extra !== null) {
        const extraTexto = serializarExtra(extra);
        if (extraTexto) {
            const indent = '             '; // alineado con el mensaje
            const lineas = extraTexto.split('\n').map(l => `${indent}${COLORES.gris}${l}${COLORES.reset}`);
            if (nivel === 'ERROR') {
                process.stderr.write(lineas.join('\n') + '\n');
            } else {
                process.stdout.write(lineas.join('\n') + '\n');
            }
        }
    }
}

// ── API pública ───────────────────────────────────────────────────────────────
const logger = {
    /**
     * Mensaje de depuración (solo visible con LOG_LEVEL=DEBUG o en desarrollo).
     * @param {string} prefijo
     * @param {string} mensaje
     * @param {*}     [extra]
     */
    debug: (prefijo, mensaje, extra) => log('DEBUG', prefijo, mensaje, extra),

    /**
     * Mensaje informativo normal.
     * @param {string} prefijo
     * @param {string} mensaje
     * @param {*}     [extra]
     */
    info: (prefijo, mensaje, extra) => log('INFO', prefijo, mensaje, extra),

    /**
     * Advertencia: algo inesperado pero no crítico.
     * @param {string} prefijo
     * @param {string} mensaje
     * @param {*}     [extra]
     */
    warn: (prefijo, mensaje, extra) => log('WARN', prefijo, mensaje, extra),

    /**
     * Error: algo falló y requiere atención.
     * @param {string} prefijo
     * @param {string} mensaje
     * @param {*}     [extra]
     */
    error: (prefijo, mensaje, extra) => log('ERROR', prefijo, mensaje, extra),

    /** Nivel mínimo activo (útil para diagnóstico). */
    nivelActivo: Object.keys(NIVELES).find(k => NIVELES[k] === nivelMinimo) || 'INFO',
};

module.exports = logger;
