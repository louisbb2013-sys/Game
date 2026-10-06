// Sous-ensemble de three.js utilisé par le site (réduit la taille du téléchargement).
// Reconstruire : npm i three@0.186.1 && npx esbuild tools/three-entry.js --bundle --format=esm --minify --outfile=assets/js/vendor/three.module.js
export {
  AdditiveBlending, BufferAttribute, BufferGeometry, CatmullRomCurve3, CircleGeometry, Color, ConeGeometry,
  CylinderGeometry, DoubleSide, DynamicDrawUsage, FrontSide, Group, IcosahedronGeometry, InstancedBufferAttribute,
  InstancedBufferGeometry, InstancedMesh, LatheGeometry, MathUtils, Matrix4, Mesh, PerspectiveCamera, Plane,
  PlaneGeometry, Points, Quaternion, Raycaster, Scene, ShaderMaterial, SphereGeometry, TubeGeometry, Vector2,
  Vector3, WebGLRenderer,
} from "three";
