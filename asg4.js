// Vertex shader program
var VSHADER_SOURCE = `
  attribute vec4 a_Position;
  attribute vec2 a_UV;
  attribute vec3 a_Normal;
  varying vec2 v_UV;
  varying vec3 v_Normal;
  varying vec4 v_VertPos;
  uniform mat4 u_ModelMatrix;
  uniform mat4 u_NormalMatrix;
  uniform mat4 u_ViewMatrix;
  uniform mat4 u_ProjectionMatrix;
  void main() {
    gl_Position = u_ProjectionMatrix * u_ViewMatrix * u_ModelMatrix * a_Position;
    v_UV = a_UV;
    v_Normal = normalize(vec3(u_NormalMatrix * vec4(a_Normal,1)));
    v_VertPos = u_ModelMatrix * a_Position;
  }`

// Fragment shader program
var FSHADER_SOURCE = `
  precision mediump float;
  varying vec2 v_UV;
  varying vec3 v_Normal;
  varying vec4 v_VertPos;
  uniform vec4 u_FragColor;
  uniform vec3 u_LightPos;
  uniform vec3 u_SpotLightPos;
  uniform vec3 u_CameraPos;
  uniform sampler2D u_Sampler0;
  uniform sampler2D u_Sampler1;
  uniform sampler2D u_Sampler2;
  uniform int u_WhichTexture;
  uniform bool u_LightOnOff;
  uniform bool u_SpotLightOn;
  uniform vec3 u_SpotLightDir;
  uniform float u_SpotLightAng;
  void main() {
    vec4 wallTexture = texture2D(u_Sampler0, v_UV);
    vec4 bush = texture2D(u_Sampler1, v_UV);
    vec4 grassTexture = texture2D(u_Sampler2, v_UV);

    if (u_WhichTexture == -3) {
      gl_FragColor = vec4((v_Normal+1.0)/2.0, 1.0);
    } else if (u_WhichTexture == -2) {
      gl_FragColor = u_FragColor;
    } else if (u_WhichTexture == -1) {
      gl_FragColor = vec4(v_UV,1.0,1.0);
    } else if (u_WhichTexture == 0) {
      //gl_FragColor = 0.5 * bodyTexture + 0.5 * u_FragColor;
      gl_FragColor = wallTexture;
    } else if (u_WhichTexture == 1) {
      gl_FragColor = bush;
    } else if (u_WhichTexture == 2) {
      gl_FragColor = grassTexture;
    } else {
      gl_FragColor = vec4(1,.2,.2,1);
    }

    float specular = 0.0;
    vec3 diffuse = vec3(0.0, 0.0, 0.0);
    vec3 ambient = vec3(0.0, 0.0, 0.0);
    vec3 sdiffuse = vec3(0.0, 0.0, 0.0);
    vec3 sambient = vec3(0.0, 0.0, 0.0);
    float sspecular = 0.0;

    if (u_LightOnOff) {

      vec3 lightVector = u_LightPos - vec3(v_VertPos);
      float r = length(lightVector);
      //if (r < 1.0) {
      //  gl_FragColor = vec4(1,0,0,1);
      //} else if (r < 2.0) {
      //  gl_FragColor = vec4(0,1,0,1);
      //}

      //gl_FragColor = vec4(vec3(gl_FragColor)/(r*r),1);

      // N dot L
      vec3 L = normalize(lightVector);
      vec3 N = normalize(v_Normal);
      float NdotL = max(dot(N,L), 0.0);

      // Reflection
      vec3 R = reflect(-L, N);

      // eye
      vec3 E = normalize(u_CameraPos-vec3(v_VertPos));

      // Specular
      specular = pow(max(dot(E,R), 0.0), 50.0);

      diffuse = vec3(gl_FragColor) * NdotL;
      ambient = vec3(gl_FragColor) * 0.3;
    }
    
    if (u_SpotLightOn) {
      // spotlight -------------------------------------------------
      vec3 SpotLightVector = u_SpotLightPos - vec3(v_VertPos);
      vec3 spotlightDir = normalize(u_SpotLightDir);
      float ang = dot(normalize(SpotLightVector), -normalize(u_SpotLightDir));

      if (ang > cos(radians(u_SpotLightAng))) {
        // N dot L
        vec3 sL = normalize(SpotLightVector);
        vec3 sN = normalize(v_Normal);
        float sNdotL = max(dot(sN,sL), 0.0);

        // Reflection
        vec3 sR = reflect(-sL, sN);

        // eye
        vec3 sE = normalize(u_CameraPos-vec3(v_VertPos));

        // Specular
        sspecular = pow(max(dot(sE,sR), 0.0), 50.0);

        sdiffuse = vec3(gl_FragColor) * sNdotL;
        
      }
      ambient = vec3(gl_FragColor) * 0.3;
    }

    if (u_SpotLightOn || u_LightOnOff) {
      if (u_WhichTexture == -3) {
        gl_FragColor = vec4(diffuse+ambient+sdiffuse, 1.0);
      } else {
        gl_FragColor = vec4(specular+diffuse+ambient+sdiffuse+sspecular, 1.0);
      }
    }

  }`

// Global Variables
let canvas, gl, a_Position, a_UV, a_Normal, u_FragColor, u_Sampler0, u_Sampler1, u_Sampler2, u_WhichTexture;
let u_ModelMatrix, u_NormalMatrix, u_ViewMatrix, u_ProjectionMatrix, u_LightPos, u_SpotLightPos, u_CameraPos;
let u_LightOnOff, u_SpotLightOn, u_SpotLightAng, u_SpotLightDir;

let g_startTime = performance.now()/1000.0;
let g_seconds = performance.now()/1000.0-g_startTime;
let g_animation = false;
let g_light_on_off = true;
let g_light_motion = true;
let g_lightPos = [0,1.5,0];
let g_spotLightOn = true;
let g_SpotLightPos = [1,4,0];
let g_SpotLightDir = [-g_SpotLightPos[0], -g_SpotLightPos[1], -g_SpotLightPos[2]]
let g_camera, g_cameraPos;
let g_view_normals = false;
let g_poke = false;
let g_pokeStart = 0;

let g_map = new Map()


// WebGL setup
function setupWebGL() {
  canvas = document.getElementById('webgl');
  gl = canvas.getContext("webgl", {preserveDrawingBuffer:true});
  if (!gl) {
    console.log('Failed to get the rendering context for WebGL');
    return;
  }
  gl.enable(gl.DEPTH_TEST);
}

// Connect JS variables to GLSL
function connectVarsToGLSL() {
  if (!initShaders(gl, VSHADER_SOURCE, FSHADER_SOURCE)) {
    console.log('Failed to intialize shaders.');
    return;
  }

  a_Position = gl.getAttribLocation(gl.program, 'a_Position');
  a_UV = gl.getAttribLocation(gl.program, 'a_UV');
  a_Normal = gl.getAttribLocation(gl.program, 'a_Normal');

  u_FragColor = gl.getUniformLocation(gl.program, 'u_FragColor');
  u_LightPos = gl.getUniformLocation(gl.program, 'u_LightPos');
  u_SpotLightPos = gl.getUniformLocation(gl.program, 'u_SpotLightPos');
  u_SpotLightDir = gl.getUniformLocation(gl.program, 'u_SpotLightDir');
  u_SpotLightAng = gl.getUniformLocation(gl.program, 'u_SpotLightAng');
  u_CameraPos = gl.getUniformLocation(gl.program, 'u_CameraPos');

  u_Sampler0 = gl.getUniformLocation(gl.program, 'u_Sampler0');
  u_Sampler1 = gl.getUniformLocation(gl.program, 'u_Sampler1');
  u_Sampler2 = gl.getUniformLocation(gl.program, 'u_Sampler2');
  u_WhichTexture = gl.getUniformLocation(gl.program, 'u_WhichTexture');
  u_LightOnOff = gl.getUniformLocation(gl.program, 'u_LightOnOff');
  u_SpotLightOn = gl.getUniformLocation(gl.program, 'u_SpotLightOn');
  u_ModelMatrix = gl.getUniformLocation(gl.program, 'u_ModelMatrix');
  u_NormalMatrix = gl.getUniformLocation(gl.program, 'u_NormalMatrix');
  u_ViewMatrix = gl.getUniformLocation(gl.program, 'u_ViewMatrix');
  u_ProjectionMatrix = gl.getUniformLocation(gl.program, 'u_ProjectionMatrix');

  return;
}

function initTextures() {
  const image1 = new Image();
  const image2 = new Image();
  const image3 = new Image();

  image1.onload = () => sendImageToTEXTURE(image1, gl.TEXTURE0, u_Sampler0);
  image2.onload = () => sendImageToTEXTURE(image2, gl.TEXTURE1, u_Sampler1);
  image3.onload = () => sendImageToTEXTURE(image3, gl.TEXTURE2, u_Sampler2);

  image1.src = 'w.jpg';
  image2.src = 'dry.jpeg';
  image3.src = 'dry.jpeg';

  return true;
}

function sendImageToTEXTURE(image, textureUnit, sampler) {
  const texture = gl.createTexture();
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
  gl.activeTexture(textureUnit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
  gl.uniform1i(sampler, textureUnit - gl.TEXTURE0);
}

// Convert mouse coordinates to WebGL coordinates
function convertCoordinatesEventToGL(ev) {
  const rect = ev.target.getBoundingClientRect();
  let x = ev.clientX;
  let y = ev.clientY;
  x = ((x - rect.left) - canvas.width / 2) / (canvas.width / 2);
  y = (canvas.height / 2 - (y - rect.top)) / (canvas.height / 2);
  return [x, y];
}

function addActionsForHtmlUI() {
  // Animation Buttons
  document.getElementById('lightSlideX').addEventListener('mousemove', function(ev) {if(ev.buttons == 1) {g_lightPos[0] = this.value/100; renderAllShapes();}});
  document.getElementById('lightSlideY').addEventListener('mousemove', function(ev) {if(ev.buttons == 1) {g_lightPos[1] = this.value/100; renderAllShapes();}});
  document.getElementById('lightSlideZ').addEventListener('mousemove', function(ev) {if(ev.buttons == 1) {g_lightPos[2] = this.value/100; renderAllShapes();}});

  document.getElementById('SpotLightSlideX').addEventListener('mousemove', function(ev) {if(ev.buttons == 1) {g_SpotLightPos[0] = this.value/100; renderAllShapes();}});
  document.getElementById('SpotLightSlideY').addEventListener('mousemove', function(ev) {if(ev.buttons == 1) {g_SpotLightPos[1] = this.value/100; renderAllShapes();}});
  document.getElementById('SpotLightSlideZ').addEventListener('mousemove', function(ev) {if(ev.buttons == 1) {g_SpotLightPos[2] = this.value/100; renderAllShapes();}});

  document.getElementById('LightOn').onclick = function() {g_light_on_off = true; renderAllShapes()}
  document.getElementById('LightOff').onclick = function() {g_light_on_off = false; renderAllShapes()}

  document.getElementById('SpotLightOn').onclick = function() {g_spotLightOn = true; renderAllShapes()}
  document.getElementById('SpotLightOff').onclick = function() {g_spotLightOn = false; renderAllShapes()}

  document.getElementById('SpotLightOn').onclick = function() {g_spotLightOn = true; renderAllShapes()}
  document.getElementById('SpotLightOff').onclick = function() {g_spotLightOn = false; renderAllShapes()}

  document.getElementById('MotionOn').onclick = function() {g_light_motion = true; renderAllShapes()}
  document.getElementById('MotionOff').onclick = function() {g_light_motion = false; renderAllShapes()}

  document.getElementById('NormalsOn').onclick = function() {g_view_normals = true; renderAllShapes()}
  document.getElementById('NormalsOff').onclick = function() {g_view_normals = false; renderAllShapes()}
}

// Send text to html
function sendTextToHTML(text) {
  document.getElementById('output').textContent = text;
}

// Update animation angles
function UpdateAnimationAngles() {
  if (g_light_motion) g_lightPos[0] = Math.cos(g_seconds);
}


// Update camera position based on keys pressed
function UpdateCameraPosition() {
  if (g_keysDown[87]) g_camera.moveForward();
  if (g_keysDown[65]) g_camera.moveLeft();
  if (g_keysDown[83]) g_camera.moveBackward();
  if (g_keysDown[68]) g_camera.moveRight();
  if (g_keysDown[81]) g_camera.panLeft();
  if (g_keysDown[69]) g_camera.panRight();
}

// Render all shapes
function renderAllShapes() {
  var start = performance.now();

  gl.uniformMatrix4fv(u_ProjectionMatrix, false, g_camera.projMat.elements);
  gl.uniformMatrix4fv(u_ViewMatrix, false, g_camera.viewMat.elements);
  gl.uniform1i(u_LightOnOff, g_light_on_off);
  gl.uniform1i(u_SpotLightOn, g_spotLightOn);
  gl.uniform3f(u_SpotLightDir, g_SpotLightDir[0], g_SpotLightDir[1], g_SpotLightDir[2])
  gl.uniform1f(u_SpotLightAng, 30)

  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.clear(gl.COLOR_BUFFER_BIT);

  let groundColor = [.3, .7, .3, 1];
  let skyColor = [.53, .81, 1, 1];

  var skyM = new Matrix4();
  skyM.scale(-100, -100, -100);
  skyM.translate(-.5, -.5, -.5);
  var sky = new Cube(skyM, skyColor, -3);
  sky.render();

  let tex = g_view_normals ? -3 : 2;
  var groundM = new Matrix4();
  groundM.translate(-25, -.65, -25);
  groundM.scale(50, .001, 50);
  var ground = new Cube(groundM, groundColor, tex);
  ground.render();

  var cubeM = new Matrix4();
  cubeM.translate(.5,-.5,0);
  var cube = new Cube(cubeM, [1,1,1,1], tex);
  cube.render()

  tex = g_view_normals ? -3 : -2;
  var sphereM = new Matrix4();
  sphereM.translate(-.5, .2, 0);
  var sphere = new Sphere(sphereM, [1,1,1,1], tex);
  sphere.render()

  gl.uniform3f(u_LightPos, g_lightPos[0], g_lightPos[1], g_lightPos[2]);
  gl.uniform3f(u_SpotLightPos, g_SpotLightPos[0], g_SpotLightPos[1], g_SpotLightPos[2]);

  var lightM = new Matrix4();
  lightM.translate(g_lightPos[0], g_lightPos[1], g_lightPos[2]);
  lightM.scale(-.1,-.1,-.1);
  lightM.translate(-.5, -.5, -.5);
  var light = new Cube(lightM, [2,2,0,1])
  light.render()

  var spotLightM = new Matrix4();
  spotLightM.translate(g_SpotLightPos[0], g_SpotLightPos[1], g_SpotLightPos[2]);
  spotLightM.scale(.1,.1,.1);
  spotLightM.translate(-.5, -.5, -.5);
  var spotLight = new Cube(spotLightM, [2,2,0,1])
  spotLight.render()

  gl.uniform3f(u_CameraPos, g_cameraPos[0], g_cameraPos[1], g_cameraPos[2])

  var duration = performance.now() - start;
  sendTextToHTML(" ms: " + Math.floor(duration) + " fps: " + Math.floor(10000/duration));
}

// Mouse click handler
function handleOnClick(ev) {
  if (ev.buttons != 1) return;
  let [x, y] = convertCoordinatesEventToGL(ev);
  renderAllShapes();
}

// Key press handlers
let g_keysDown = {}
function handleOnKeyDown(ev) { g_keysDown[ev.keyCode] = true; }
function handleOnKeyUp(ev) { g_keysDown[ev.keyCode] = false; }

// Animation loop
function tick() {
  g_seconds = performance.now() / 1000.0 - g_startTime;
  UpdateAnimationAngles();
  UpdateCameraPosition();
  renderAllShapes();
  requestAnimationFrame(tick);
}

// Main entry point
function main() {
  setupWebGL();
  connectVarsToGLSL();
  addActionsForHtmlUI();
  initTextures();

  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  g_camera = new Camera();
  g_cameraPos = g_camera.eye.elements;

  canvas.onmousedown = handleOnClick;
  canvas.onmousemove = handleOnClick;
  document.addEventListener('keydown', handleOnKeyDown);
  document.addEventListener('keyup', handleOnKeyUp);

  requestAnimationFrame(tick);
}