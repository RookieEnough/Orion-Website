// The lighting both WebGL layers share: a tiny studio rendered into a PMREM.
// One softbox, two coloured strips, a warm card and a floor bounce.

import { Scene, Mesh, PlaneGeometry, SphereGeometry, MeshBasicMaterial, Color, Vector3, PMREMGenerator, BackSide } from '../vendor/three.subset.min.js';

export function studio(renderer) {
  const env = new Scene();
  const card = (w, h, color, k, pos, look) => {
    const m = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ color: new Color(color).multiplyScalar(k), side: 2 }));
    m.position.copy(pos);
    m.lookAt(look || new Vector3());
    env.add(m);
    return m;
  };
  env.add(new Mesh(new SphereGeometry(30, 32, 16), new MeshBasicMaterial({ color: '#050508', side: BackSide })));
  card(10, 6, '#ffffff', 3.2, new Vector3(0, 9, 3));
  card(1.4, 12, '#5b5fde', 4, new Vector3(-9, 1, 2));
  card(1.4, 12, '#b4b6ff', 2.2, new Vector3(9, 0, 1));
  card(6, 3, '#ffb38a', 1.1, new Vector3(2, -2, -10));
  card(14, 1, '#ffffff', 1.4, new Vector3(0, -6, 8));
  const pmrem = new PMREMGenerator(renderer);
  const rt = pmrem.fromScene(env, 0.035);
  pmrem.dispose();
  env.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  return rt;
}
