/* public/assets/huddle_loader_particles.js

   Fullscreen canvas loader: particles swirl inward to form "HUDDLE".

   Usage:

     const loader = HuddleParticleLoader.mount();

     loader.show(); loader.hide(); loader.destroy();

*/

(function () {
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function clamp01(v) { return Math.max(0, Math.min(1, v)); }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function rand(min, max) { return min + Math.random() * (max - min); }

  function createEl(tag, attrs = {}, parent) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "style") Object.assign(el.style, v);
      else if (k === "class") el.className = v;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v);
    }
    if (parent) parent.appendChild(el);
    return el;
  }

  function mount(options = {}) {
    const opts = {
      text: "HUDDLE",
      brand: "#26c281",
      bg: "#0b1220",
      maxParticles: 2200,
      sampleStep: 5,
      rMin: 0.7,
      rMax: 2.0,
      attract: 0.040,
      swirl: 0.090,
      damping: 0.88,
      jitter: 0.012,
      driftSeconds: 0.8,
      settleSeconds: 2.2,
      ...options,
    };

    // Root overlay
    const root = createEl("div", { id: "huddle-loader-overlay", class: "huddle-loader-overlay" }, document.body);

    // Canvas
    const canvas = createEl("canvas", { class: "huddle-loader-canvas" }, root);
    const ctx = canvas.getContext("2d", { alpha: false });

    // UI (Skip)
    const ui = createEl("div", { class: "huddle-loader-ui" }, root);
    const pill = createEl("div", { class: "huddle-loader-pill" }, ui);
    createEl("div", { class: "huddle-loader-title" }, pill).textContent = "Loading…";
    const skipBtn = createEl("button", { class: "huddle-loader-skip" }, pill);
    skipBtn.textContent = "Skip";

    // Offscreen for text sampling
    const off = document.createElement("canvas");
    const offCtx = off.getContext("2d", { willReadFrequently: true });

    let DPR = Math.min(2, window.devicePixelRatio || 1);
    let particles = [];
    let targets = [];
    let startTime = 0;
    let raf = 0;
    let visible = false;
    let doneOnce = false;

    function resize() {
      DPR = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(window.innerWidth * DPR);
      canvas.height = Math.floor(window.innerHeight * DPR);
      canvas.style.width = "100vw";
      canvas.style.height = "100vh";
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }

    function makeTargets() {
      const w = window.innerWidth;
      const h = window.innerHeight;

      off.width = Math.floor(w);
      off.height = Math.floor(h);

      offCtx.clearRect(0, 0, w, h);

      const fontSize = Math.max(72, Math.min(190, Math.floor(w * 0.16)));
      offCtx.font = `800 ${fontSize}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
      offCtx.textAlign = "center";
      offCtx.textBaseline = "middle";

      // Soft glow pass
      offCtx.fillStyle = "rgba(38,194,129,0.18)";
      offCtx.fillText(opts.text, w / 2, h / 2 + 2);

      // Solid mask pass
      offCtx.fillStyle = "rgba(255,255,255,1)";
      offCtx.fillText(opts.text, w / 2, h / 2);

      const img = offCtx.getImageData(0, 0, w, h).data;
      const pts = [];
      const step = opts.sampleStep;

      for (let y = 0; y < h; y += step) {
        for (let x = 0; x < w; x += step) {
          const i = (y * w + x) * 4;
          const a = img[i + 3];
          if (a > 10) {
            pts.push({
              x: x + (Math.random() - 0.5) * step * 0.6,
              y: y + (Math.random() - 0.5) * step * 0.6,
            });
          }
        }
      }

      if (pts.length > opts.maxParticles) {
        for (let i = pts.length - 1; i > 0; i--) {
          const j = (Math.random() * (i + 1)) | 0;
          const t = pts[i]; pts[i] = pts[j]; pts[j] = t;
        }
        pts.length = opts.maxParticles;
      }

      return pts;
    }

    function spawnParticles() {
      const w = window.innerWidth;
      const h = window.innerHeight;

      particles = targets.map((t) => {
        const x = Math.random() * w;
        const y = Math.random() * h;

        return {
          x, y,
          vx: rand(-0.5, 0.5),
          vy: rand(-0.5, 0.5),
          tx: t.x, ty: t.y,
          r: rand(opts.rMin, opts.rMax),
          spin: rand(0.6, 1.4) * (Math.random() < 0.5 ? -1 : 1),
          phase: Math.random(),
        };
      });
    }

    function drawBackground() {
      const w = window.innerWidth;
      const h = window.innerHeight;

      ctx.fillStyle = opts.bg;
      ctx.fillRect(0, 0, w, h);

      // radial brand glow
      const g = ctx.createRadialGradient(w * 0.5, h * 0.35, 60, w * 0.5, h * 0.35, Math.max(w, h));
      g.addColorStop(0, "rgba(38,194,129,0.12)");
      g.addColorStop(0.55, "rgba(38,194,129,0.03)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    function tick(ts) {
      if (!visible) return;
      if (!startTime) startTime = ts;

      const elapsed = (ts - startTime) / 1000;
      const w = window.innerWidth;
      const h = window.innerHeight;

      drawBackground();

      const driftT = opts.driftSeconds;
      const settleT = opts.settleSeconds;

      let form = 0;
      if (elapsed <= driftT) form = 0;
      else form = easeOutCubic(clamp01((elapsed - driftT) / settleT));

      if (reduceMotion) form = 1;

      // if we fully formed once, we can keep it stable
      if (form >= 0.98) doneOnce = true;

      // behind-word glow as it forms
      if (form > 0.06) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = "rgba(38,194,129,0.28)";
        ctx.filter = "blur(16px)";
        ctx.beginPath();
        ctx.arc(w * 0.5, h * 0.5, 120 + form * 80, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        if (form === 0) {
          p.vx += (Math.random() - 0.5) * opts.jitter;
          p.vy += (Math.random() - 0.5) * opts.jitter;
          p.x += p.vx;
          p.y += p.vy;
        } else {
          const localForm = clamp01(form - p.phase * 0.22);

          const dx = p.tx - p.x;
          const dy = p.ty - p.y;

          p.vx += dx * opts.attract * localForm;
          p.vy += dy * opts.attract * localForm;

          // swirl
          p.vx += (-dy) * opts.swirl * localForm * p.spin * 0.012;
          p.vy += ( dx) * opts.swirl * localForm * p.spin * 0.012;

          const jit = opts.jitter * (1 - localForm);
          p.vx += (Math.random() - 0.5) * jit;
          p.vy += (Math.random() - 0.5) * jit;

          const damp = opts.damping + localForm * 0.10;
          p.vx *= damp;
          p.vy *= damp;

          p.x += p.vx;
          p.y += p.vy;
        }

        // wrap drift edges
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        if (p.y > h + 10) p.y = -10;

        const alpha = 0.18 + form * 0.82;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = form > 0.15 ? "rgba(233,238,252,0.92)" : "rgba(233,238,252,0.35)";

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(tick);
    }

    function resetSim() {
      resize();
      targets = makeTargets();
      spawnParticles();
      startTime = 0;
      doneOnce = false;
    }

    function show() {
      if (visible) return;
      visible = true;
      root.classList.add("is-visible");
      resetSim();
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    }

    function hide() {
      if (!visible) return;
      visible = false;
      root.classList.remove("is-visible");
      cancelAnimationFrame(raf);
    }

    function destroy() {
      cancelAnimationFrame(raf);
      root.remove();
      window.removeEventListener("resize", onResize);
    }

    function onResize() {
      if (!visible) return;
      resetSim();
    }

    skipBtn.addEventListener("click", () => hide());
    root.addEventListener("click", (e) => {
      // allow skip only if clicking UI pill area is NOT required; click anywhere to skip
      if (e.target === canvas) hide();
    });

    window.addEventListener("resize", onResize);

    // start hidden
    hide();

    return { show, hide, destroy, get doneOnce() { return doneOnce; } };
  }

  window.HuddleParticleLoader = { mount };
})();

