let galleryReturn: { scroll: number; projectId: string } | null = null;
export function rememberGallery(projectId: string) {
  detailOrigin = null;
  galleryReturn = { scroll: window.scrollY, projectId };
}
export function resetGalleryReturn() {
  galleryReturn = null;
}
export function restoreGallery() {
  // Keep the return location across development StrictMode's repeated effects
  // and browser back/forward. A new card selection or preview session resets it.
  const saved = galleryReturn;
  if (!saved) return false;
  window.scrollTo({ top: saved.scroll, behavior: 'instant' });
  document.getElementById(`card-${saved.projectId}`)?.focus({ preventScroll: true });
  return true;
}
export function jumpTo(id: string) {
  const target = document.getElementById(id);
  target?.scrollIntoView({ behavior: 'instant', block: 'start' });
  target?.focus({ preventScroll: true });
}

let detailSection: { slug: string; target: string } | null = null;
export function rememberDetailSection(slug: string, target: string) {
  detailSection = { slug, target };
}
export function restoreDetailSection(slug: string) {
  const next = detailSection;
  detailSection = null;
  if (next?.slug !== slug) return false;
  jumpTo(next.target);
  return true;
}

let detailOrigin: string | null = null;
export function rememberExhibition(sourceKey: string) {
  detailOrigin = sourceKey;
}
export function detailReturn(sourceKey: string) {
  return detailOrigin === sourceKey
    ? { href: '#/exhibition', label: '전시장으로 돌아가기 ↗' }
    : { href: '#/gallery', label: '갤러리로 돌아가기 ↗' };
}
