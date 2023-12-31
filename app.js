import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const scene = new THREE.Scene();
const container = document.getElementById("canvas") || document.body;
const renderer = new THREE.WebGLRenderer();

let width = window.innerWidth;
let height = window.innerHeight;

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(width, height);
renderer.setClearColor(0x111111);
container.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(75, width / height, 0.001, 5000);
const controls = new OrbitControls(camera, renderer.domElement);

camera.position.set(0, 0, 2.5);
controls.enableZoom = false;
controls.enableRotate = false;

let time = 0;
let geometry = new THREE.SphereGeometry(1, 128, 128);
let material = new THREE.ShaderMaterial({
  extensions: {
    derivatives: "#extension GL_OES_standard_derivatives : enable",
  },
  side: THREE.DoubleSide,
  wireframe: false,
  uniforms: {
    u_time: { value: 0 },
    u_intensity: { value: 0.01 },
    u_move: { value: 500 },
  },
  vertexShader:
    `
      // Uniforms are external variables passed to the shader from the JavaScript side
      uniform float u_intensity;
      uniform float u_time;
      uniform float u_move;

      // Varying variables are used to pass data from the vertex shader to the fragment shader
      varying vec2 vUv;
      varying float vDisplacement;

      // Helper function to permute a 4D vector
      vec4 permute(vec4 x) {
          return mod(((x*34.0)+1.0)*x, 289.0);
      }

      // Helper function for fast inverse square root approximation
      vec4 taylorInvSqrt(vec4 r) {
          return 1.79284291400159 - 0.85373472095314 * r;
      }

      // Helper function to smoothstep between 0 and 1
      vec3 fade(vec3 t) {
          return t*t*t*(t*(t*6.0-15.0)+10.0);
      }

      // Classic Perlin noise function
      float cnoise(vec3 P) {
          // Integer and fractional parts of the input position
          vec3 Pi0 = floor(P); // Integer part for indexing
          vec3 Pi1 = Pi0 + vec3(1.0); // Integer part + 1
          Pi0 = mod(Pi0, 289.0);
          Pi1 = mod(Pi1, 289.0);
          vec3 Pf0 = fract(P); // Fractional part for interpolation
          vec3 Pf1 = Pf0 - vec3(1.0); // Fractional part - 1.0

          // Permute and interpolate gradients at integer coordinates
          vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
          vec4 iy = vec4(Pi0.yy, Pi1.yy);
          vec4 iz0 = Pi0.zzzz;
          vec4 iz1 = Pi1.zzzz;

          vec4 ixy = permute(permute(ix) + iy);
          vec4 ixy0 = permute(ixy + iz0);
          vec4 ixy1 = permute(ixy + iz1);

          vec4 gx0 = ixy0 / 7.0;
          vec4 gy0 = fract(floor(gx0) / 7.0) - 0.5;
          gx0 = fract(gx0);
          vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
          vec4 sz0 = step(gz0, vec4(0.0));
          gx0 -= sz0 * (step(0.0, gx0) - 0.5);
          gy0 -= sz0 * (step(0.0, gy0) - 0.5);

          vec4 gx1 = ixy1 / 7.0;
          vec4 gy1 = fract(floor(gx1) / 7.0) - 0.5;
          gx1 = fract(gx1);
          vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);
          vec4 sz1 = step(gz1, vec4(0.0));
          gx1 -= sz1 * (step(0.0, gx1) - 0.5);
          gy1 -= sz1 * (step(0.0, gy1) - 0.5);

          vec3 g000 = vec3(gx0.x,gy0.x,gz0.x);
          vec3 g100 = vec3(gx0.y,gy0.y,gz0.y);
          vec3 g010 = vec3(gx0.z,gy0.z,gz0.z);
          vec3 g110 = vec3(gx0.w,gy0.w,gz0.w);
          vec3 g001 = vec3(gx1.x,gy1.x,gz1.x);
          vec3 g101 = vec3(gx1.y,gy1.y,gz1.y);
          vec3 g011 = vec3(gx1.z,gy1.z,gz1.z);
          vec3 g111 = vec3(gx1.w,gy1.w,gz1.w);

          vec4 norm0 = taylorInvSqrt(vec4(dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110)));
          g000 *= norm0.x;
          g010 *= norm0.y;
          g100 *= norm0.z;
          g110 *= norm0.w;
          vec4 norm1 = taylorInvSqrt(vec4(dot(g001, g001), dot(g011, g011), dot(g101, g101), dot(g111, g111)));
          g001 *= norm1.x;
          g011 *= norm1.y;
          g101 *= norm1.z;
          g111 *= norm1.w;

          float n000 = dot(g000, Pf0);
          float n100 = dot(g100, vec3(Pf1.x, Pf0.yz));
          float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z));
          float n110 = dot(g110, vec3(Pf1.xy, Pf0.z));
          float n001 = dot(g001, vec3(Pf0.xy, Pf1.z));
          float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
          float n011 = dot(g011, vec3(Pf0.x, Pf1.yz));
          float n111 = dot(g111, Pf1);

          vec3 fade_xyz = fade(Pf0);
          vec4 n_z = mix(vec4(n000, n100, n010, n110), vec4(n001, n101, n011, n111), fade_xyz.z);
          vec2 n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y);
          float n_xyz = mix(n_yz.x, n_yz.y, fade_xyz.x); 
          return 2.2 * n_xyz;
      }

      void main() {
          vUv = uv;
          vDisplacement = cnoise(position + vec3(2.0 * u_time));
          vec3 newPosition = position + normal * (u_intensity + (u_move * 0.001) * vDisplacement);
          vec4 modelPosition = modelMatrix * vec4(newPosition, 1.0);
          vec4 viewPosition = viewMatrix * modelPosition;
          vec4 projectedPosition = projectionMatrix * viewPosition;
          gl_Position = projectedPosition;
      }
  `,
  fragmentShader:
    `
      uniform float u_intensity;
      uniform float u_move;
      uniform float u_time;

      varying vec2 vUv;
      varying float vDisplacement;

      void main() {
          float distort = 2.0 * vDisplacement * u_intensity + max(min(u_move * 0.0005, 0.0005), .001) * sin(vUv.y * 10.0 + u_time);

          // Adjust density
          distort *= 0.5; // You can experiment with different values

          // Check if the current fragment is close to a tilted line
          float lineSpacing = 0.15; // Adjust the spacing between lines
          float linePosition = mod((vUv.y + vUv.x * 0.5) * 10.0, lineSpacing); // Introduce horizontal offset
          float lineThickness = 0.005; // Adjust the thickness of the lines

          // If the fragment is close to a tilted line, draw the outline
          if (linePosition < lineThickness || linePosition > lineSpacing - lineThickness) {
              distort += 0.9; // You can experiment with different values
          } else {
              discard; // Discard fragments that are not part of the outline
          }

          // Add light and shadow effects
          vec3 lightDirection = normalize(vec3(1.0, 1.0, 1.0));
          float lightIntensity = max(dot(normalize(vec3(vUv, distort)), lightDirection), 0.0);
          distort += 0.8 * lightIntensity; // Adjust light intensity

          // Set dark grey color for the outline
          vec3 outlineColor = vec3(0.169,0.169,0.169); // Dark grey color
          gl_FragColor = vec4(outlineColor * distort, 1.0);
      }
    `
});
let sphere = new THREE.Mesh(geometry, material);
scene.add(sphere);

function setupResize() {
  window.addEventListener("resize", resize);
}

function resize() {
  width = window.innerWidth;
  height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

function onMove(event) {
  const wcenter = width / 2;
  let xPos = event.x - wcenter;

  xPos = xPos > 0 ? xPos + 200 : xPos - 200;

  material.uniforms.u_move.value = THREE.MathUtils.lerp(
    material.uniforms.u_move.value,
    xPos,
    0.1
  );
}

function render() {
  time += 0.002;
  material.uniforms.u_time.value = time;
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}

setupResize();
container.addEventListener("mousemove", onMove);
render();
