import * as THREE from 'three';
import { createPlayerShip } from './procedural';
import type { ShipKind, SkinKind } from './economy';

function disposeShip(root: THREE.Object3D): void {
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    if (!object.geometry.userData.isShared) object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) if (!material.userData.isShared) material.dispose();
  });
}

export class HangarPreview {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  private turntable = new THREE.Group();
  private ship: THREE.Group | null = null;

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.5;
    this.renderer.setClearColor(0x000000, 0);
    this.host.appendChild(this.renderer.domElement);
    this.scene.add(new THREE.AmbientLight(0x9dc9e6, 1.7));
    const key = new THREE.DirectionalLight(0xd8f6ff, 3.3); key.position.set(-8, 14, 12); this.scene.add(key);
    const rim = new THREE.PointLight(0x48cfff, 65, 40); rim.position.set(7, 5, -7); this.scene.add(rim);
    const warm = new THREE.PointLight(0xff718a, 25, 35); warm.position.set(-7, 2, -5); this.scene.add(warm);
    this.camera.position.set(11, 8, 20); this.camera.lookAt(0, -0.2, 0);
    this.scene.add(this.turntable);

    const base = new THREE.Mesh(new THREE.CylinderGeometry(6.9, 7.15, 0.55, 64), new THREE.MeshStandardMaterial({ color: 0x132d42, metalness: 0.82, roughness: 0.28 }));
    base.position.y = -1.75; this.turntable.add(base);
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(6.45, 6.45, 0.07, 64), new THREE.MeshStandardMaterial({ color: 0x203b51, metalness: 0.7, roughness: 0.35 }));
    deck.position.y = -1.42; this.turntable.add(deck);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x53dcff, toneMapped: false });
    for (const radius of [5.3, 6.65]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.06, 6, 80), ringMaterial);
      ring.rotation.x = -Math.PI / 2; ring.position.y = -1.36; this.turntable.add(ring);
    }
    for (let i = 0; i < 12; i++) {
      const angle = i * Math.PI / 6;
      const tick = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.025, 0.54), ringMaterial);
      tick.position.set(Math.sin(angle) * 6.12, -1.35, Math.cos(angle) * 6.12);
      tick.rotation.y = angle; this.turntable.add(tick);
    }
    this.resize();
  }

  setShip(ship: ShipKind, skin: SkinKind): void {
    if (this.ship) { this.turntable.remove(this.ship); disposeShip(this.ship); }
    this.ship = createPlayerShip(ship, skin);
    this.ship.position.y = 0.15;
    this.turntable.add(this.ship);
  }

  resize(): void {
    const width = Math.max(1, this.host.clientWidth), height = Math.max(1, this.host.clientHeight);
    this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  render(dt: number): void {
    this.turntable.rotation.y += Math.min(dt, 0.1) * 0.13;
    this.renderer.render(this.scene, this.camera);
  }
}
