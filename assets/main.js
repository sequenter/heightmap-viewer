/* 
Heightmap Viewer, created by Daniel Hough @ onemandan.github.io

Creates a 3D visual representation of a 2D heightmap utilising Three.js.  2D heightmap pseudo randomly generated with seed based Alea 
PRNG, and user input, altering octaves, frequency, amplitude and exponent values.  3D model represented with vertex and gradient based 
fragment shaders.

Dependencies:
- Three.js: https://threejs.org/
- dat.gui: https://github.com/dataarts/dat.gui
- simplex-noise: https://github.com/jwagner/simplex-noise.js
- Alea PRNG: http://baagoe.com/en/RandomMusings/javascript/
*/

import * as THREE from "three";

import { OrbitControls } from "../js/modules/OrbitControls.js";
import { GUI } from "../js/modules/dat.gui.module.js";
import { createNoise2D } from "../js/modules/simplex-noise.js";

/* NormaliseBetween
Obtains the minimum and maximum values within an array and returns a new array with its values rescaled between @min and @max
@min - minimum rescale value
@max - maximum rescale value
*/
Array.prototype.normaliseBetween = function(min, max) {
    const amin = Math.min(...this);
    const amax = Math.max(...this);

    return this.map(v => (((v - amin) * (max - min)) / (amax - amin)) + min)
}

/* Viewer
Three.js components setup
*/
const Viewer = {
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 10000),
    renderer: new THREE.WebGLRenderer(),
    update: null,
    init: function(mapSize, update) {
        //Initialise scene
        this.scene.background = new THREE.Color(0xbfd1e5);

        //Initialise renderer
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(this.renderer.domElement);

        //Initialise camera
        this.camera.position.x = mapSize;
        this.camera.position.y = mapSize / 2;

        //Initialise controls
        const controls = new OrbitControls(this.camera, this.renderer.domElement);
        controls.maxPolarAngle = Math.PI / 2;
        controls.enablePan = false;
        controls.enableZoom = false;
        controls.update();

        //Window resizing
        window.addEventListener("resize", function() {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();

            this.renderer.setSize(window.innerWidth, window.innerHeight );
        }.bind(this), false );

        this.update = update;
    },
    render: function(time) {
        this.update(time);

        requestAnimationFrame(this.render.bind(this));
        this.renderer.render(this.scene, this.camera);
    }
};

/* Interface
Contains canvas' for the heightmap and gradient, as well as dat.gui interface with variables:
-General Attributes
  - Seed
  - Normalise
-Heightmap Attributes
  - Octaves
  - Frequency
  - Amplitude
  - Exponent
-Gradient Attributes
  - Max Colour
  - Min Colour
*/
const Interface = {
    gui: new GUI({width: 256}),
    cnvHeightmap: document.getElementById("heightmap"),
    cnvGradient: document.getElementById("heightgrd"),
    ctxHeightmap: null,
    ctxGradient: null,
    timestamp: 0,
    vars: {
        octv: 6,
        freq: 2,
        expn: 4,
        ampl: 4,
        seed: Math.random() * 1000,
        norm: true,
        prst: true,
        maxc: "#71077A", //Purple
        minc: "#F7B353"  //Hunyadi Yellow
    },
    init: function(lod, onVarChange, onSeedChange, onGradientChange) {
        //On gradient canvas click, randomise min and max gradient colours
        this.cnvGradient.addEventListener("click", function() {
            this.vars.maxc = this.randomColour();
            this.vars.minc = this.randomColour();

            onGradientChange();
        }.bind(this), false);

        //On heightmap canvas click, randomise seed in the 0 to 1000 range
        this.cnvHeightmap.addEventListener("click", function() {
            this.vars.seed = Math.random() * 1000;

            onSeedChange();
        }.bind(this), false);

        //Set heightmap canvas size depending on level of detail, ensure DOM element does not exceed 256px
        this.cnvHeightmap.width = this.cnvHeightmap.height = lod;
        this.cnvHeightmap.style.width = this.cnvHeightmap.style.height = "256px";

        this.ctxHeightmap = this.cnvHeightmap.getContext("2d");
        this.ctxGradient = this.cnvGradient.getContext("2d");
        this.gui.domElement.id = "gui";

        //Initialise GUI variables using @vars
        const f1 = this.gui.addFolder("General Attributes");
        f1.add(this.vars, "seed", 1, 1000, 1).name("Seed").listen().onChange(onSeedChange);
        f1.add(this.vars, "norm").name("Normalise").onChange(onSeedChange);
        f1.add(this.vars, "prst").name("Presentation Mode");
        f1.open();

        const f2 = this.gui.addFolder("Heightmap Attributes");
        f2.add(this.vars, "octv", 1, 10, 1).name("Octaves").listen().onChange(onVarChange);
        f2.add(this.vars, "ampl", 1, 10, 0.5).name("Amplitude").listen().onChange(onVarChange);
        f2.add(this.vars, "freq", 1, 10, 0.5).name("Frequency").listen().onChange(onVarChange);
        f2.add(this.vars, "expn", 1, 10, 0.5).name("Exponent").listen().onChange(onVarChange);
        f2.open();

        const f3 = this.gui.addFolder("Gradient Attributes");
        f3.addColor(this.vars,"maxc").name("Max Colour").listen().onChange(onGradientChange);
        f3.addColor(this.vars,"minc").name("Min Colour").listen().onChange(onGradientChange);
        f3.open();
    },
    updateHeightmap: function(heightmap) {
        const rgba = new Uint8Array(4 * heightmap.length);

        //Convert heightmap array to RGBA Uint8Array
        for (let i = 0; i < heightmap.length; i++) {
            //heightmap value is between 0 and 1, as heightmap canvas should be greyscale, RGB components simply need
            //to multiply this value by 255
            const col = ~~(heightmap[i] * 255);
            const stride = i * 4;

            rgba[stride] = col;
            rgba[stride + 1] = col;
            rgba[stride + 2] = col;
            rgba[stride + 3] = 255; //Alpha channel opaque
        }

        //Update canvas image data
        const imageData = this.ctxHeightmap.getImageData(0, 0, this.cnvHeightmap.width, this.cnvHeightmap.height);
        imageData.data.set(rgba);

        this.ctxHeightmap.putImageData(imageData, 0, 0);
    },
    updateGradient: function() {
        const gradient = this.ctxGradient.createLinearGradient(0, 256, 0, 0);

        //Create a gradient from @vars min colour to @vars max colour
        gradient.addColorStop(0, this.vars.minc);
        gradient.addColorStop(1, this.vars.maxc);

        this.ctxGradient.fillStyle = gradient;
        this.ctxGradient.fillRect(0, 0, 32, 256);
    },
    randomColour: function() {
        return "#" + (Math.random() * 0xFFFFFF << 0).toString(16).padStart(6, "0");
    }
};

/* Terrain
Contains Three.js mesh for 3D and @heightmap containing noise values for 2D.  Mesh requires geometry and material,
with the material being a Three.js ShaderMaterial using vertex and fragment shaders.  Shaders are linked to the 
heightmap and gradient textures via uniforms, both of which are obtained from the @Interface. 

Process is to use the @generate function to create @heightmap array via Simplex Noise, and update @Interface 
heightmap canvas, which in turn updates the linked textures, effectively updating both 2D and 3D representations
*/
const Terrain = {
    mesh: null,     //THREE 'Mesh' object
    heightmap: [],  //2D Array of height values in the 0 to 1 range
    mapSize: 0,     //Size of @mesh
    lod: 0,         //Level of detail, 1D size of @heightmap
    vertexShader: document.getElementById("vertexShader").textContent,
    fragmentShader: document.getElementById("fragmentShader").textContent,
    heightTexture: new THREE.CanvasTexture(Interface.cnvHeightmap),
    gradientTexture: new THREE.CanvasTexture(Interface.cnvGradient),
    noise2D: createNoise2D(),
    init: function(mapSize, lod) {
        const geometry = new THREE.PlaneGeometry(mapSize, mapSize, lod - 1, lod - 1);
        geometry.rotateX(-Math.PI / 2); //To ensure geometry is flat
        geometry.rotateY(Math.PI / 2);  //To ensure geometry initially matches @Interface heightmap canvas

        //Create the terrains mesh with a shader material
        const mesh = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
            uniforms: {
                heightmap: {value: this.heightTexture},
                gradient: {value: this.gradientTexture},
                heightRatio: {value: lod * 2}
            },
            vertexShader: this.vertexShader,
            fragmentShader: this.fragmentShader
        }));

        const grid = new THREE.GridHelper(mapSize, 20);
        grid.translateY(-(mapSize / 100));

        this.mesh = new THREE.Group();
        this.mesh.add(mesh);
        this.mesh.add(grid);

        this.mapSize = mapSize;
        this.lod = lod;
    },
    generate: function (seed, frequency, exponent, amplitudes, normalise) {
        const noise2D = this.noise2D;

        /* Noise
        Return a noise value utilising Simpelx Noise, based on x and y position, implementing octaves
        (through @amplitudes) and @exponent
        @x - x position
        @y - y position
        */
        function Noise(x, y) {
            function nv(nx, ny) {
                return noise2D(nx, ny) / 2.0 + 0.5;
            }

            let e = 0;
            let ampTotal = 0;

            //Combine noise values by iterating over octaves and applying them based on amplitude
            for (const amp of amplitudes) {
                const ampDiv = 1 / amp;
                ampTotal += ampDiv;

                e += ampDiv * nv(x * amp, y * amp);
            }

            return Math.pow((e / ampTotal), exponent);
        }

        const lod = this.lod;
        const lod2 = lod * lod;
        const nvs = new Array(lod2);
        
        //Utilise 1D array for performance, with small overhead of calculating indices, implement
        //noise @frequency
        for (let i = 0; i < lod2; i++) {
            const x = i % lod;
            const y = ~~(i / lod);
            const nx = x / (lod / frequency);
            const ny = y / (lod / frequency);
            const nv = Noise(nx, ny);
            nvs[i] = nv;
        }

        //Normalise heightmap from the @min to @max range to the 0 to 1 range when @normalise is provided
        this.heightmap = normalise ? nvs.normaliseBetween(0, 1) : nvs;
    }
};

/* updateVars
@Interface onVarsChange: Create an amplitude array based on @Interface octave and amplitude values. Update
@Terrain heightmap and @Interface heightmap canvas
*/
function updateVars() {
    const vars = Interface.vars;
    let amps = [1];

    //Amplitudes are an array of octave length, based on amplitude, e.g.
    //1: [1, 2, 3, 4]
    //2: [1, 3, 5, 7]
    for (let i = 1; i < vars.octv; i++){
        amps.push(amps[i - 1] + vars.ampl);
    }

    //Generate @Terrain heightmap and update @Interface heightmap canvas
    Terrain.generate(vars.seed, vars.freq, vars.expn, amps, vars.norm);
    Interface.updateHeightmap(Terrain.heightmap);

    //Signal texture update
    Terrain.heightTexture.needsUpdate = true;
}

/* updateGradient
@Interface onGradientChange: Update @Interface gradient canvas
*/
function updateGradient() {
    //Update @Interface gradient canvas
    Interface.updateGradient(Interface.vars.maxc, Interface.vars.minc);

    //Signal texture update
    Terrain.gradientTexture.needsUpdate = true;
}

/* updateSeed
@Interface onSeedChange: Seed simplex noise with Alea PRNG, using the @Interface seed variable 
*/
function updateSeed() {
    Terrain.noise2D = createNoise2D(Alea(Interface.vars.seed));
    updateVars();
}

/* update
@View update: update function called each frame by the Viewer
*/
function update(time) {
    //Randomise interface variables when in presentaton mode
    if (Interface.vars.prst) {
        Terrain.mesh.rotateY(Math.PI / 1000);

        //Randomise every 5 seconds
        if(time - Interface.timestamp >= 5000) {
            Interface.timestamp = time; //Reset timestamp

            Interface.vars.seed = Math.floor(Math.random() * 1000) + 1;
            Interface.vars.octv = Math.floor(Math.random() * 10) + 1;
            Interface.vars.ampl = Math.max(1, Math.round((Math.random() * 10) * 2) / 2)
            Interface.vars.freq = Math.max(1, Math.round((Math.random() * 10) * 2) / 2)
            Interface.vars.expn = Math.max(1, Math.round((Math.random() * 10) * 2) / 2)

            updateSeed();
        }
    }
}

//Get level of detail from the URL
const lod = Math.max(128, Math.min(window.location.hash.substring(1) || 128, 512));
const mapSize = lod * 10;

Interface.init(lod, updateVars, updateSeed, updateGradient);
Viewer.init(mapSize, update);
Terrain.init(mapSize, lod);

updateSeed();
updateGradient();

Viewer.scene.add(Terrain.mesh);
Viewer.render();