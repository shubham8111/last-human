import * as THREE from 'three';

export const ROAD_HALF = 7;
const CHUNK = 40;
const CHUNKS = 7;

function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function roadTexture() {
  return canvasTex(512, 1024, (g, w, h) => {
    g.fillStyle = '#2c2a2e';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      const v = 30 + Math.random() * 40;
      g.fillStyle = `rgba(${v},${v},${v + 4},0.5)`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    // patches & oil stains
    for (let i = 0; i < 10; i++) {
      g.fillStyle = `rgba(15,14,16,${0.2 + Math.random() * 0.3})`;
      g.beginPath();
      g.ellipse(Math.random() * w, Math.random() * h, 20 + Math.random() * 60, 10 + Math.random() * 40, Math.random() * 3, 0, 7);
      g.fill();
    }
    // cracks
    g.strokeStyle = 'rgba(10,10,12,0.8)';
    for (let i = 0; i < 14; i++) {
      g.lineWidth = 1 + Math.random() * 2;
      g.beginPath();
      let x = Math.random() * w;
      let y = Math.random() * h;
      g.moveTo(x, y);
      for (let k = 0; k < 8; k++) {
        x += (Math.random() - 0.5) * 50;
        y += (Math.random() - 0.5) * 50;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    // edge lines + dashed centre line
    g.fillStyle = 'rgba(230,220,200,0.75)';
    g.fillRect(14, 0, 8, h);
    g.fillRect(w - 22, 0, 8, h);
    g.fillStyle = 'rgba(240,190,40,0.85)';
    for (let y = 0; y < h; y += 128) g.fillRect(w / 2 - 5, y + 20, 10, 70);
  });
}

function sidewalkTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#5b5552';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 3000; i++) {
      const v = 70 + Math.random() * 40;
      g.fillStyle = `rgba(${v},${v - 4},${v - 6},0.6)`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    g.strokeStyle = 'rgba(30,28,28,0.8)';
    g.lineWidth = 3;
    for (let y = 0; y <= h; y += 64) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(w / 2, 0);
    g.lineTo(w / 2, h);
    g.stroke();
  });
}

function facadeTexture(hue) {
  return canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = `hsl(${hue},12%,${18 + Math.random() * 8}%)`;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2000; i++) {
      g.fillStyle = `rgba(0,0,0,${Math.random() * 0.25})`;
      g.fillRect(Math.random() * w, Math.random() * h, 3, 3);
    }
    const cols = 4;
    const rows = 8;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = 18 + c * 60;
        const y = 20 + r * 62;
        const lit = Math.random();
        if (lit < 0.12) g.fillStyle = `rgb(255,${170 + Math.random() * 50},90)`;
        else if (lit < 0.2) g.fillStyle = '#6a2a1a';
        else g.fillStyle = `rgb(${15 + Math.random() * 15},${18 + Math.random() * 15},${28 + Math.random() * 20})`;
        g.fillRect(x, y, 36, 40);
        if (lit > 0.85) {
          // broken window
          g.fillStyle = '#050505';
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + 36, y + 10);
          g.lineTo(x + 10, y + 40);
          g.fill();
        }
      }
    }
    // soot streaks
    for (let i = 0; i < 4; i++) {
      const grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, 'rgba(0,0,0,0.6)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(Math.random() * w, 0, 20 + Math.random() * 40, h * Math.random());
    }
  });
}

// Window-glow mask: only lit windows emit.
function emissiveFrom(tex) {
  const src = tex.image;
  return canvasTex(src.width, src.height, (g, w, h) => {
    g.drawImage(src, 0, 0);
    const img = g.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const lit = d[i] > 200 && d[i + 1] > 140;
      if (!lit) d[i] = d[i + 1] = d[i + 2] = 0;
    }
    g.putImageData(img, 0, 0);
  });
}

export class Road {
  constructor(scene) {
    this.scene = scene;
    this.chunks = [];

    const roadTex = roadTexture();
    roadTex.repeat.set(1, 2);
    this.roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.92, metalness: 0 });
    const swTex = sidewalkTexture();
    swTex.repeat.set(1, 10);
    this.walkMat = new THREE.MeshStandardMaterial({ map: swTex, roughness: 0.95 });
    this.curbMat = new THREE.MeshStandardMaterial({ color: 0x8a817a, roughness: 0.9 });
    this.facades = [10, 25, 200, 340, 30].map((hue) => {
      const map = facadeTexture(hue);
      const em = emissiveFrom(map);
      return new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: 0xffc070, emissiveIntensity: 1.25, roughness: 0.85 });
    });
    this.roofMat = new THREE.MeshStandardMaterial({ color: 0x1d1a1c, roughness: 1 });
    this.carMats = [0x7a2a22, 0x2a4a6a, 0x9a8a6a, 0x3a3a3a, 0x5a6a3a].map(
      (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.4 }),
    );
    this.darkMat = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.6, metalness: 0.3 });
    this.rustMat = new THREE.MeshStandardMaterial({ color: 0x6a3f2a, roughness: 0.9, metalness: 0.2 });
    this.bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3, 1.6), toneMapped: false });
    this.fireMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 2, 0.4), toneMapped: false });
    this.barrierMat = new THREE.MeshStandardMaterial({ color: 0xc9c2b4, roughness: 0.9 });
    this.stripeMat = new THREE.MeshStandardMaterial({ color: 0xd04020, roughness: 0.8 });

    this.roadGeo = new THREE.PlaneGeometry(ROAD_HALF * 2, CHUNK);
    this.roadGeo.rotateX(-Math.PI / 2);
    this.walkGeo = new THREE.BoxGeometry(4, 0.25, CHUNK);
    this.curbGeo = new THREE.BoxGeometry(0.3, 0.32, CHUNK);

    // Endless dark ground out to the fog.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(600, 600),
      new THREE.MeshStandardMaterial({ color: 0x241d1f, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    this.ground = ground;
    scene.add(ground);

    this.fires = [];
    for (let i = 0; i < CHUNKS; i++) {
      const c = this.buildChunk();
      c.position.z = -i * CHUNK + CHUNK / 2;
      scene.add(c);
      this.chunks.push(c);
    }
  }

  buildChunk() {
    const g = new THREE.Group();
    const road = new THREE.Mesh(this.roadGeo, this.roadMat);
    road.receiveShadow = true;
    g.add(road);
    for (const side of [-1, 1]) {
      const walk = new THREE.Mesh(this.walkGeo, this.walkMat);
      walk.position.set(side * (ROAD_HALF + 2), 0.12, 0);
      walk.receiveShadow = true;
      g.add(walk);
      const curb = new THREE.Mesh(this.curbGeo, this.curbMat);
      curb.position.set(side * (ROAD_HALF + 0.1), 0.16, 0);
      curb.receiveShadow = true;
      g.add(curb);
    }
    g.userData.props = new THREE.Group();
    g.add(g.userData.props);
    this.decorate(g);
    return g;
  }

  // (Re)populate a chunk's buildings and street clutter.
  decorate(chunk) {
    const props = chunk.userData.props;
    props.traverse((m) => {
      if (m.isMesh && m.userData.ownGeo) m.geometry.dispose();
    });
    props.clear();
    chunk.userData.fires = [];

    for (const side of [-1, 1]) {
      let z = -CHUNK / 2;
      while (z < CHUNK / 2 - 3) {
        const depth = 7 + Math.random() * 6;
        const len = Math.min(CHUNK / 2 - z, 7 + Math.random() * 8);
        const height = 6 + Math.random() * 22;
        const broken = Math.random() < 0.3;
        const geo = new THREE.BoxGeometry(depth, height, len - 0.6);
        // scale UVs so windows keep a consistent size
        const uv = geo.attributes.uv;
        const pos = geo.attributes.position;
        const nrm = geo.attributes.normal;
        for (let i = 0; i < uv.count; i++) {
          const nx = Math.abs(nrm.getX(i));
          const ny = Math.abs(nrm.getY(i));
          const span = nx > 0.5 ? len : depth;
          if (ny > 0.5) continue;
          uv.setXY(i, uv.getX(i) * span / 8, (pos.getY(i) + height / 2) / 16);
        }
        const mat = [this.facades[(Math.random() * this.facades.length) | 0]];
        const b = new THREE.Mesh(geo, mat[0]);
        b.userData.ownGeo = true;
        b.position.set(side * (ROAD_HALF + 4.3 + depth / 2 + Math.random() * 1.5), height / 2, z + len / 2);
        b.castShadow = true;
        b.receiveShadow = true;
        props.add(b);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(depth + 0.4, 0.5, len - 0.2), this.roofMat);
        roof.userData.ownGeo = true;
        roof.position.set(b.position.x, height + 0.2, b.position.z);
        if (broken) {
          roof.rotation.z = side * (0.15 + Math.random() * 0.2);
          roof.rotation.x = (Math.random() - 0.5) * 0.3;
        }
        props.add(roof);
        if (Math.random() < 0.3) {
          const f = new THREE.Mesh(new THREE.ConeGeometry(0.8 + Math.random(), 2 + Math.random() * 2, 6), this.fireMat);
          f.userData.ownGeo = true;
          f.position.set(b.position.x - side * depth * 0.3, height + 1.2, b.position.z);
          f.userData.base = f.scale.clone();
          f.userData.phase = Math.random() * 10;
          props.add(f);
          chunk.userData.fires.push(f);
        }
        z += len;
      }

      // street lamps
      for (let lz = -CHUNK / 2 + 6; lz < CHUNK / 2; lz += 20) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 6, 6), this.darkMat);
        pole.userData.ownGeo = true;
        pole.position.set(side * (ROAD_HALF + 1.2), 3, lz);
        pole.castShadow = true;
        props.add(pole);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.1), this.darkMat);
        arm.userData.ownGeo = true;
        arm.position.set(side * (ROAD_HALF + 0.5), 5.95, lz);
        props.add(arm);
        if (Math.random() < 0.6) {
          const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.25), this.bulbMat);
          bulb.userData.ownGeo = true;
          bulb.position.set(side * (ROAD_HALF - 0.2), 5.85, lz);
          props.add(bulb);
        }
      }

      // wrecked cars on the sidewalk edge
      if (Math.random() < 0.7) props.add(this.makeCar(side * (ROAD_HALF + 2.2), (Math.random() - 0.5) * CHUNK * 0.8, side));
      if (Math.random() < 0.5) props.add(this.makeBarrier(side * (ROAD_HALF + 1.5), (Math.random() - 0.5) * CHUNK * 0.8));
    }
  }

  makeCar(x, z, side) {
    const g = new THREE.Group();
    const mat = this.carMats[(Math.random() * this.carMats.length) | 0];
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.7, 4.2), mat);
    body.position.y = 0.65;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.2), mat);
    cab.position.set(0, 1.25, 0.2);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.45, 2.0), this.darkMat);
    glass.position.set(0, 1.25, 0.2);
    glass.scale.set(1.01, 0.9, 1.01);
    g.add(body, cab, glass);
    for (const [wx, wz] of [[-0.95, 1.3], [0.95, 1.3], [-0.95, -1.3], [0.95, -1.3]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10), this.darkMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(wx, 0.36, wz);
      g.add(w);
    }
    g.traverse((m) => {
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
        m.userData.ownGeo = true;
      }
    });
    g.position.set(x, 0.1, z);
    g.rotation.y = (Math.random() - 0.5) * 0.8 + (side < 0 ? 0 : Math.PI);
    g.rotation.z = (Math.random() - 0.5) * 0.15;
    return g;
  }

  makeBarrier(x, z) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 2.4), this.barrierMat);
    base.position.y = 0.55;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.18, 2.42), this.stripeMat);
    stripe.position.y = 0.8;
    g.add(base, stripe);
    g.traverse((m) => {
      if (m.isMesh) {
        m.castShadow = true;
        m.userData.ownGeo = true;
      }
    });
    g.position.set(x, 0.1, z);
    g.rotation.y = (Math.random() - 0.5) * 0.6;
    return g;
  }

  reset(z = 0) {
    this.chunks.forEach((c, i) => {
      c.position.z = z - i * CHUNK + CHUNK / 2;
      this.decorate(c);
    });
  }

  update(cameraZ, time) {
    let front = Infinity;
    for (const c of this.chunks) front = Math.min(front, c.position.z);
    for (const c of this.chunks) {
      if (c.position.z - CHUNK / 2 > cameraZ + 10) {
        c.position.z = front - CHUNK;
        front = c.position.z;
        this.decorate(c);
      }
      for (const f of c.userData.fires) {
        const k = 1 + Math.sin(time * 9 + f.userData.phase) * 0.15 + Math.sin(time * 23 + f.userData.phase) * 0.08;
        f.scale.set(k, k * 1.1, k);
      }
    }
    this.ground.position.x = 0;
    this.ground.position.z = cameraZ - 100;
  }
}
