import { WorkspaceController } from './controller';
import { siteKey, WorkspaceStore } from './workspaces';
// Preserve the live controller, including queued saves and unsaved input, during
// development hot replacement. A full reload restores the IndexedDB snapshot.
let controller: WorkspaceController | undefined = import.meta.hot?.data.controller;
if (controller) {
  Object.setPrototypeOf(controller, WorkspaceController.prototype);
  controller.refreshStorePrototype(WorkspaceStore.prototype);
}
let unloadHandler: ((event: BeforeUnloadEvent) => void) | undefined;
export function getWorkspaceController() {
  controller ??= new WorkspaceController(
    new WorkspaceStore(),
    siteKey(location.origin, import.meta.env.BASE_URL),
  );
  if (!unloadHandler) {
    unloadHandler = (event) => {
      if (controller?.getSnapshot().ready && controller.dirty()) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', unloadHandler);
  }
  return controller;
}
if (import.meta.hot)
  import.meta.hot.dispose((data) => {
    data.controller = controller;
    if (unloadHandler) window.removeEventListener('beforeunload', unloadHandler);
  });
if (import.meta.hot)
  import.meta.hot.accept((next) => {
    next?.getWorkspaceController();
  });
