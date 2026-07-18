/**
 * How long after posting a comment its author may still edit it. Deleting has no time limit
 * (allowed at any time by the author), so there's no matching delete-window constant here —
 * see database/add-post-comment-edit-delete.sql for the server-side guard trigger that enforces
 * this same window on the database side, independent of this client-side check.
 */
export const COMMENT_EDIT_WINDOW_MS = 15 * 60 * 1000;

export function canEditComment(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() <= COMMENT_EDIT_WINDOW_MS;
}
