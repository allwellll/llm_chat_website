const SESSION_ID = /^[A-Za-z0-9_-]{1,180}$/;

export function sessionIdFromPath(pathname: string = window.location.pathname): string | null {
  if (pathname.endsWith('/')) return null;
  const match = pathname.match(/\/([^/]+)$/);
  const id = match?.[1] || '';
  return SESSION_ID.test(id) ? id : null;
}

export function sessionPath(id: string, pathname: string = window.location.pathname): string {
  if (!SESSION_ID.test(id)) throw new Error('Invalid conversation id');
  const currentId = sessionIdFromPath(pathname);
  const root = currentId ? pathname.slice(0, pathname.lastIndexOf(`/${currentId}`) + 1) : (pathname.endsWith('/') ? pathname : `${pathname}/`);
  return `${root}${encodeURIComponent(id)}`;
}

export function conversationRootPath(pathname: string = window.location.pathname): string {
  const id = sessionIdFromPath(pathname);
  return id ? pathname.slice(0, pathname.lastIndexOf(`/${id}`) + 1) : (pathname.endsWith('/') ? pathname : `${pathname}/`);
}
