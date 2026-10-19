import type { Portfolio, PendingInput } from './types';
export type FieldTarget = Omit<PendingInput, 'rawValue'>;
export type InputKind = 'text' | 'optional' | 'integer' | 'lines' | 'links' | 'author';
export function fieldObject(
  data: Portfolio,
  target: FieldTarget,
): Record<string, unknown> | undefined {
  const graph = data.architectures.find((item) => item.projectId === target.projectId);
  let object: unknown;
  switch (target.scope) {
    case 'site':
      object = data.site;
      break;
    case 'project':
      object = data.projects.find((item) => item.id === target.projectId);
      break;
    case 'graph':
      object = graph;
      break;
    case 'group':
      object = graph?.groups.find((item) => item.id === target.entityId);
      break;
    case 'node':
      object = graph?.nodes.find((item) => item.id === target.entityId);
      break;
    case 'edge':
      object = graph?.edges.find((item) => item.id === target.entityId);
      break;
  }
  return object && typeof object === 'object' ? (object as Record<string, unknown>) : undefined;
}
function locate(data: Portfolio, target: FieldTarget) {
  const keys = target.path.slice(1).split('/');
  if (
    !target.path.startsWith('/') ||
    keys.some((key) => ['__proto__', 'prototype', 'constructor', 'id', 'projectId'].includes(key))
  )
    return null;
  let parent: unknown = fieldObject(data, target);
  for (const key of keys.slice(0, -1)) {
    if (!parent || typeof parent !== 'object' || !Object.hasOwn(parent, key)) return null;
    parent = (parent as Record<string, unknown>)[key];
  }
  const key = keys.at(-1)!;
  return parent && typeof parent === 'object' && Object.hasOwn(parent, key)
    ? { parent: parent as Record<string, unknown>, key }
    : null;
}
export function fieldValue(data: Portfolio, target: FieldTarget): unknown {
  const field = locate(data, target);
  return field?.parent[field.key];
}
export function setField(data: Portfolio, target: FieldTarget, value: unknown) {
  const field = locate(data, target);
  if (!field) return false;
  field.parent[field.key] = value;
  return true;
}
export const sameTarget = (a: FieldTarget, b: FieldTarget) =>
  a.scope === b.scope &&
  a.projectId === b.projectId &&
  a.entityId === b.entityId &&
  a.path === b.path;
export function inputValue(raw: string, kind: InputKind, previous?: unknown): unknown {
  switch (kind) {
    case 'text':
      return raw;
    case 'optional':
      return raw.trim() ? raw : null;
    case 'integer': {
      if (!raw.trim()) return null;
      if (!/^-?\d+$/.test(raw.trim())) throw Error('정수를 입력해 주세요.');
      const value = Number(raw);
      if (!Number.isSafeInteger(value))
        throw Error('입력한 숫자가 너무 큽니다. 정확히 보관할 수 있는 정수를 입력해 주세요.');
      return value;
    }
    case 'lines':
      return raw
        .split('\n')
        .map((value) => value.trim())
        .filter(Boolean);
    case 'links':
      return raw
        .split('\n')
        .filter((value) => value.trim())
        .map((value) => {
          const separator = value.indexOf('|');
          if (separator < 1)
            throw Error('자료 이름 | HTTPS 주소 형식으로 한 줄에 하나씩 입력해 주세요.');
          return {
            label: value.slice(0, separator).trim(),
            url: value.slice(separator + 1).trim(),
          };
        });
    case 'author': {
      const sources = Array.isArray(previous) ? previous : [];
      const preserved = sources.filter((item) => item.kind !== 'author');
      return raw.trim()
        ? [...preserved, { kind: 'author', label: '제작자 구조 확인', url: null, note: raw }]
        : preserved;
    }
  }
}
export function displayValue(value: unknown, kind: InputKind): string {
  if (value === null || value === undefined) return '';
  if (kind === 'lines' && Array.isArray(value)) return value.join('\n');
  if (kind === 'links' && Array.isArray(value))
    return value.map((item) => `${item.label} | ${item.url}`).join('\n');
  if (kind === 'author' && Array.isArray(value))
    return value
      .filter((item) => item.kind === 'author')
      .map((item) => item.note)
      .join('\n');
  return String(value);
}
// Cases use the existing backup format. Rebase indexed field paths when removing
// a case so another case never inherits that case's invalid input.
export function removeIndexedInputs(
  inputs: PendingInput[],
  scope: FieldTarget['scope'],
  projectId: string | null,
  field: string,
  index: number,
): PendingInput[] {
  return inputs.flatMap((input) => {
    if (
      input.scope !== scope ||
      input.projectId !== projectId ||
      !input.path.startsWith(`/${field}/`)
    )
      return [input];
    const parts = input.path.split('/');
    if (!/^(?:0|[1-9]\d*)$/.test(parts[2] ?? '')) return [input];
    const position = Number(parts[2]);
    if (position === index) return [];
    if (position > index) {
      parts[2] = String(position - 1);
      return [{ ...input, path: parts.join('/') }];
    }
    return [input];
  });
}
