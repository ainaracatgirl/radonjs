import { WebGLRenderer, PerspectiveCamera, Clock, AnimationMixer, Object3D, LoopOnce, PMREMGenerator, sRGBEncoding, Vector3, AmbientLight, HemisphereLight, DirectionalLight, WireframeGeometry, LineSegments, BoxGeometry, Color, Box3, Sphere } from './three.module.js'
import { GLTFLoader } from './GLTFLoader.js'
import { RGBELoader } from './RGBELoader.js'
import Stats from './stats.module.js'

let size = [ 0, 0 ];
let renderer;
let activeScene;
let activeCamera;
let clock = new Clock(true);
let gltfLoader = new GLTFLoader();
let rgbeLoader = new RGBELoader();
let pmremGenerator;
let updateHandlers = [];
let _stats;

export { size, renderer, activeScene, activeCamera, clock, gltfLoader, rgbeLoader, pmremGenerator, updateHandlers }

export function initRadon(options={}) {
    options = Object.assign({
        width: window.innerWidth,
        height: window.innerHeight,
        autoResize: true,

        camera: {
            fov: 75,
            near: .1,
            far: 1000
        },
        physicallyCorrectLights: true,
        outputEncoding: sRGBEncoding,
        clearColor: 0x000000,

        debug: false
    }, options);

    size[0] = options.width;
    size[1] = options.height;
    if (options.autoResize) window.addEventListener('resize', () => {
        size[0] = window.innerWidth;
        size[1] = window.innerHeight;
        activeCamera.aspect = size[0] / size[1];
        activeCamera.updateProjectionMatrix();
        renderer.setSize(size[0], size[1]);
    });

    activeCamera = new PerspectiveCamera(options.camera.fov, size[0] / size[1], options.camera.near, options.camera.far);
    
    renderer = new WebGLRenderer();
    renderer.physicallyCorrectLights  = options.physicallyCorrectLights;
    renderer.outputEncoding = options.outputEncoding;
    renderer.setClearColor(options.clearColor);
    renderer.setSize(size[0], size[1]);
    Input._init();

    if (options.debug) {
        _stats = [ Stats(0, true), Stats(80, true), Stats(160, true) ];
        _stats.forEach((x, i) => x.showPanel(i));
        _stats.forEach(x => document.body.appendChild(x.dom));
    }

    pmremGenerator = new PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();

    document.body.appendChild(renderer.domElement);
}

// https://github.com/donmccurdy/three-gltf-viewer/blob/890e4bc84d203058a6f2673e2b6f3ff19b6a3e5b/src/viewer.js#L469
export async function loadEnvironmentHDR(path) {
    return new Promise((resolve, reject) => {
        rgbeLoader.load(path, (texture) => {
            const envMap = pmremGenerator.fromEquirectangular(texture).texture;
            pmremGenerator.dispose();
  
            resolve(envMap);
  
        }, undefined, reject);
    });
}

export function applyOutdoorsLighting(scene) {
    scene.add(new HemisphereLight());
    scene.add(new AmbientLight(0xffffff, .3));
    const sunlight = new DirectionalLight(0xffffff, 2.5);
    sunlight.position.set(.5, 0, .866); // ~60º
    scene.add(sunlight);
}

export function startRadon() {
    function animate() {
        const delta = clock.getDelta();
        activeScene.traverse(child => {
            if (child.components) child.components.forEach(x => {
                if (!x._sceneAttached) { x._sceneAttached = true; x.onSceneAttached({ scene: activeScene }); }
                x.onTick({ delta });
            });
        })
        updateHandlers.forEach(x => x({ delta }));
        renderer.render(activeScene, activeCamera);

        Input.keyboardf = {};
        _stats?.forEach(x => x.update());
        requestAnimationFrame(animate);
    }
    animate();
}

export async function loadGLTF(path) {
    if (Array.isArray(path)) {
        return await Promise.all(path.map(x => loadGLTF(x)));
    }
    const gltf = await gltfLoader.loadAsync(path);
    gltf.instance = () => {
        const wrapper = new Object3D();
        const scn = gltf.scene.clone(true);
        wrapper.add(scn);
        if (gltf.animations && gltf.animations.length > 0) {
            const anim = new AnimatorComponent(scn, { anims: gltf.animations });
            return {
                animations: gltf.animations,
                scene: wrapper,
                animator: anim
            }
        }
        return { scene: wrapper }
    }
    return gltf;
}

export function displayWireframe(scene, object) {
    const geometry = new BoxGeometry(object.scale.x * 2, object.scale.y * 2, object.scale.z * 2);
    const wireframe = new WireframeGeometry(geometry);
    const line = new LineSegments(wireframe);
    line.material.depthTest = false;
    line.material.color = new Color(0, 0, 0);
    line.position.x = object.position.x;
    line.position.y = object.position.y;
    line.position.z = object.position.z;

    scene.add(line);
}

export function setActiveScene(scene) { activeScene = scene; }
export function setActiveCamera(camera) { activeCamera = camera }
export function addUpdateHandler(cb) { updateHandlers.push(cb) }

export class Component {
    constructor(object, props={}) {
        this.object = object;
        if (!object.components) {
            object.components = [];
            object.FindComponent = {};
        }
        object.components.push(this);
        object.FindComponent[this.constructor.name] = this;

        this.onInit(props);
    }
    onInit() {}
    onTick() {}
    onSceneAttached() {}
}

export class AnimatorComponent extends Component {
    onInit({ anims }) {
        this.mixer = new AnimationMixer(this.object);
        anims.map(x => {
            const act =  this.mixer.clipAction(x);
            act.loop = LoopOnce;
            return act;
        });
    }

    onTick({ delta }) {
        this.mixer.update(delta);
    }

    play(index) {
        this.mixer._actions[index]?.reset().play();
    }

    get(index) {
        return this.mixer._actions[index]?.reset();
    }
}

import { OrbitControls } from './OrbitControls.js'
export class TargetCameraComponent extends Component {
    onInit({ target }) {
        this._origX = target.position.x;
        this._origY = target.position.y;
        this._origZ = target.position.z;
        this.controls = new OrbitControls(this.object, renderer.domElement);
        this.controls.enablePan = false;
        this.object._orbitcontrols = this.controls;
        this.target = target;
    }

    onTick() {
        const cpos = this.object.position;
        cpos.set(cpos.x + (this.target.position.x - this._origX), cpos.y + (this.target.position.y - this._origY), cpos.z + (this.target.position.z - this._origZ));

        this._origX = this.target.position.x;
        this._origY = this.target.position.y;
        this._origZ = this.target.position.z;

        this.controls.target = this.target.position;
        this.controls.update();
    }
}

const physicsScenes = {};
export class BoxColliderComponent extends Component {
    onInit({ scale, scene, invert }) {
        this.box = new Box3();
        this.invert = invert;
        this.geometry = new BoxGeometry(this.object.scale.x * (scale ?? 1), this.object.scale.y * (scale ?? 1), this.object.scale.z * (scale ?? 1));
        this.geometry.computeBoundingBox();
        if (!physicsScenes[(scene ?? 'default')]) physicsScenes[(scene ?? 'default')] = [];
        physicsScenes[(scene ?? 'default')].push(this);
        this.pscene = scene ?? 'default';
        this.pos = new Vector3();
        this.updateCollider();
    }

    updateCollider() {
        this.object.getWorldPosition(this.pos);
        this.box.copy(this.geometry.boundingBox).translate(this.pos);
    }
   
    findCollision(offset) {
        this.updateCollider();

        let box = this.box;
        if (offset) box = this.box.clone().translate(offset);
        for (const po of physicsScenes[this.pscene]) {
            if (po.object.uuid == this.object.uuid) continue;
            po.updateCollider();
            if (po.box && (box.intersectsBox(po.box) ^ po.invert ^ this.invert)) return po;
            if (po.sphere && (box.intersectsSphere(po.sphere) ^ po.invert ^ this.invert)) return po;
        }
    }
}

export class SphereColliderComponent extends Component {
    onInit({ scale, scene, invert }) {
        this.sphere = new Sphere(new Vector3(0, 0, 0), this.object.scale.length() * scale);
        this.invert = invert;
        if (!physicsScenes[(scene ?? 'default')]) physicsScenes[(scene ?? 'default')] = [];
        physicsScenes[(scene ?? 'default')].push(this);
        this.pscene = scene ?? 'default';
        this.pos = new Vector3();
        this.updateCollider();
    }

    updateCollider() {
        this.object.getWorldPosition(this.pos);
        this.sphere.center.set(this.pos.x, this.pos.y, this.pos.z);
    }
   
    findCollision(offset) {
        this.updateCollider();

        let sphere = this.sphere;
        if (offset) sphere = this.sphere.clone().translate(offset);
        for (const po of physicsScenes[this.pscene]) {
            if (po.object.uuid == this.object.uuid) continue;
            po.updateCollider();
            if (po.box && (sphere.intersectsBox(po.box) ^ po.invert ^ this.invert)) return po;
            if (po.sphere && (sphere.intersectsSphere(po.sphere) ^ po.invert ^ this.invert)) return po;
        }
    }

}

const Input = {
    keyboard: {},
    keyboardf: {},
    mappings: [],
    _init() {
        window.addEventListener('keydown', ev => {
            this.keyboard[ev.key.toLowerCase()] = true;
            this.keyboardf[ev.key.toLowerCase()] = true;
            this._update();
        });
        window.addEventListener('keyup', ev => {
            delete this.keyboard[ev.key.toLowerCase()];
            delete this.keyboardf[ev.key.toLowerCase()];
            this._update();
        });
        window.addEventListener('blur', () => {
            this.keyboard = {};
            this.keyboardf = {};
        });
    },
    _update() {
        this.mappings.forEach(m => {
            for (const key in m.def) {
                let val = 0;

                for (const k of m.def[key].n)
                    if (this.isKeyDown(k)) { val--; break; }
                for (const k of m.def[key].p)
                    if (this.isKeyDown(k)) { val++; break; }

                m[key] = val;
            }
        });
    },

    isKeyDown(key) {
        return this.keyboard[key.toLowerCase()];
    },

    createMapping(def) {
        const mappingObj = { def };
        for (const key in def) mappingObj[key] = 0;
        this.mappings.push(mappingObj);
        return mappingObj;
    },
};

function lerp(a, b, k) { return a + (b - a) * clamp(k, 0, 1) }
function clamp(x, mi, mx) { return Math.min(Math.max(x, mi), mx) }
function _repeat(t, length) { return clamp(t - Math.floor(t / length) * length, 0, length) }
function lerpAngle(a, b, k) {
    let delta = _repeat((b - a), 360);
    if (delta > 180) delta -= 360;
    return a + delta * clamp(k, 0, 1);
}

const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;
const FORWARD = new Vector3(0, 0, -1);
export { Input, RAD2DEG, DEG2RAD, lerp, lerpAngle, clamp, FORWARD }
