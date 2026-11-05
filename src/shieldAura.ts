import * as THREE from 'three';

/** A light, translucent field that follows the ship during shield protection. */
export class ShieldAura {
  private readonly group = new THREE.Group();
  private readonly material: THREE.ShaderMaterial;
  private readonly light: THREE.PointLight;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uFade: { value: 0 } },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vView;
        varying vec3 vLocal;
        void main() {
          vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vView = normalize(-viewPosition.xyz);
          vLocal = position;
          gl_Position = projectionMatrix * viewPosition;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uFade;
        varying vec3 vNormal;
        varying vec3 vView;
        varying vec3 vLocal;
        void main() {
          float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 1.8);
          float fleck = sin(vLocal.x * 19.0 + uTime * 4.3)
                      * sin(vLocal.y * 27.0 - uTime * 3.7)
                      * sin(vLocal.z * 23.0 + uTime * 5.1);
          float glitter = pow(max(fleck, 0.0), 9.0);
          float haze = 0.035 + rim * 0.19 + glitter * 0.13;
          gl_FragColor = vec4(0.22, 0.91, 1.0, haze * uFade);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const veil = new THREE.Mesh(new THREE.SphereGeometry(1, 30, 18), this.material);
    veil.scale.set(6.8, 2.2, 5.7);
    this.group.add(veil);
    this.light = new THREE.PointLight(0x70eeff, 0, 13, 2);
    this.group.add(this.light);
    this.group.visible = false;
  }

  attach(ship: THREE.Group): void { ship.add(this.group); }
  detach(): void { this.group.removeFromParent(); }

  update(remaining: number, elapsed: number): void {
    this.group.visible = remaining > 0;
    if (remaining <= 0) { this.light.intensity = 0; return; }
    const fade = Math.min(1, remaining / 0.45);
    this.material.uniforms.uTime.value = elapsed;
    this.material.uniforms.uFade.value = fade * (0.9 + Math.sin(elapsed * 5) * 0.1);
    this.light.intensity = 0.7 * fade;
  }
}
