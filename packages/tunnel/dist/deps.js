let _deps = null;
export function configureTunnelDeps(deps) {
    _deps = deps;
}
export function getTunnelDeps() {
    if (!_deps)
        throw new Error("Tunnel deps not configured. Call configureTunnelDeps() first.");
    return _deps;
}
