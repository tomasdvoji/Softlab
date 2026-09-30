/* Fluted glass gradient: WebGL shader in the hero background.
   A slow domain-warped gradient (mint vs deep blue) seen through horizontal glass flutes;
   each flute refracts the image and has a thin bright edge highlight. The light blob
   follows the pointer with easing. Falls back to the CSS gradient on .hero when WebGL is missing. */
(function () {
  var canvas = document.getElementById("fluted");
  if (!canvas) return;
  var gl = canvas.getContext("webgl", { antialias: false, alpha: false, premultipliedAlpha: false });
  if (!gl) { canvas.remove(); return; }

  var VERT = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
  var FRAG = [
    "precision highp float;",
    "uniform vec2 uRes;uniform float uTime;uniform vec2 uMouse;uniform float uBands;",
    "float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}",
    "float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);",
    " return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}",
    "float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*noise(p);p*=2.02;a*=.5;}return v;}",
    /* scalar field: 0 = deep blue, 1 = mint */
    "float field(vec2 uv){",
    " float t=uTime*.06;",
    " vec2 q=vec2(fbm(uv*1.3+vec2(t,-t*.7)),fbm(uv*1.3+vec2(-t*.8,t)+5.2));",
    " float f=fbm(uv*1.1+q*1.6+vec2(t*.5,0.));",
    " float wave=.5+.5*sin(uv.x*2.6+uv.y*1.4-uTime*.25+q.x*3.);",
    " vec2 m=uMouse; float d=length((uv-m)*vec2(1.,1.25));",
    " float blob=exp(-d*d*10.);",
    " return clamp(mix(f,wave,.5)*1.25-.14+blob*.4,0.,1.);",
    "}",
    "vec3 palette(float v){",
    " vec3 navy=vec3(.10,.12,.52),blue=vec3(.14,.20,.80),vio=vec3(.40,.38,.82),sky=vec3(.45,.58,.84),mint=vec3(.60,.78,.78);",
    " vec3 c=mix(navy,blue,smoothstep(0.,.25,v));",
    " c=mix(c,vio,smoothstep(.25,.45,v));",
    " c=mix(c,sky,smoothstep(.45,.65,v));",
    " return mix(c,mint,smoothstep(.62,.85,v));",
    "}",
    "void main(){",
    " vec2 uv=gl_FragCoord.xy/uRes; uv.y=1.-uv.y;",
    " float aspect=uRes.x/uRes.y;",
    " float b=uv.y*uBands; float id=floor(b); float t=fract(b);",
    /* refraction through one flute: magnify toward band center + per-band horizontal shift */
    " float sy=(id+.5+(t-.5)*.35)/uBands;",
    " float shift=(hash(vec2(id,3.))-.5)*.10+(t-.5)*.06;",
    " vec2 s=vec2((uv.x+shift)*aspect,sy)*vec2(1./aspect*1.6,1.6);",
    " float v=field(s);",
    " vec3 col=palette(v);",
    /* inner shading of each flute */
    " col*=.9+.14*smoothstep(0.,.5,t)-.08*smoothstep(.6,1.,t);",
    /* edge highlight, strongest where the gradient changes */
    " float edge=smoothstep(.93,.99,t)*(1.-smoothstep(.99,1.,t));",
    " float grad=clamp(abs(field(s+vec2(.02,0.))-v)*28.,0.,1.);",
    " vec3 hl=mix(vec3(1.),vec3(1.,.62,.92),hash(vec2(id,9.)));",
    " col+=hl*edge*(.15+.85*grad)*.55;",
    /* film grain */
    " col*=.86;",
    " col+=(hash(gl_FragCoord.xy+fract(uTime)*100.)-.5)*.06;",
    " gl_FragColor=vec4(col,1.);",
    "}"
  ].join("\n");

  function sh(type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  var prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (e) { canvas.remove(); return; }
  gl.useProgram(prog);

  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  var uRes = gl.getUniformLocation(prog, "uRes"), uTime = gl.getUniformLocation(prog, "uTime"),
      uMouse = gl.getUniformLocation(prog, "uMouse"), uBands = gl.getUniformLocation(prog, "uBands");

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var mouse = { x: 0.35, y: 0.45 }, target = { x: 0.35, y: 0.45 }, hasPointer = false;
  var host = canvas.parentElement;

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var w = host.clientWidth, h = host.clientHeight;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    /* ~1 flute per 45 CSS px, like the reference */
    gl.uniform1f(uBands, Math.max(10, Math.round(h / 45)));
    if (typeof draw === "function") draw(lastT || 0);
  }
  resize();
  window.addEventListener("resize", resize);

  host.addEventListener("pointermove", function (e) {
    var r = host.getBoundingClientRect();
    target.x = (e.clientX - r.left) / r.width;
    target.y = (e.clientY - r.top) / r.height;
    hasPointer = true;
  });
  host.addEventListener("pointerleave", function () { hasPointer = false; });

  var visible = true, start = performance.now(), raf = 0, lastT = 0;
  function draw(t) {
    lastT = t;
    gl.uniform1f(uTime, t);
    gl.uniform2f(uMouse, mouse.x * 1.6, mouse.y * 1.6);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function frame(now) {
    var t = (now - start) / 1000;
    if (!hasPointer) { /* idle drift so it lives on touch devices too */
      target.x = 0.5 + 0.28 * Math.sin(t * 0.21);
      target.y = 0.5 + 0.22 * Math.cos(t * 0.17);
    }
    mouse.x += (target.x - mouse.x) * 0.045;
    mouse.y += (target.y - mouse.y) * 0.045;
    draw(t);
    if (!reduce && visible) raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (en) {
      var was = visible; visible = en[0].isIntersecting;
      if (visible && !was && !reduce) raf = requestAnimationFrame(frame);
    }).observe(host);
  }
})();
