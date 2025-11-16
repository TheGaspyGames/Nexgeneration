const tabletSuggestions = new Map();

function normalizeId(id) {
    const numeric = Number(id);
    return Number.isNaN(numeric) ? null : numeric;
}

function rememberTabletSuggestion(payload = {}) {
    const normalizedId = normalizeId(payload.id);
    if (normalizedId === null) {
        return null;
    }

    const entry = {
        ...payload,
        id: normalizedId,
        origin: 'tablet',
        storedAt: payload.storedAt || Date.now(),
        updatedAt: Date.now(),
    };

    tabletSuggestions.set(normalizedId, entry);
    return entry;
}

function getTabletSuggestion(id) {
    const normalizedId = normalizeId(id);
    if (normalizedId === null) return null;
    return tabletSuggestions.get(normalizedId) || null;
}

function updateTabletSuggestion(id, updates = {}) {
    const normalizedId = normalizeId(id);
    if (normalizedId === null) return null;
    const current = tabletSuggestions.get(normalizedId);
    if (!current) return null;

    const updated = {
        ...current,
        ...updates,
        updatedAt: Date.now(),
    };
    tabletSuggestions.set(normalizedId, updated);
    return updated;
}

function forgetTabletSuggestion(id) {
    const normalizedId = normalizeId(id);
    if (normalizedId === null) return false;
    return tabletSuggestions.delete(normalizedId);
}

module.exports = {
    rememberTabletSuggestion,
    getTabletSuggestion,
    updateTabletSuggestion,
    forgetTabletSuggestion,
};
