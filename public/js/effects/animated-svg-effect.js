import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/+esm';

function svgDataUri(markup) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup.trim())}`;
}

/**
 * A camera-facing SVG effect with a small, deterministic gameplay timeline.
 *
 * Keeping animation in the game loop (rather than relying on browser-specific
 * SVG SMIL playback) means the effect pauses, resumes, and disposes with the
 * Three.js scene. SVG remains useful for crisp art at every camera distance.
 */
export class AnimatedSvgEffect {
  constructor({ svg, size = 1, duration = .5, loop = false, reducedMotion = false }) {
    this.texture = new THREE.TextureLoader().load(svgDataUri(svg));
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.material = new THREE.SpriteMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0
    });
    this.sprite = new THREE.Sprite(this.material);
    this.sprite.name = 'MUZIKAZ_ANIMATED_SVG_EFFECT';
    this.sprite.visible = false;
    this.baseSize = size;
    this.duration = Math.max(.01, duration);
    this.loop = loop;
    this.reducedMotion = reducedMotion;
    this.age = 0;
    this.active = false;
  }

  play({ duration = this.duration } = {}) {
    this.duration = Math.max(.01, duration);
    this.age = 0;
    this.active = true;
    this.sprite.visible = true;
    this.material.opacity = 1;
    this.sprite.scale.setScalar(this.baseSize);
    return this;
  }

  stop() {
    this.active = false;
    this.sprite.visible = false;
    this.material.opacity = 0;
  }

  update(delta) {
    if (!this.active) return false;
    this.age += Math.max(0, delta);
    let progress = this.age / this.duration;
    if (progress >= 1 && this.loop) {
      this.age %= this.duration;
      progress = this.age / this.duration;
    } else if (progress >= 1) {
      this.stop();
      return false;
    }

    // A readable wind-up: quick arrival, bright middle, then a clean fade.
    const envelope = Math.sin(progress * Math.PI);
    const pulse = this.reducedMotion ? 1 : 1 + Math.sin(progress * Math.PI * 6) * .09;
    this.sprite.scale.setScalar(this.baseSize * (.72 + progress * .58) * pulse);
    this.material.opacity = Math.min(1, envelope * 1.8);
    if (!this.reducedMotion) this.material.rotation = progress * Math.PI * 1.5;
    return true;
  }

  dispose() {
    this.sprite.removeFromParent();
    this.material.dispose();
    this.texture.dispose();
  }
}

