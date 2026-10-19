import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  normalizeYouTube,
  startYouTube,
  type Player,
  type YouTubeApi,
} from '../src/features/media/youtube';
const id = 'M7lc1UVf-VE';
for (const input of [
  id,
  ` https://youtu.be/${id}?t=3 `,
  `https://www.youtube.com/watch?v=${id}&list=test`,
  `https://m.youtube.com/shorts/${id}`,
  `https://youtube.com/live/${id}`,
  `https://www.youtube-nocookie.com/embed/${id}`,
])
  test(`YouTube 주소 정리: ${input}`, () => assert.equal(normalizeYouTube(input), id));
for (const input of [
  '',
  'abc',
  `https://youtube.com.evil.test/watch?v=${id}`,
  `https://evil.test/${id}`,
  `javascript:${id}`,
  `https://user@youtube.com/watch?v=${id}`,
  `https://youtube.com/watch?v=${id}&v=${id}`,
  `https://youtu.be/${id}/extra`,
  `https://youtube.com/playlist?list=${id}`,
])
  test(`지원하지 않는 영상 입력 거부: ${input}`, () => assert.equal(normalizeYouTube(input), null));
function setup() {
  const calls: string[] = [];
  let options!: ConstructorParameters<YouTubeApi['Player']>[1];
  class FakePlayer implements Player {
    constructor(_host: HTMLElement, opts: typeof options) {
      options = opts;
      calls.push('create');
    }
    playVideo() {
      calls.push('play');
    }
    stopVideo() {
      calls.push('stop');
    }
    destroy() {
      calls.push('destroy');
    }
    getIframe() {
      return { title: '' } as HTMLIFrameElement;
    }
  }
  const states: string[] = [];
  return {
    api: { Player: FakePlayer },
    calls,
    states,
    options: () => options,
    host: {} as HTMLElement,
  };
}
test('선택 이후 준비되면 재생하며 이탈은 stop과 destroy를 호출한다', async () => {
  const s = setup();
  const dispose = startYouTube(
    s.host,
    id,
    '테스트 영상',
    (state) => s.states.push(state),
    async () => s.api,
    'https://owner.github.io',
  );
  await Promise.resolve();
  assert.deepEqual(s.calls, ['create']);
  assert.equal(s.options().playerVars.origin, 'https://owner.github.io');
  const player = new s.api.Player(s.host, s.options());
  s.options().events.onReady({ target: player });
  assert.ok(s.calls.includes('play'));
  dispose();
  assert.deepEqual(s.calls.slice(-2), ['stop', 'destroy']);
  s.options().events.onError({ data: 100 });
  assert.equal(s.states.at(-1), 'ready');
});
test('API 대기 중 이탈하면 뒤늦은 플레이어를 생성하지 않는다', async () => {
  const s = setup();
  let resolve!: (api: YouTubeApi) => void;
  const dispose = startYouTube(
    s.host,
    id,
    '영상',
    (state) => s.states.push(state),
    () =>
      new Promise((r) => {
        resolve = r;
      }),
    'https://owner.github.io',
  );
  dispose();
  resolve(s.api);
  await Promise.resolve();
  assert.deepEqual(s.calls, []);
  assert.deepEqual(s.states, ['loading']);
});
test('API 실패와 임베드 오류 및 재생 차단을 표시한다', async () => {
  const s = setup();
  startYouTube(
    s.host,
    id,
    '영상',
    (state) => s.states.push(state),
    async () => {
      throw Error('offline');
    },
    'https://owner.github.io',
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(s.states.at(-1), 'error');
  const dispose = startYouTube(
    s.host,
    id,
    '영상',
    (state) => s.states.push(state),
    async () => s.api,
    'https://owner.github.io',
  );
  await Promise.resolve();
  s.options().events.onError({ data: 153 });
  assert.equal(s.states.at(-1), 'error');
  s.options().events.onAutoplayBlocked();
  assert.equal(s.states.at(-1), 'blocked');
  dispose();
});
test('플레이어 종료 중 API 오류가 나도 destroy를 시도하며 반복 종료는 무시한다', async () => {
  let stops = 0;
  let destroys = 0;
  class BrokenPlayer implements Player {
    constructor(_host: HTMLElement, options: ConstructorParameters<YouTubeApi['Player']>[1]) {
      options.events.onReady({ target: this });
    }
    playVideo() {}
    getIframe() {
      return {} as HTMLIFrameElement;
    }
    stopVideo() {
      stops++;
      throw Error('detached');
    }
    destroy() {
      destroys++;
      throw Error('detached');
    }
  }
  const dispose = startYouTube(
    {} as HTMLElement,
    id,
    '영상',
    () => {},
    async () => ({ Player: BrokenPlayer }),
    'https://owner.github.io',
  );
  await Promise.resolve();
  assert.doesNotThrow(dispose);
  dispose();
  assert.equal(stops, 1);
  assert.equal(destroys, 1);
});
