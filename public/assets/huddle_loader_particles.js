/* public/assets/huddle_loader_particles.js

   Fullscreen canvas loader: particles swirl inward to form the HUDDLE wordmark logo.

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
      imgSrc: "/assets/huddle-wordmark.png",
      brand: "#007A33", // Celtics green
      bg: "#0a0f1a", // Darker background to complement green
      maxParticles: 8000, // Many more particles for smooth, cloud-like look
      sampleStep: 2, // Finer sampling
      targetScale: 0.68,
      rMin: 0.8, // Smaller particles for smoother look
      rMax: 1.8, // Smaller max for less graininess
      attract: 0.045, // Gentle attraction
      swirl: 0.075, // Smooth swirl
      damping: 0.90, // High damping for smooth motion
      flockRadius: 40, // Radius for flocking behavior (bird-like groups)
      flockCohesion: 0.008, // How much particles stick together
      flockAlignment: 0.012, // How much particles align with neighbors
      flockSeparation: 0.015, // How much particles avoid crowding
      jitter: 0.013,
      driftSeconds: 0.8, // Slightly faster drift
      settleSeconds: 2.8, // Smooth formation time
      pulseSeconds: 2.5, // Pulse duration after formation
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
    
    // "Let's Huddle" button (shown after animation completes)
    const letsHuddleBtn = createEl("button", { class: "huddle-loader-lets-huddle" }, root);
    letsHuddleBtn.textContent = "Let's Huddle";

    // Offscreen for image sampling
    const off = document.createElement("canvas");
    const offCtx = off.getContext("2d", { willReadFrequently: true });

    let DPR = Math.min(2, window.devicePixelRatio || 1);
    let particles = [];
    let targets = [];
    let startTime = 0;
    let raf = 0;
    let visible = false;
    let doneOnce = false;
    let img = null;
    let imgLoaded = false;

    function resize() {
      DPR = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(window.innerWidth * DPR);
      canvas.height = Math.floor(window.innerHeight * DPR);
      canvas.style.width = "100vw";
      canvas.style.height = "100vh";
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }

    function loadImage() {
      if (imgLoaded && img && img.complete && img.naturalWidth > 0) {
        return Promise.resolve();
      }
      if (img && img.complete && img.naturalWidth > 0) {
        imgLoaded = true;
        return Promise.resolve();
      }
      return new Promise((resolve, reject) => {
        img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          // Double-check image is actually ready for drawing
          if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
            imgLoaded = true;
            resolve();
          } else {
            // Wait a bit more for image to fully decode
            setTimeout(() => {
              if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
                imgLoaded = true;
                resolve();
              } else {
                console.error("Image load promise resolved but image not ready");
                reject(new Error("Image not ready for drawing"));
              }
            }, 50);
          }
        };
        img.onerror = () => {
          console.error("Failed to load wordmark image:", opts.imgSrc);
          reject(new Error("Image load failed"));
        };
        img.src = opts.imgSrc;
      });
    }

    function makeTargets() {
      if (!imgLoaded || !img || !img.complete || img.naturalWidth === 0 || img.naturalHeight === 0) {
        console.warn("makeTargets called but image not ready", {
          imgLoaded,
          hasImg: !!img,
          complete: img?.complete,
          naturalWidth: img?.naturalWidth,
          naturalHeight: img?.naturalHeight
        });
        return [];
      }

      const w = window.innerWidth;
      const h = window.innerHeight;

      off.width = w;
      off.height = h;
      offCtx.clearRect(0, 0, w, h);

      // Fit logo to screen
      const scale = opts.targetScale;
      const maxW = w * scale;
      const maxH = h * scale;

      const s = Math.min(maxW / img.width, maxH / img.height);

      const drawW = img.width * s;
      const drawH = img.height * s;

      const x0 = (w - drawW) / 2;
      const y0 = (h - drawH) / 2;

      // draw logo onto offscreen
      offCtx.drawImage(img, x0, y0, drawW, drawH);

      const data = offCtx.getImageData(0, 0, w, h).data;

      const pts = [];
      const step = opts.sampleStep;

      // sample pixels where logo is visible
      // Image is RGB (no alpha), so use brightness to find light logo on dark background
      // Background is dark (#0b1220), logo is bright white/light colors
      
      for (let y = 0; y < h; y += step) {
        for (let x = 0; x < w; x += step) {
          const i = (y * w + x) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          
          // Calculate luminance (perceived brightness)
          const luminance = (r * 0.299 + g * 0.587 + b * 0.114);
          
          // Sample bright pixels (logo) - exclude dark background
          // Threshold: logo text/bubble is bright (luminance > 80-255)
          // Background is dark (luminance ~18)
          // Higher threshold = more selective, crisper logo
          if (luminance > 90) {
            pts.push({
              x: x + (Math.random() - 0.5) * step * 0.3, // Tighter placement for solid look
              y: y + (Math.random() - 0.5) * step * 0.3
            });
          }
        }
      }

      // cap particle count
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
          vx: rand(-0.6, 0.6),
          vy: rand(-0.6, 0.6),
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

      // Celtics green radial glow - deep, rich green theme
      const g = ctx.createRadialGradient(w * 0.5, h * 0.35, 60, w * 0.5, h * 0.35, Math.max(w, h));
      g.addColorStop(0, "rgba(0,122,51,0.18)"); // Celtics green with opacity
      g.addColorStop(0.4, "rgba(0,122,51,0.08)");
      g.addColorStop(0.7, "rgba(0,122,51,0.03)");
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
      const pulseT = opts.pulseSeconds;

      let form = 0;
      if (elapsed <= driftT) form = 0;
      else form = easeOutCubic(clamp01((elapsed - driftT) / settleT));

      if (reduceMotion) form = 1;

      // Calculate if we're in pulse phase (after formation completes)
      const formationCompleteTime = driftT + settleT;
      const isPulsing = elapsed > formationCompleteTime && elapsed <= formationCompleteTime + pulseT;
      const pulseProgress = isPulsing ? (elapsed - formationCompleteTime) / pulseT : 0;
      
      // Pulse effect: smooth sine wave for breathing effect
      const pulseScale = isPulsing ? 1 + Math.sin(pulseProgress * Math.PI * 4) * 0.08 : 1; // 4 pulses over duration
      const pulseGlow = isPulsing ? 0.3 + Math.sin(pulseProgress * Math.PI * 4) * 0.2 : 0;

      // Ensure form reaches 1.0 for complete formation
      form = Math.min(1.0, form);

      // if we fully formed once, we can keep it stable
      if (form >= 0.99 && elapsed >= formationCompleteTime) {
        doneOnce = true;
        // Show "Let's Huddle" button after formation completes and pulse starts
        if (letsHuddleBtn && !letsHuddleBtn.classList.contains('is-visible')) {
          setTimeout(() => {
            if (letsHuddleBtn) letsHuddleBtn.classList.add('is-visible');
          }, 1000); // Show after 1 second of pulse
        }
      }

      // behind-wordmark glow as it forms - Celtics green glow
      if (form > 0.06 || isPulsing) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        // Rich Celtics green glow that intensifies as logo forms, pulses when complete
        let glowIntensity = 0.15 + form * 0.25;
        if (isPulsing) {
          glowIntensity += pulseGlow; // Add pulse glow
        }
        ctx.fillStyle = `rgba(0,122,51,${glowIntensity})`; // Celtics green
        ctx.filter = "blur(20px)";
        const glowRadius = isPulsing ? (120 + form * 90) * pulseScale : (120 + form * 90);
        ctx.beginPath();
        ctx.arc(w * 0.5, h * 0.54, glowRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Apply flocking behavior for bird-like cloud movement
      applyFlocking(particles, form);
      
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        if (form === 0) {
          // Drift phase: gentle movement with flocking
          p.vx += (Math.random() - 0.5) * opts.jitter * 0.5; // Less jitter
          p.vy += (Math.random() - 0.5) * opts.jitter * 0.5;
          p.x += p.vx;
          p.y += p.vy;
        } else {
          const localForm = clamp01(form - p.phase * 0.08); // Smoother phase offset

          const dx = p.tx - p.x;
          const dy = p.ty - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          // Fibonacci spiral approach for smooth, professional motion
          // When moderately close, use golden angle spiral for elegant convergence
          let useSpiral = dist < 10 && dist > 1.5 && form > 0.4;
          
          if (useSpiral) {
            // Golden angle (Fibonacci spiral) = 137.508 degrees
            const GOLDEN_ANGLE = Math.PI * 2 * 0.382; // ~137.5 degrees in radians
            const spiralIndex = (p.phase * 1000 + i) % 1000; // Unique spiral index per particle
            const spiralRotation = GOLDEN_ANGLE * spiralIndex;
            
            // Current angle to target
            const targetAngle = Math.atan2(dy, dx);
            
            // Spiral direction: rotate by golden angle from radial direction
            const spiralAngle = targetAngle + spiralRotation;
            
            // Calculate spiral forces: radial (toward center) + tangential (spiral motion)
            const spiralStrength = localForm * (1 - dist / 15); // Stronger when closer
            const radialForce = 0.6; // 60% toward target
            const tangentialForce = 0.4; // 40% perpendicular (spiral)
            
            // Radial component (toward target)
            const radialX = dx * radialForce;
            const radialY = dy * radialForce;
            
            // Tangential component (perpendicular to radial, rotated by golden angle)
            const perpX = -dy;
            const perpY = dx;
            const perpLen = Math.sqrt(perpX * perpX + perpY * perpY);
            const perpNormX = perpLen > 0 ? perpX / perpLen : 0;
            const perpNormY = perpLen > 0 ? perpY / perpLen : 0;
            
            // Tangential force with spiral rotation
            const tangentX = Math.cos(spiralAngle) * tangentialForce * dist * 0.1;
            const tangentY = Math.sin(spiralAngle) * tangentialForce * dist * 0.1;
            
            // Combined force
            const forceX = (radialX + tangentX) * opts.attract * spiralStrength * 3.0;
            const forceY = (radialY + tangentY) * opts.attract * spiralStrength * 3.0;
            
            p.vx += forceX;
            p.vy += forceY;
          } else {
            // Direct attraction when far or very close
            let attractStrength = opts.attract;
            if (dist < 15) {
              attractStrength = opts.attract * (2.0 + (15 - dist) / 15 * 3.0);
            }
            if (dist < 5) {
              attractStrength = opts.attract * 6.0;
            }
            if (dist < 1.5) {
              // Lock to target when very close
              const lockStrength = 0.8;
              p.x = p.x + (p.tx - p.x) * lockStrength;
              p.y = p.y + (p.ty - p.y) * lockStrength;
              p.vx *= 0.3;
              p.vy *= 0.3;
            } else {
              p.vx += dx * attractStrength * localForm;
              p.vy += dy * attractStrength * localForm;
            }
          }

          // Reduced swirl for smoother motion (less glitchy)
          if (!useSpiral) {
            const swirlStrength = dist > 8 ? opts.swirl * 0.5 : opts.swirl * 0.2;
            p.vx += (-dy) * swirlStrength * localForm * p.spin * 0.005;
            p.vy += ( dx) * swirlStrength * localForm * p.spin * 0.005;
          }

          // Minimal jitter for smooth, professional motion
          const jit = opts.jitter * (1 - localForm * localForm * localForm) * Math.min(1, dist / 20) * 0.3; // Much less jitter
          p.vx += (Math.random() - 0.5) * jit;
          p.vy += (Math.random() - 0.5) * jit;

          // High damping for smooth, professional motion (less bouncing)
          let damp = 0.92 + localForm * 0.06; // High damping throughout
          if (dist < 5) {
            damp = 0.94 + localForm * 0.04; // Even higher damping when close
          }
          p.vx *= damp;
          p.vy *= damp;

          // Smooth movement
          p.x += p.vx;
          p.y += p.vy;
          
          // Smooth locking when close - no abrupt snapping
          if (form > 0.7) {
            const currentDist = Math.sqrt((p.x - p.tx) ** 2 + (p.y - p.ty) ** 2);
            
            if (currentDist < 0.3) {
              // Very close: smooth lock
              const lockStrength = 0.95;
              p.x = p.x + (p.tx - p.x) * lockStrength;
              p.y = p.y + (p.ty - p.y) * lockStrength;
              p.vx *= 0.1;
              p.vy *= 0.1;
            } else if (currentDist < 1.5 && form > 0.85) {
              // Close and formation nearly complete: gentle pull
              const pull = 0.4;
              p.x = p.x + (p.tx - p.x) * pull;
              p.y = p.y + (p.ty - p.y) * pull;
              p.vx *= 0.6;
              p.vy *= 0.6;
            }
          }
          
          // Final lock when fully formed
          if (form >= 0.98) {
            const finalDist = Math.sqrt((p.x - p.tx) ** 2 + (p.y - p.ty) ** 2);
            if (finalDist > 0.05) {
              // Smooth final positioning
              const finalLock = 0.98;
              p.x = p.x + (p.tx - p.x) * finalLock;
              p.y = p.y + (p.ty - p.y) * finalLock;
              p.vx = 0;
              p.vy = 0;
            } else {
              p.x = p.tx;
              p.y = p.ty;
              p.vx = 0;
              p.vy = 0;
            }
          }
        }

        // wrap drift edges
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        if (p.y > h + 10) p.y = -10;

        const alpha = 0.18 + form * 0.82;
        
        // Celtics green color scheme with smooth, cloud-like rendering
        // Use softer alpha blending for smooth, non-grainy look
        ctx.globalAlpha = alpha * 0.8; // Softer for smooth blending
        
        if (form > 0.12) {
          // Formed logo: smooth Celtics green with gentle glow
          ctx.save();
          
          // Softer glow for smooth, cloud-like look
          let glowStrength = form > 0.95 ? 2.5 : 1.2; // Gentler glow
          if (isPulsing) {
            glowStrength += pulseGlow * 1.5;
          }
          ctx.shadowBlur = glowStrength;
          ctx.shadowColor = "rgba(0,122,51,0.5)"; // Softer green glow
          
          // Smooth color with minimal variation for cloud-like appearance
          const greenIntensity = 0.85 + Math.random() * 0.15; // Slight variation
          const isHighlight = Math.random() < 0.06; // Fewer highlights for smoother look
          
          // Apply pulse scale to particle size when pulsing
          const particleRadius = isPulsing ? p.r * pulseScale : p.r;
          
          if (isHighlight) {
            // Soft white highlights
            ctx.fillStyle = `rgba(255,255,255,${alpha * 0.6})`;
            ctx.shadowColor = "rgba(255,255,255,0.3)";
          } else {
            // Smooth Celtics green - less opaque for cloud-like blending
            ctx.fillStyle = `rgba(0,122,51,${alpha * greenIntensity * 0.9})`;
          }
          
          ctx.beginPath();
          ctx.arc(p.x, p.y, particleRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else {
          // Drifting: soft green with smooth blending
          ctx.globalAlpha = alpha * 0.5;
          ctx.fillStyle = "rgba(0,122,51,0.3)";
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      
      // Post-processing: Add subtle fill/blur when logo is fully formed for ultra-solid look
      if (form > 0.95) {
        ctx.save();
        ctx.globalCompositeOperation = "source-over";
        const fillAlpha = form >= 0.99 ? 0.2 : (form - 0.95) * 20 * 0.15; // Full fill when complete
        ctx.globalAlpha = fillAlpha;
        ctx.filter = "blur(0.8px)";
        // Draw a subtle overlay to fill any tiny gaps - ensures solid, crisp logo
        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          const distToTarget = Math.sqrt((p.x - p.tx) ** 2 + (p.y - p.ty) ** 2);
          if (distToTarget < 3) { // Close to target
            const fillRadius = isPulsing ? p.r * 0.85 * pulseScale : p.r * 0.85;
            ctx.fillStyle = "rgba(0,122,51,0.35)";
            ctx.beginPath();
            ctx.arc(p.tx, p.ty, fillRadius, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
      }

      raf = requestAnimationFrame(tick);
    }

    function resetSim() {
      resize();
      if (imgLoaded && img) {
        targets = makeTargets();
        if (targets.length > 0) {
          spawnParticles();
        } else {
          console.warn("No targets generated from image - check image path and format");
        }
      } else {
        console.warn("Image not loaded yet - cannot generate particles");
        targets = [];
        particles = [];
      }
      startTime = 0;
      doneOnce = false;
    }

    function show() {
      if (visible) return;
      
      // Load image if not already loaded
      loadImage().then(() => {
        // Double-check image is actually loaded and ready for drawing
        if (!imgLoaded || !img || !img.complete || img.naturalWidth === 0 || img.naturalHeight === 0) {
          console.error("Image load promise resolved but image not ready", {
            imgLoaded,
            hasImg: !!img,
            complete: img?.complete,
            naturalWidth: img?.naturalWidth,
            naturalHeight: img?.naturalHeight
          });
          // Retry after a short delay
          setTimeout(() => {
            if (img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
              imgLoaded = true;
              visible = true;
              root.classList.add("is-visible");
              resetSim();
              if (particles.length > 0) {
                cancelAnimationFrame(raf);
                raf = requestAnimationFrame(tick);
              }
            }
          }, 100);
          return;
        }
        visible = true;
        root.classList.add("is-visible");
        resetSim();
        // Only start animation if we have particles
        if (particles.length > 0) {
          cancelAnimationFrame(raf);
          raf = requestAnimationFrame(tick);
        } else {
          console.error("No particles to animate - image may not have valid content");
        }
      }).catch((err) => {
        console.error("Failed to load wordmark image:", opts.imgSrc, err);
        console.error("Loader will not display - please check image path");
        // Don't show loader if image fails - better to show nothing than broken state
      });
    }

    function hide() {
      if (!visible) return;
      visible = false;
      root.classList.remove("is-visible");
      // Delay display removal to allow fade-out transition
      setTimeout(() => {
        if (!visible) {
          cancelAnimationFrame(raf);
        }
      }, 220);
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
    // Don't allow clicking canvas to skip - let animation complete fully
    // root.addEventListener("click", (e) => {
    //   if (e.target === canvas) hide();
    // });

    window.addEventListener("resize", onResize);

    // Preload image on mount
    loadImage().catch(() => {
      // Silent fail, will retry on show()
    });

    // start hidden
    hide();

    return { 
      show, 
      hide, 
      destroy, 
      get doneOnce() { return doneOnce; },
      get letsHuddleBtn() { return letsHuddleBtn; }
    };
  }

  window.HuddleParticleLoader = { mount };
})();
