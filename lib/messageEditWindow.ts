export const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;
export const MESSAGE_DELETE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function canEditMessage(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() <= MESSAGE_EDIT_WINDOW_MS;
}

export function canDeleteMessage(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() <= MESSAGE_DELETE_WINDOW_MS;
}
