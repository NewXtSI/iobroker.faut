/**
 * Sends a log message via socket.sendTo to the adapter backend.
 * The backend routes it to the appropriate log helper (respecting the log flag).
 * Falls back to console.error on failure.
 */
export function iobLog(
    socket: any,
    adapterName: string,
    instance: number,
    flag: string,
    text: string,
): void {
    try {
        socket.sendTo(`${adapterName}.${instance}`, 'log', { flag, text });
    } catch (e) {
        console.error(`[${flag}] ${text}`, e);
    }
}
