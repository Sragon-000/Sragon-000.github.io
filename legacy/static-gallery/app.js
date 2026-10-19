(() => {
  const projects = window.portfolioProjects ?? [];
  const grid = document.querySelector('#project-grid');
  const dialog = document.querySelector('#project-dialog');
  const content = document.querySelector('#detail-content');
  let trigger;

  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };
  const safeURL = value => {
    try {
      const url = new URL(value, document.baseURI);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
    } catch { return null; }
  };

  function openProject(project, button) {
    trigger = button;
    content.replaceChildren();
    content.append(element('p', 'detail-number', `EXHIBIT ${project.number} / ${project.category}`));
    const heading = element('h2', 'detail-title', project.title);
    heading.id = 'detail-title';
    content.append(heading, element('p', 'detail-description', project.description));
    const metadata = element('dl', 'detail-metadata');
    for (const [label, value] of [['제작 시기', project.year], ['사용 기술', project.engine], ['담당 역할', project.role], ['팀 구성', project.team]]) {
      const item = element('div');
      item.append(element('dt', '', label), element('dd', '', value || '자료 준비 중'));
      metadata.append(item);
    }
    content.append(metadata);
    const sections = [
      ['01', '프로젝트의 출발점', project.overview, '게임의 장르, 핵심 플레이와 제작 계기를 기록할 자리입니다.'],
      ['02', '내가 맡은 역할', project.contribution, '직접 구현한 기능과 팀 안에서의 기여를 기록할 자리입니다.'],
      ['03', '구현과 문제 해결', project.challenge, '마주한 기술 문제, 선택한 해결 방법과 그 이유를 기록할 자리입니다.'],
      ['04', '결과와 다음 시도', project.outcome, '완성된 결과, 배운 점과 앞으로 개선할 부분을 기록할 자리입니다.']
    ];
    for (const [number, title, value, fallback] of sections) {
      const section = element('section', 'detail-section');
      section.append(element('span', 'eyebrow', number), element('h3', '', title), element('p', value ? '' : 'pending-copy', value || fallback));
      content.append(section);
    }
    const links = element('div', 'detail-links');
    for (const link of project.links ?? []) {
      const url = safeURL(link.url);
      if (!url) continue;
      const anchor = element('a', 'project-link', link.label);
      anchor.href = url; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer';
      links.append(anchor);
    }
    if (links.childElementCount) content.append(links);
    dialog.showModal();
    document.body.classList.add('dialog-open');
    dialog.scrollTop = 0;
  }

  for (const project of projects) {
    const article = element('article', 'project-card');
    const button = element('button', 'project-button');
    button.type = 'button';
    button.setAttribute('aria-label', `${project.title} 제작 기록 보기`);
    const cover = element('div', `project-cover ${['lime', 'blue', 'coral'].includes(project.color) ? project.color : 'lime'}`);
    cover.append(element('span', 'cover-caption', project.category));
    const imageURL = project.image && safeURL(project.image);
    if (imageURL) {
      const img = element('img', 'cover-image');
      img.src = imageURL; img.alt = project.imageAlt || project.title; img.loading = 'lazy';
      img.addEventListener('error', () => img.remove(), { once: true });
      cover.append(img);
    }
    cover.append(element('span', 'cover-number', project.number));
    cover.append(element('span', 'cover-status', project.overview ? '제작 기록' : '전시 자료 준비 중'));
    const info = element('div', 'project-info');
    const titleLine = element('div', 'project-title-line');
    titleLine.append(element('h3', '', project.title), element('span', 'project-open', '+'));
    info.append(titleLine, element('p', '', project.description));
    button.append(cover, info);
    button.addEventListener('click', () => openProject(project, button));
    article.append(button); grid.append(article);
  }
  if (!projects.length) grid.append(element('p', 'empty-state', '첫 작품의 전시를 준비하고 있습니다.'));
  document.querySelector('#close-dialog').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  });
  dialog.addEventListener('close', () => {
    document.body.classList.remove('dialog-open');
    trigger?.focus();
  });
})();
