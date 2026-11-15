// Shared by the compiled runtime and the standalone Claude mod.
export const minimumOfferWindow = 700_000;
export const tokenCount = (n) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
export function contextStatus(reading, startup) {
    const window = reading?.window ?? null;
    const occupied = reading?.occupied ?? null;
    return {
        window, occupied, source: reading?.source ?? null, model: reading?.model ?? null, startup,
        initialRunway: window !== null && startup !== null ? Math.max(0, window - startup.tokens) : null,
        runway: window !== null && occupied !== null ? Math.max(0, window - occupied) : null,
        eligible: window === null ? null : window >= minimumOfferWindow,
        minimumOfferWindow,
    };
}
