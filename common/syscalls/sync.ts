import { SysCallMapping, System } from "../../plugos/system.ts";
import type { SyncEndpoint } from "../../plug-api/silverbullet-syscall/sync.ts";
import { SpaceSync, SyncStatusItem } from "../spaces/sync.ts";
import { HttpSpacePrimitives } from "../spaces/http_space_primitives.ts";
import { SpacePrimitives } from "../spaces/space_primitives.ts";
import { race, timeout } from "../async_util.ts";

export function syncSyscalls(
  localSpace: SpacePrimitives,
  system: System<any>,
): SysCallMapping {
  return {
    "sync.sync": async (
      _ctx,
      endpoint: SyncEndpoint,
      snapshot: Record<string, SyncStatusItem>,
    ): Promise<
      {
        snapshot: Record<string, SyncStatusItem>;
        operations: number;
        // The reason to not just throw an Error is so that the partially updated snapshot can still be saved
        error?: string;
      }
    > => {
      const syncSpace = new HttpSpacePrimitives(
        endpoint.url,
        endpoint.user,
        endpoint.password,
        // Base64 PUTs to support mobile
        true,
      );
      // Convert from JSON to a Map
      const syncStatusMap = new Map<string, SyncStatusItem>(
        Object.entries(snapshot),
      );
      const spaceSync = new SpaceSync(
        localSpace,
        syncSpace,
        syncStatusMap,
        // Log to the "sync" plug sandbox
        system.loadedPlugs.get("sync")!.sandbox!,
      );

      try {
        const operations = await spaceSync.syncFiles(
          SpaceSync.primaryConflictResolver,
        );
        return {
          // And convert back to JSON
          snapshot: Object.fromEntries(spaceSync.snapshot),
          operations,
        };
      } catch (e: any) {
        return {
          snapshot: Object.fromEntries(spaceSync.snapshot),
          operations: -1,
          error: e.message,
        };
      }
    },
    "sync.check": async (_ctx, endpoint: SyncEndpoint): Promise<void> => {
      const syncSpace = new HttpSpacePrimitives(
        endpoint.url,
        endpoint.user,
        endpoint.password,
      );
      // Let's just fetch the file list to see if it works with a timeout of 5s
      try {
        await race([syncSpace.fetchFileList(), timeout(5000)]);
      } catch (e: any) {
        console.error("Sync check failure", e.message);
        throw e;
      }
    },
  };
}
