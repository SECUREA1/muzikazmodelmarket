// Standard enter / drive-or-fly / exit controller for procedural Builder vehicles.
export class BuilderVehicleController {
  constructor({ THREE, vehicles, playerRig, camera, keys, input = () => ({}), status = () => {}, onEnter = () => {}, onExit = () => {} }) {
    Object.assign(this, { THREE, vehicles, playerRig, camera, keys, input, status, onEnter, onExit });
    this.active = null;
    this.velocity = 0;
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
    this.onEnter(vehicle);
    const controls = vehicle.userData.vehicle.mode === 'fly' ? 'WASD / arrows steer, Space climbs, Shift descends' : 'WASD / arrows drive and steer';
    this.status(`${vehicle.userData.label || vehicle.name}: controls active — ${controls}. Use the Exit Vehicle button or F to leave.`);
    return true;
  }
  exit() {
    if (!this.active) return false;
    const side = new this.THREE.Vector3(1.8, .2, 0).applyQuaternion(this.active.quaternion);
    const position = this.active.position.clone().add(side);
    this.active = null;
    this.velocity = 0;
    this.onExit(position);
    this.status('Ride exited. Walk up and press F to enter again.');
    return true;
  }
  update(delta) {
    const vehicle = this.active;
    if (!vehicle) return false;
    const config = vehicle.userData.vehicle;
    const input = this.input();
    const throttle = this.THREE.MathUtils.clamp(Number(this.keys.has('w') || this.keys.has('arrowup')) - Number(this.keys.has('s') || this.keys.has('arrowdown')) + (Number(input.throttle) || 0), -1, 1);
    this.velocity = this.THREE.MathUtils.lerp(this.velocity, throttle * config.speed, Math.min(1, delta * 2.5));
    const steering = this.THREE.MathUtils.clamp(Number(this.keys.has('a') || this.keys.has('arrowleft')) - Number(this.keys.has('d') || this.keys.has('arrowright')) + (Number(input.steering) || 0), -1, 1);
    vehicle.rotation.y += steering * config.turnSpeed * delta * (this.velocity >= 0 ? 1 : -1);
    const direction = new this.THREE.Vector3(0, 0, -1).applyQuaternion(vehicle.quaternion);
    vehicle.position.addScaledVector(direction, this.velocity * delta);
    if (config.mode === 'fly') {
      const lift = this.THREE.MathUtils.clamp(Number(this.keys.has(' ')) - Number(this.keys.has('shift')) + (Number(input.lift) || 0), -1, 1);
      vehicle.position.y = Math.max(.35, vehicle.position.y + lift * config.speed * .55 * delta);
      vehicle.rotation.z = this.THREE.MathUtils.lerp(vehicle.rotation.z, steering * -.28, delta * 3);
      vehicle.rotation.x = this.THREE.MathUtils.lerp(vehicle.rotation.x, throttle * -.08 + lift * -.12, delta * 2);
    }
    vehicle.updateMatrixWorld(true);
    const seat = new this.THREE.Vector3(...config.seat).applyMatrix4(vehicle.matrixWorld);
    this.playerRig.position.copy(seat);
    this.playerRig.rotation.y = vehicle.rotation.y;
    this.camera.position.set(0, config.mode === 'fly' ? 1.1 : .75, .15);
    return true;
  }
}
