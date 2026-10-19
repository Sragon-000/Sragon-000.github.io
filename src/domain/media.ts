const videoIdPattern = /^[A-Za-z0-9_-]{11}$/;
export function normalizeYouTube(input: string): string | null {
  const value = input.trim();
  if (videoIdPattern.test(value)) return value;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port)
    return null;
  let id: string | null = null;
  if (url.hostname === 'youtu.be') {
    if (url.pathname.split('/').length === 2) id = url.pathname.slice(1);
  } else if (
    [
      'youtube.com',
      'www.youtube.com',
      'm.youtube.com',
      'youtube-nocookie.com',
      'www.youtube-nocookie.com',
    ].includes(url.hostname)
  ) {
    if (url.pathname === '/watch' && !url.hostname.includes('nocookie'))
      id = url.searchParams.getAll('v').length === 1 ? url.searchParams.get('v') : null;
    else {
      const match = /^\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname);
      id = match?.[1] ?? null;
    }
  }
  return id && videoIdPattern.test(id) ? id : null;
}
export const youtubeLink = (id: string) => `https://www.youtube.com/watch?v=${id}`;
