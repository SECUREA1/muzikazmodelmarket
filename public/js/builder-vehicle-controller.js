// Standard enter / drive-or-fly / exit controller for procedural Builder vehicles.
export class BuilderVehicleController {
  constructor({ THREE, vehicles, playerRig, camera, keys, status = () => {}, onExit = () => {} }) {
    Object.assign(this, { THREE, vehicles, playerRig, camera, keys, status, onExit });
    this.active = null;
    this.velocity = 0;
    this.verticalVelocity = 0;
    this.rideTime = 0;
  }
  nearest(maxDistance = 4) {
    let result = null, distance = maxDistance;
    this.vehicles.children.forEach((vehicle) => {
      if (!vehicle.userData.vehicle) return;
      const next = vehicle.position.distanceTo(this.playerRig.position);
      if (next < distance) { result = vehicle; distance = next; }
    });
    return result;
  }
  toggle() {
    if (this.active) return this.exit();
    const vehicle = this.nearest();
    if (!vehicle) { this.status('Move closer to a ride, then press F to enter.'); return false; }
    this.active = vehicle;
    this.velocity = 0;
    this.verticalVelocity = 0;
    this.rideTime = 0;
    const airborne = ['fly','hover'].includes(vehicle.userData.vehicle.mode);
    this.status(`${vehicle.userData.label || vehicle.name}: controls active — WASD / arrows steer, ${airborne?'Space climbs · Shift descends':'Space brakes'}, Ctrl boosts, F exits.`);
    return true;
  }
  exit() {
    if (!this.active) return false;
    const side = new this.THREE.Vector3(1.8, .2, 0).applyQuaternion(this.active.quaternion);
    const position = this.active.position.clone().add(side);
    this.active = null;
    this.velocity = 0;
    this.verticalVelocity = 0;
    this.onExit(position);
    this.status('Ride exited. Walk up and press F to enter again.');
    return true;
  }
  update(delta) {
    const vehicle = this.active;
    if (!vehicle) return false;
    const config = vehicle.userData.vehicle;
    const forward = this.keys.has('w') || this.keys.has('arrowup');
    const reverse = this.keys.has('s') || this.keys.has('arrowdown');
    const throttle = Number(forward) - Number(reverse);
    const boosting = this.keys.has('control') || this.keys.has('ctrl');
    const braking = config.mode === 'drive' && this.keys.has(' ');
    const targetSpeed = braking ? 0 : throttle * (boosting ? (config.boostSpeed || config.speed * 1.45) : config.speed);
    this.velocity = this.THREE.MathUtils.lerp(this.velocity, targetSpeed, Math.min(1, delta * (config.acceleration || 2.5)));
    const steering = Number(this.keys.has('a') || this.keys.has('arrowleft')) - Number(this.keys.has('d') || this.keys.has('arrowright'));
    vehicle.rotation.y += steering * config.turnSpeed * delta * (this.velocity >= 0 ? 1 : -1);
    const direction = new this.THREE.Vector3(0, 0, -1).applyQuaternion(vehicle.quaternion);
    vehicle.position.addScaledVector(direction, this.velocity * delta);
    this.rideTime += delta;
    if (config.mode === 'fly' || config.mode === 'hover') {
      const lift = Number(this.keys.has(' ')) - Number(this.keys.has('shift'));
      this.verticalVelocity = this.THREE.MathUtils.lerp(this.verticalVelocity, lift * (config.liftSpeed || config.speed * .55), Math.min(1, delta * 4));
      const floor = config.groundHeight ?? config.minAltitude ?? .35;
      const ceiling = config.maxAltitude ?? (config.mode === 'hover' ? 8 : 60);
      vehicle.position.y = this.THREE.MathUtils.clamp(vehicle.position.y + this.verticalVelocity * delta, floor, ceiling);
      if (config.mode === 'hover' && !lift) vehicle.position.y = Math.max(floor, vehicle.position.y + Math.sin(this.rideTime * 4) * (config.hoverAmplitude || .05) * delta);
      vehicle.rotation.z = this.THREE.MathUtils.lerp(vehicle.rotation.z, steering * (config.mode === 'hover' ? -.18 : -.28), Math.min(1, delta * 3));
      vehicle.rotation.x = this.THREE.MathUtils.lerp(vehicle.rotation.x, throttle * -.08 + lift * -.12, delta * 2);
    } else {
      vehicle.rotation.z = this.THREE.MathUtils.lerp(vehicle.rotation.z, steering * -.035, Math.min(1, delta * 5));
    }
    vehicle.updateMatrixWorld(true);
    const seat = new this.THREE.Vector3(...config.seat).applyMatrix4(vehicle.matrixWorld);
    this.playerRig.position.copy(seat);
    this.playerRig.rotation.y = vehicle.rotation.y;
    this.camera.position.set(0, config.mode === 'fly' ? 1.1 : config.mode === 'hover' ? .85 : .75, .15);
    return true;
  }
}
