import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { toast } from "sonner";

import type { Repository } from "@/features/projects/hooks";
import {
  linkProjectLocalCheckout,
  listProjectLocalCheckouts,
  pickDirectory,
  unlinkProjectLocalCheckout,
} from "@/shared/api/projectGit";

export const projectLocalCheckoutsQueryKey = [
  "projects",
  "local-checkouts",
] as const;

/** Every repository the user has pointed at a folder on this machine. */
export function useProjectLocalCheckoutsQuery() {
  return useQuery({
    queryKey: projectLocalCheckoutsQueryKey,
    queryFn: listProjectLocalCheckouts,
    staleTime: 30_000,
  });
}

/**
 * Binds a repository to an existing checkout the user picks in the OS folder
 * dialog, and drops that binding again.
 *
 * Buzz otherwise only finds checkouts it cloned itself, by name under the
 * repos root, so a developer who already had the repository at some arbitrary
 * path had no way to point the app at it. Linking rewires every local surface
 * at once — snapshots, diffs, sync status, push, terminal — because they all
 * resolve through the same backend lookup.
 */
export function useProjectLocalCheckoutLink(repository: Repository | null) {
  const queryClient = useQueryClient();

  const refreshRepositoryViews = React.useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: projectLocalCheckoutsQueryKey,
      }),
      queryClient.invalidateQueries({ queryKey: ["projects"] }),
      queryClient.invalidateQueries({ queryKey: ["project"] }),
    ]);
  }, [queryClient]);

  const linkMutation = useMutation({
    mutationFn: async () => {
      if (!repository) throw new Error("No repository selected.");
      const picked = await pickDirectory(
        `Locate the ${repository.name} repository`,
      );
      if (picked === null) return null;
      return linkProjectLocalCheckout({
        projectDtag: repository.dtag,
        cloneUrl: repository.cloneUrls[0] ?? null,
        path: picked,
      });
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: async () => {
      if (!repository) throw new Error("No repository selected.");
      await unlinkProjectLocalCheckout(repository.dtag);
    },
  });

  const link = React.useCallback(async () => {
    try {
      const result = await linkMutation.mutateAsync();
      // Null means the user closed the dialog — not an outcome worth a toast.
      if (!result) return;
      await refreshRepositoryViews();
      toast.success(`Using ${result.path}`);
    } catch (error) {
      toast.error("Couldn’t use that folder", {
        description:
          error instanceof Error
            ? error.message
            : "Pick the repository’s top-level folder and try again.",
      });
    }
  }, [linkMutation, refreshRepositoryViews]);

  const unlink = React.useCallback(async () => {
    try {
      await unlinkMutation.mutateAsync();
      await refreshRepositoryViews();
      toast.success("Buzz will no longer use that folder for this repository.");
    } catch (error) {
      toast.error("Couldn’t forget that folder", {
        description:
          error instanceof Error ? error.message : "Try again in a moment.",
      });
    }
  }, [refreshRepositoryViews, unlinkMutation]);

  return {
    link,
    unlink,
    linkPending: linkMutation.isPending,
    unlinkPending: unlinkMutation.isPending,
  };
}
