import type { Project } from '../../domain/types';
export interface Pose {
  position: number[];
  target: number[];
}
export type Destination = 'lobby' | `work:${string}`;
export interface WorkPlacement {
  project: Project;
  ordinal: number;
  x: number;
  z: number;
  facing: 1 | -1;
}
export interface ExhibitionRoom {
  index: number;
  works: WorkPlacement[];
}
export interface ExhibitionSession {
  room: number;
  selectedId: string | null;
  destination: Destination;
  camera?: Pose;
  reduceMotion?: boolean;
}
export function makeRooms(projects: readonly Project[]): ExhibitionRoom[] {
  return Array.from({ length: Math.ceil(projects.length / 6) }, (_, index) => ({
    index,
    works: projects.slice(index * 6, index * 6 + 6).map((project, slot) => ({
      project,
      ordinal: index * 6 + slot + 1,
      x: slot % 2 === 0 ? -7.7 : 7.7,
      z: -1 - Math.floor(slot / 2) * 6,
      facing: slot % 2 === 0 ? 1 : -1,
    })),
  }));
}
export function workDestination(id: string): Destination {
  return `work:${id}`;
}
export function destinationPose(room: ExhibitionRoom, destination: Destination, aspect = 1): Pose {
  const work = room.works.find((work) => workDestination(work.project.id) === destination);
  if (!work)
    return { position: [0, 5, Math.max(16, 13 / Math.max(0.3, aspect) + 10)], target: [0, 2, -6] };
  return { position: [work.x > 0 ? 3.5 : -3.5, 3.1, work.z + 3.8], target: [work.x, 2.7, work.z] };
}
export function validPose(pose: Pose | undefined): pose is Pose {
  return Boolean(
    pose &&
    pose.position.length === 3 &&
    pose.target.length === 3 &&
    [...pose.position, ...pose.target].every(
      (value) => Number.isFinite(value) && Math.abs(value) < 10000,
    ) &&
    Math.hypot(...pose.position.map((value, index) => value - pose.target[index]!)) > 0.01,
  );
}
export function normalizeSession(
  rooms: ExhibitionRoom[],
  session: ExhibitionSession,
): ExhibitionSession {
  if (!rooms.length) return { room: 0, selectedId: null, destination: 'lobby' };
  const selectedRoom = rooms.find((room) =>
    room.works.some((work) => work.project.id === session.selectedId),
  );
  const room =
    selectedRoom?.index ??
    Math.max(0, Math.min(rooms.length - 1, Number.isInteger(session.room) ? session.room : 0));
  const selectedId = selectedRoom ? session.selectedId : null;
  const destination = rooms[room]?.works.some(
    (work) => workDestination(work.project.id) === session.destination,
  )
    ? session.destination
    : 'lobby';
  const camera =
    room === session.room && validPose(session.camera) && (!session.selectedId || selectedId)
      ? structuredClone(session.camera)
      : undefined;
  return { room, selectedId, destination, camera };
}
export class CameraFlight {
  private from: Pose = { position: [], target: [] };
  private to: Pose = this.from;
  private elapsed = 0;
  private last: number | null = null;
  private moving = false;
  start(from: Pose, to: Pose, reduced: boolean) {
    this.from = structuredClone(from);
    this.to = structuredClone(to);
    this.elapsed = 0;
    this.last = null;
    this.moving = !reduced;
    return this.moving;
  }
  step(time: number): { pose: Pose; moving: boolean } {
    if (this.moving) {
      if (this.last !== null) this.elapsed += Math.max(0, Math.min(50, time - this.last));
      this.last = time;
      if (this.elapsed >= 700) this.moving = false;
    }
    const t = this.moving ? Math.min(1, this.elapsed / 700) : 1;
    const eased = t * t * (3 - 2 * t);
    const mix = (a: number[], b: number[]) =>
      a.map((value, index) => value + (b[index]! - value) * eased);
    return {
      pose: {
        position: mix(this.from.position, this.to.position),
        target: mix(this.from.target, this.to.target),
      },
      moving: this.moving,
    };
  }
  finish() {
    this.moving = false;
    return structuredClone(this.to);
  }
}
