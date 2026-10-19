import { Box3, Vector3 } from 'three';
export function frameBounds(bounds: Box3, aspect: number, fov: number) {
  const target = bounds.getCenter(new Vector3());
  const direction = new Vector3(0.7, 0.7, 1.4).normalize();
  const right = new Vector3(0, 1, 0).cross(direction).normalize();
  const up = direction.clone().cross(right).normalize();
  const tangent = Math.tan((fov * Math.PI) / 360);
  let distance = 100;
  for (const x of [bounds.min.x, bounds.max.x])
    for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z]) {
        const delta = new Vector3(x, y, z).sub(target);
        const horizontal = Math.abs(delta.dot(right));
        const vertical = Math.abs(delta.dot(up));
        const depth = delta.dot(direction);
        distance = Math.max(
          distance,
          depth + horizontal / (tangent * Math.max(0.1, aspect)),
          depth + vertical / tangent,
        );
      }
  distance *= 1.2;
  return { target, position: target.clone().addScaledVector(direction, distance), distance };
}
