import { disableTunnelAndPersist } from "./tunnelStateFacade";

export async function disableTunnelAccess() {
  return disableTunnelAndPersist();
}
