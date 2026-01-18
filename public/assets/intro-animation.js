/**
 * Huddle Intro Animation System
 * Implements the 6-step animation sequence with particle logo formation:
 * 1. Backdrop Phase (0-1s) - Floating particles
 * 2. Orbits & Lines (1-3s) - Concentric orbits and fluid lines
 * 3. Logo Emergence via Particles (3-3.8s) - Particles form Huddle logo
 * 4. Active Room Reveal (3.8-5s) - Room cards slide in
 * 5. CTA Appearance (5-7s) - Buttons fade in
 * 6. Post-Animation Idle State - Gentle pulsing
 */

(function() {
  'use strict';

  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function clamp01(v) { return Math.max(0, Math.min(1, v)); }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function easeOutExpo(t) { return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); }
  function rand(min, max) { return min + Math.random() * (max - min); }

  const IntroAnimation = {
    canvas: null,
    ctx: null,
    offCanvas: null,
    offCtx: null,
    startTime: 0,
    running: false,
    rafId: 0,
    
    // Particle system for logo formation - use backdrop particles
    targets: [],
    img: null,
    imgLoaded: false,
    
    // Animation elements
    backdropParticles: [], // These will form the logo
    orbits: [],
    lines: [],
    
    // UI elements
    activeRoomsPanel: null,
    introCTA: null,
    letsHuddleBtn: null,
    
    // Configuration
    duration: 8000, // 8 seconds total
    DPR: 1,
    
    // Particle options - optimized for natural, flowing, smooth formation
    opts: {
      imgSrc: "/assets/huddle-wordmark.png",
      brand: "#007A33", // Celtics green
      bg: "rgba(15, 18, 30, 0.95)", // Dark background
      maxParticles: 2500, // Reduced for smoother, less grainy appearance
      sampleStep: 1.5, // Balanced sampling
      targetScale: 0.75, // Larger scale to capture more of the logo
      rMin: 1.5, // Larger particles for smoother look
      rMax: 2.8,
      attract: 0.20, // Stronger attraction for faster formation
      swirl: 0.015, // Moderate swirl for spiral effect
      damping: 0.90, // Higher damping for smoother motion
      jitter: 0.0005, // Minimal jitter for smooth flow
      driftSeconds: 0.0, // No drift - start forming immediately
      settleSeconds: 1.8, // Formation time - fits in 8 second total
      pulseSeconds: 2.5,
    },
    
    init() {
      // Get canvas
      this.canvas = document.getElementById('introCanvas');
      if (!this.canvas) {
        console.warn('[Intro] Canvas not found');
        return;
      }
      
      this.ctx = this.canvas.getContext('2d', { alpha: false });
      if (!this.ctx) {
        console.warn('[Intro] Canvas context not available');
        return;
      }
      
      // Offscreen canvas for image sampling
      this.offCanvas = document.createElement('canvas');
      this.offCtx = this.offCanvas.getContext('2d', { willReadFrequently: true });
      
      // Get UI elements
      this.activeRoomsPanel = document.getElementById('activeRoomsPanel');
      this.introCTA = document.getElementById('introCTA');
      this.letsHuddleBtn = document.getElementById('letsHuddleBtn');
      
      // Setup canvas
      this.setupCanvas();
      
      // Initialize backdrop particles first (these will form the logo)
      this.initBackdropParticles();
      
      // Load image and assign targets to backdrop particles
      this.loadImage().then(() => {
        console.log('[Intro] Image loaded, sampling targets...');
        this.sampleTargets();
        console.log('[Intro] Targets sampled:', this.targets.length);
        if (this.targets.length === 0) {
          console.error('[Intro] No targets found! Image may not have loaded correctly. Starting animation anyway...');
          // Start anyway with backdrop particles (they'll just drift, no logo formation)
          this.start();
          return;
        }
        // Assign targets to backdrop particles
        this.assignTargetsToBackdropParticles();
        console.log('[Intro] Targets assigned to backdrop particles');
        this.start();
      }).catch(err => {
        console.error('[Intro] Failed to load image:', err);
        // Start anyway with backdrop particles
        this.start();
      });
      
      // Setup resize handler
      window.addEventListener('resize', () => {
        this.setupCanvas();
        if (this.imgLoaded && this.targets.length > 0) {
          this.sampleTargets();
          // Reassign targets to existing backdrop particles
          this.assignTargetsToBackdropParticles();
        }
      });
    },
    
    setupCanvas() {
      if (!this.canvas) {
        console.error('[Intro] Cannot setup canvas: canvas element not found');
        return;
      }
      
      this.DPR = Math.min(2, window.devicePixelRatio || 1);
      const rect = this.canvas.getBoundingClientRect();
      
      if (rect.width === 0 || rect.height === 0) {
        console.warn('[Intro] Canvas has zero dimensions, using window size');
        this.canvas.width = Math.floor(window.innerWidth * this.DPR);
        this.canvas.height = Math.floor(window.innerHeight * this.DPR);
        this.canvas.style.width = `${window.innerWidth}px`;
        this.canvas.style.height = `${window.innerHeight}px`;
      } else {
        this.canvas.width = Math.floor(rect.width * this.DPR);
        this.canvas.height = Math.floor(rect.height * this.DPR);
        this.canvas.style.width = `${rect.width}px`;
        this.canvas.style.height = `${rect.height}px`;
      }
      
      if (this.ctx) {
        this.ctx.setTransform(this.DPR, 0, 0, this.DPR, 0, 0);
      }
      
      console.log('[Intro] Canvas setup complete:', this.canvas.width, 'x', this.canvas.height);
    },
    
    loadImage() {
      if (this.imgLoaded && this.img && this.img.complete && this.img.naturalWidth > 0) {
        return Promise.resolve();
      }
      
      return new Promise((resolve, reject) => {
        this.img = new Image();
        this.img.crossOrigin = "anonymous";
        this.img.onload = () => {
          if (this.img.complete && this.img.naturalWidth > 0 && this.img.naturalHeight > 0) {
            this.imgLoaded = true;
            resolve();
          } else {
            setTimeout(() => {
              if (this.img.complete && this.img.naturalWidth > 0 && this.img.naturalHeight > 0) {
                this.imgLoaded = true;
                resolve();
              } else {
                reject(new Error("Image not ready"));
              }
            }, 50);
          }
        };
        this.img.onerror = () => reject(new Error("Image load failed"));
        this.img.src = this.opts.imgSrc;
      });
    },
    
    sampleTargets() {
      if (!this.imgLoaded || !this.img) {
        console.warn('[Intro] Cannot sample targets: image not loaded');
        return;
      }
      
      const w = window.innerWidth;
      const h = window.innerHeight;
      
      if (w === 0 || h === 0) {
        console.warn('[Intro] Canvas dimensions are zero');
        return;
      }
      
      this.offCanvas.width = w;
      this.offCanvas.height = h;
      this.offCtx.clearRect(0, 0, w, h);
      
      // Fill background with dark color first
      this.offCtx.fillStyle = '#0a0f1a';
      this.offCtx.fillRect(0, 0, w, h);
      
      const scale = this.opts.targetScale;
      const maxW = w * scale;
      const maxH = h * scale;
      const s = Math.min(maxW / this.img.width, maxH / this.img.height);
      const drawW = this.img.width * s;
      const drawH = this.img.height * s;
      const x0 = (w - drawW) / 2;
      const y0 = (h - drawH) / 2;
      
      // Draw the image
      this.offCtx.drawImage(this.img, x0, y0, drawW, drawH);
      const imageData = this.offCtx.getImageData(0, 0, w, h);
      const data = imageData.data;
      
      if (!data || data.length === 0) {
        console.error('[Intro] Failed to get image data');
        return;
      }
      
      console.log('[Intro] Image data length:', data.length, 'Expected:', w * h * 4);
      
      let pts = [];
      const step = this.opts.sampleStep;
      let maxLuminance = -1;
      let minLuminance = 256;
      let sampledPixels = 0;
      let allLuminances = [];
      
      // First pass: collect all luminances to understand the image
      for (let y = 0; y < h; y += step) {
        for (let x = 0; x < w; x += step) {
          const i = (y * w + x) * 4;
          if (i + 3 >= data.length) continue; // Bounds check
          
          const r = data[i] || 0;
          const g = data[i + 1] || 0;
          const b = data[i + 2] || 0;
          const a = data[i + 3] || 0; // Alpha channel
          
          // Skip fully transparent pixels
          if (a < 5) continue;
          
          const luminance = (r * 0.299 + g * 0.587 + b * 0.114);
          if (!isNaN(luminance) && isFinite(luminance)) {
            sampledPixels++;
            allLuminances.push(luminance);
            maxLuminance = Math.max(maxLuminance, luminance);
            minLuminance = Math.min(minLuminance, luminance);
          }
        }
      }
      
      // Calculate adaptive threshold based on actual image content
      allLuminances.sort((a, b) => a - b);
      const medianLuminance = allLuminances.length > 0 ? allLuminances[Math.floor(allLuminances.length / 2)] : 128;
      const adaptiveThreshold = Math.max(10, medianLuminance * 0.3); // Use 30% of median as threshold
      
      // Fix NaN values
      if (isNaN(minLuminance) || minLuminance === 256) minLuminance = 0;
      if (isNaN(maxLuminance) || maxLuminance === -1) maxLuminance = 255;
      if (isNaN(medianLuminance)) medianLuminance = 128;
      
      console.log('[Intro] Luminance stats - Min:', minLuminance, 'Max:', maxLuminance, 'Median:', medianLuminance, 'Adaptive threshold:', adaptiveThreshold, 'Sampled pixels:', sampledPixels);
      
      // Second pass: sample points using adaptive threshold
      for (let y = 0; y < h; y += step) {
        for (let x = 0; x < w; x += step) {
          const i = (y * w + x) * 4;
          if (i + 3 >= data.length) continue;
          
          const r = data[i] || 0;
          const g = data[i + 1] || 0;
          const b = data[i + 2] || 0;
          const a = data[i + 3] || 0;
          
          // Skip fully transparent pixels
          if (a < 5) continue;
          
          const luminance = (r * 0.299 + g * 0.587 + b * 0.114);
          
          if (!isNaN(luminance) && isFinite(luminance) && luminance > adaptiveThreshold) {
            pts.push({
              x: x + (Math.random() - 0.5) * step * 0.2,
              y: y + (Math.random() - 0.5) * step * 0.2
            });
          }
        }
      }
      
      console.log('[Intro] Sampled points:', pts.length, 'Luminance range:', minLuminance, '-', maxLuminance);
      
      // If we still got very few points, use even lower threshold
      if (pts.length < 200) {
        console.warn('[Intro] Very few points sampled, trying very low threshold...');
        pts = [];
        const veryLowThreshold = Math.max(5, adaptiveThreshold * 0.5);
        for (let y = 0; y < h; y += step) {
          for (let x = 0; x < w; x += step) {
            const i = (y * w + x) * 4;
            if (i + 3 >= data.length) continue;
            
            const r = data[i] || 0;
            const g = data[i + 1] || 0;
            const b = data[i + 2] || 0;
            const a = data[i + 3] || 0;
            
            if (a < 5) continue;
            
            const luminance = (r * 0.299 + g * 0.587 + b * 0.114);
            
            if (!isNaN(luminance) && isFinite(luminance) && luminance > veryLowThreshold) {
              pts.push({
                x: x + (Math.random() - 0.5) * step * 0.2,
                y: y + (Math.random() - 0.5) * step * 0.2
              });
            }
          }
        }
        console.log('[Intro] Re-sampled with very low threshold:', pts.length);
      }
      
      // Ensure we have enough points - if we have too few, duplicate and distribute
      // We want enough points so all particles can be assigned to form the logo
      const minPointsNeeded = Math.min(this.opts.maxParticles, 2000); // Enough for all particles
      if (pts.length < minPointsNeeded) {
        console.warn('[Intro] Very few points after sampling, duplicating to ensure coverage...');
        const originalPts = [...pts];
        // Duplicate points with slight variations to fill the logo
        while (pts.length < minPointsNeeded) {
          for (const pt of originalPts) {
            if (pts.length >= minPointsNeeded) break;
            // Add slight variations to create density
            pts.push({
              x: pt.x + (Math.random() - 0.5) * 2.5,
              y: pt.y + (Math.random() - 0.5) * 2.5
            });
          }
        }
        console.log('[Intro] Expanded points to', pts.length, 'for full logo coverage');
      }
      
      // Cap to maxParticles - consistent count
      if (pts.length > this.opts.maxParticles) {
        // Shuffle and take first N
        for (let i = pts.length - 1; i > 0; i--) {
          const j = (Math.random() * (i + 1)) | 0;
          [pts[i], pts[j]] = [pts[j], pts[i]];
        }
        pts.length = this.opts.maxParticles;
      }
      
      this.targets = pts;
      console.log('[Intro] Final targets:', this.targets.length);
      
      if (this.targets.length === 0) {
        console.error('[Intro] ERROR: No targets after sampling! Image may be all dark or threshold too high.');
      }
    },
    
    spawnParticles() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const centerX = w / 2;
      const centerY = h / 2;
      
      // Spawn particles in a controlled pattern around the center
      this.particles = [];
      for (let i = 0; i < this.targets.length; i++) {
        const t = this.targets[i];
        // Spawn in a ring around center, not completely random
        const angle = (i / this.targets.length) * Math.PI * 2;
        const radius = Math.max(w, h) * 0.6;
        const spawnX = centerX + Math.cos(angle) * radius * (0.7 + Math.random() * 0.3);
        const spawnY = centerY + Math.sin(angle) * radius * (0.7 + Math.random() * 0.3);
        
        this.particles.push({
          x: spawnX,
          y: spawnY,
          vx: 0,
          vy: 0,
          tx: t.x,
          ty: t.y,
          r: rand(this.opts.rMin, this.opts.rMax),
          phase: i / this.targets.length, // Staggered phase for smooth formation
          initialDist: Math.sqrt((spawnX - t.x) ** 2 + (spawnY - t.y) ** 2)
        });
      }
    },
    
    assignTargetsToBackdropParticles() {
      if (!this.targets || this.targets.length === 0) {
        console.warn('[Intro] No targets to assign');
        return;
      }
      
      if (!this.backdropParticles || this.backdropParticles.length === 0) {
        console.warn('[Intro] No backdrop particles to assign targets to');
        return;
      }
      
      // Assign targets to ALL backdrop particles
      // Distribute targets across all particles using modulo to cycle through targets
      console.log('[Intro] Assigning targets to ALL', this.backdropParticles.length, 'backdrop particles from', this.targets.length, 'targets');
      
      for (let i = 0; i < this.backdropParticles.length; i++) {
        const p = this.backdropParticles[i];
        // Cycle through targets to assign to all particles
        const targetIndex = i % this.targets.length;
        const t = this.targets[targetIndex];
        
        // Add slight random offset to create better distribution
        const offsetX = (Math.random() - 0.5) * 2;
        const offsetY = (Math.random() - 0.5) * 2;
        
        // Add target properties to backdrop particle
        p.tx = t.x + offsetX;
        p.ty = t.y + offsetY;
        p.vx = p.vx || 0;
        p.vy = p.vy || 0;
        p.r = rand(this.opts.rMin, this.opts.rMax);
        p.phase = i / this.backdropParticles.length; // Unique phase for each particle
        p.spiralPhase = i * 0.1; // Spiral rotation phase
        p.initialDist = Math.sqrt((p.x - p.tx) ** 2 + (p.y - p.ty) ** 2);
        p.hasTarget = true;
      }
      
      const particlesWithTargets = this.backdropParticles.filter(p => p.hasTarget).length;
      console.log('[Intro] Assigned targets to ALL', particlesWithTargets, 'backdrop particles - all will form the logo!');
    },
    
    initBackdropParticles() {
      // Create enough particles to form the logo (will be assigned targets later)
      const count = this.opts.maxParticles; // Use maxParticles count
      const w = window.innerWidth;
      const h = window.innerHeight;
      
      this.backdropParticles = [];
      for (let i = 0; i < count; i++) {
        this.backdropParticles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          radius: 2 + Math.random() * 1,
          opacity: 0.3 + Math.random() * 0.3,
          vx: (Math.random() - 0.5) * 0.5,
          vy: (Math.random() - 0.5) * 0.5,
          hasTarget: false, // Will be set when targets are assigned
          tx: null,
          ty: null,
          r: rand(this.opts.rMin, this.opts.rMax),
          phase: Math.random()
        });
      }
    },
    
    initOrbits() {
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      
      this.orbits = [
        { radius: 120, progress: 0, segments: 60 },
        { radius: 180, progress: 0, segments: 80 },
        { radius: 240, progress: 0, segments: 100 }
      ];
    },
    
    initLines() {
      const count = 8;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const centerX = w / 2;
      const centerY = h / 2;
      
      this.lines = [];
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const startDist = Math.max(w, h) * 0.6;
        const startX = centerX + Math.cos(angle) * startDist;
        const startY = centerY + Math.sin(angle) * startDist;
        
        this.lines.push({
          startX,
          startY,
          endX: centerX,
          endY: centerY,
          progress: 0,
          phase: Math.random() * Math.PI * 2,
          speed: 0.02 + Math.random() * 0.02
        });
      }
    },
    
    start() {
      if (this.running) {
        console.log('[Intro] Animation already running');
        return;
      }
      
      if (!this.canvas || !this.ctx) {
        console.error('[Intro] Cannot start animation: canvas or context not available');
        return;
      }
      
      console.log('[Intro] Starting animation...');
      this.running = true;
      this.startTime = performance.now();
      
      const animate = (now) => {
        if (!this.running) return;
        
        if (!this.canvas || !this.ctx) {
          console.error('[Intro] Canvas or context lost during animation');
          this.running = false;
          return;
        }
        
        const elapsed = now - this.startTime;
        const t = elapsed / 1000; // Time in seconds
        
        // Clear and draw background
        try {
          this.drawBackground();
        } catch (err) {
          console.error('[Intro] Error drawing background:', err);
        }
        
        // Phase 1: Backdrop (0-0.8s) - Quick backdrop
        if (t < 0.8) {
          try {
            this.drawBackdrop(t / 0.8);
          } catch (err) {
            console.error('[Intro] Error drawing backdrop:', err);
          }
        }
        
        // Phase 2: Logo Emergence via Particles (0.8-4.8s) - 4 seconds for smooth formation
        if (t >= 0.8) {
          try {
            this.drawBackdrop(1);
            if (t < 4.8) {
              const phase2Progress = Math.min(1, (t - 0.8) / 4); // 4 seconds for smooth formation
              this.drawParticleLogo(phase2Progress);
            } else {
              // Keep drawing logo after formation completes
              this.drawParticleLogo(1, true); // Enable pulsing
            }
          } catch (err) {
            console.error('[Intro] Error drawing particle logo:', err);
          }
        }
        
        // Continue animation
        this.rafId = requestAnimationFrame(animate);
      };
      
      this.rafId = requestAnimationFrame(animate);
      console.log('[Intro] Animation loop started');
    },
    
    drawBackground() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      
      // Dark background
      this.ctx.fillStyle = this.opts.bg;
      this.ctx.fillRect(0, 0, w, h);
      
      // Radial gradient glow
      const g = this.ctx.createRadialGradient(w * 0.5, h * 0.35, 60, w * 0.5, h * 0.35, Math.max(w, h));
      g.addColorStop(0, "rgba(75, 85, 135, 0.3)");
      g.addColorStop(0.5, "rgba(30, 35, 60, 0.6)");
      g.addColorStop(1, "rgba(15, 18, 30, 0.95)");
      this.ctx.fillStyle = g;
      this.ctx.fillRect(0, 0, w, h);
    },
    
    drawBackdrop(progress) {
      // Draw backdrop particles that don't have targets yet
      const w = window.innerWidth;
      const h = window.innerHeight;
      
      // If no targets were found, draw all particles as backdrop
      const shouldDrawAll = this.targets.length === 0;
      
      for (const p of this.backdropParticles) {
        if (!p.hasTarget || shouldDrawAll) {
          p.x += p.vx;
          p.y += p.vy;
          
          if (p.x < 0) p.x = w;
          if (p.x > w) p.x = 0;
          if (p.y < 0) p.y = h;
          if (p.y > h) p.y = 0;
          
          this.ctx.fillStyle = `rgba(255, 255, 255, ${p.opacity * progress})`;
          this.ctx.beginPath();
          this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          this.ctx.fill();
        }
      }
    },
    
    drawOrbits(progress) {
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      
      for (const orbit of this.orbits) {
        const drawProgress = Math.min(progress * 1.2, 1);
        const segmentsToDraw = Math.floor(orbit.segments * drawProgress);
        
        this.ctx.strokeStyle = `rgba(255, 255, 255, ${0.15 * drawProgress})`;
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        
        for (let i = 0; i < segmentsToDraw; i++) {
          const angle = (i / orbit.segments) * Math.PI * 2;
          const x = centerX + Math.cos(angle) * orbit.radius;
          const y = centerY + Math.sin(angle) * orbit.radius;
          
          if (i === 0) {
            this.ctx.moveTo(x, y);
          } else {
            this.ctx.lineTo(x, y);
          }
        }
        
        if (segmentsToDraw > 0) {
          this.ctx.stroke();
        }
      }
    },
    
    drawLines(progress) {
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      
      for (const line of this.lines) {
        const drawProgress = Math.min(progress * 1.5, 1);
        const currentX = line.startX + (line.endX - line.startX) * drawProgress;
        const currentY = line.startY + (line.endY - line.startY) * drawProgress;
        
        const offset = Math.sin(line.phase + performance.now() * 0.001) * 5 * (1 - drawProgress);
        const perpX = -(line.endY - line.startY);
        const perpY = line.endX - line.startX;
        const perpLen = Math.sqrt(perpX * perpX + perpY * perpY);
        const oscX = currentX + (perpX / perpLen) * offset;
        const oscY = currentY + (perpY / perpLen) * offset;
        
        this.ctx.strokeStyle = `rgba(255, 255, 255, ${0.2 * (1 - drawProgress)})`;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(line.startX, line.startY);
        this.ctx.lineTo(oscX, oscY);
        this.ctx.stroke();
      }
    },
    
    drawParticleLogo(progress, isPulsing = false) {
      if (!this.backdropParticles || this.backdropParticles.length === 0) {
        console.warn('[Intro] No backdrop particles to draw');
        return;
      }
      
      const w = window.innerWidth;
      const h = window.innerHeight;
      
      // Natural, flowing formation progress with smooth easing
      // Use easeOutCubic for more natural deceleration
      const form = easeOutCubic(clamp01(progress));
      
      // Get particles with targets
      let particlesWithTargets = this.backdropParticles.filter(p => p.hasTarget);
      
      if (particlesWithTargets.length === 0) {
        // Debug: log once if no particles have targets
        if (Math.random() < 0.1) {
          console.warn('[Intro] No particles with targets! Total particles:', this.backdropParticles.length, 'Total targets:', this.targets.length);
        }
        return;
      }
      
      // Debug: log formation progress occasionally
      if (Math.random() < 0.01) {
        console.log('[Intro] Formation progress:', form.toFixed(2), 'Particles with targets:', particlesWithTargets.length);
      }
      
      // Pulse effect
      let pulseScale = 1;
      let pulseGlow = 0;
      if (isPulsing) {
        const elapsed = (performance.now() - this.startTime) / 1000;
        const pulseStart = this.opts.driftSeconds + this.opts.settleSeconds;
        const pulseProgress = ((elapsed - pulseStart) % (this.opts.pulseSeconds * 2)) / this.opts.pulseSeconds;
        pulseScale = 1 + Math.sin(pulseProgress * Math.PI * 4) * 0.08;
        pulseGlow = 0.3 + Math.sin(pulseProgress * Math.PI * 4) * 0.2;
      }
      
      // Glow effect
      if (form > 0.05 || isPulsing) {
        this.ctx.save();
        this.ctx.globalCompositeOperation = "lighter";
        let glowIntensity = 0.15 + form * 0.25;
        if (isPulsing) glowIntensity += pulseGlow;
        this.ctx.fillStyle = `rgba(0,122,51,${glowIntensity})`;
        this.ctx.filter = "blur(20px)";
        const glowRadius = (120 + form * 90) * pulseScale;
        this.ctx.beginPath();
        this.ctx.arc(w * 0.5, h * 0.54, glowRadius, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.restore();
      }
      
      // Update and draw backdrop particles - those with targets form the logo
      for (let i = 0; i < this.backdropParticles.length; i++) {
        const p = this.backdropParticles[i];
        
        if (!p.hasTarget) {
          // Particles without targets are handled by drawBackdrop
          // Skip them here - they're drawn in the backdrop phase
          continue;
        }
        
        // Particles with targets form the logo
        // Staggered formation based on phase for smoother appearance
        const particleForm = clamp01(form - p.phase * 0.15);
        
        if (particleForm <= 0) {
          // Pre-formation: particles spiral towards center before forming logo
          const centerX = w / 2;
          const centerY = h / 2;
          const dx = centerX - p.x;
          const dy = centerY - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 0) {
            // Gentle attraction to center
            const pullStrength = 0.006 * (1 - dist / Math.max(w, h));
            const dirX = dx / dist;
            const dirY = dy / dist;
            
            // Add spiral motion even in pre-formation phase
            const preSpiralSpeed = 0.02;
            p.spiralPhase = (p.spiralPhase || 0) + preSpiralSpeed;
            const preSpiralAngle = p.spiralPhase + p.phase * Math.PI * 2;
            const perpX = -dirY;
            const perpY = dirX;
            const preSpiralRadius = Math.min(dist * 0.2, 20);
            
            // Combine center pull with spiral
            p.vx += dirX * pullStrength;
            p.vy += dirY * pullStrength;
            p.vx += perpX * Math.cos(preSpiralAngle) * pullStrength * 0.5;
            p.vy += perpY * Math.sin(preSpiralAngle) * pullStrength * 0.5;
          }
          // Natural, organic jitter
          p.vx += (Math.random() - 0.5) * this.opts.jitter;
          p.vy += (Math.random() - 0.5) * this.opts.jitter;
          // Smooth velocity decay
          p.vx *= 0.985;
          p.vy *= 0.985;
          p.x += p.vx;
          p.y += p.vy;
        } else {
          // Formation phase: natural, flowing convergence to target
          const dx = p.tx - p.x;
          const dy = p.ty - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist > 0.05) {
            // Natural attraction with smooth distance-based strength curve
            const normalizedDist = Math.min(1, dist / Math.max(p.initialDist, 100));
            // Smooth, natural strength curve - stronger when far, gentle when close
            // Use exponential falloff for better convergence
            const distanceFactor = 1 + (1 - normalizedDist) * 2.0;
            let attractStrength = this.opts.attract * distanceFactor * particleForm;
            
            // Boost attraction when very close to target for faster convergence
            if (dist < 50) {
              const closeBoost = 1 + (50 - dist) / 50 * 2;
              attractStrength *= closeBoost;
            }
            
            // Direction to target
            const dirX = dx / dist;
            const dirY = dy / dist;
            
            // SPIRAL MOTION: Beautiful spiral effect towards target letter
            // Calculate spiral parameters - stronger when far, gentle when close
            const spiralSpeed = 0.04; // Faster rotation for more visible spiral
            const maxSpiralRadius = Math.min(dist * 0.6, 60); // Larger spiral radius for visible effect
            const spiralDecay = Math.min(1, dist / 250); // Reduce spiral gradually as we get closer
            
            // Update spiral phase (increases over time creating continuous rotation)
            p.spiralPhase = (p.spiralPhase || (p.phase * Math.PI * 4)) + spiralSpeed * (0.6 + spiralDecay * 0.4);
            
            // Perpendicular direction for spiral motion (rotated 90 degrees from direct path)
            const perpX = -dirY;
            const perpY = dirX;
            
            // Calculate spiral angle combining phase and unique particle phase for variety
            const spiralAngle = p.spiralPhase + p.phase * Math.PI * 4;
            
            // Combine direct attraction (55%) with spiral motion (45%) for visible spiral effect
            // Direct component - pulls directly towards target letter
            p.vx += dirX * attractStrength * 0.55;
            p.vy += dirY * attractStrength * 0.55;
            
            // Spiral component - creates beautiful rotating motion towards target
            p.vx += perpX * Math.cos(spiralAngle) * attractStrength * 0.45 * spiralDecay;
            p.vy += perpY * Math.sin(spiralAngle) * attractStrength * 0.45 * spiralDecay;
            
            // Additional organic micro-swirl for extra natural motion
            if (dist > 15 && particleForm < 0.95 && spiralDecay > 0.15) {
              const microSwirlStrength = this.opts.swirl * (1 - particleForm * 0.95) * spiralDecay * 0.3;
              const microSwirlAngle = p.phase * Math.PI * 8 + performance.now() * 0.0005;
              p.vx += perpX * Math.cos(microSwirlAngle) * microSwirlStrength;
              p.vy += perpY * Math.sin(microSwirlAngle) * microSwirlStrength;
            }
          }
          
          // Very high damping for smooth, natural settling
          p.vx *= this.opts.damping;
          p.vy *= this.opts.damping;
          
          // Smooth position update
          p.x += p.vx;
          p.y += p.vy;
          
          // Gentle snap to target when very close - smooth, not abrupt
          if (dist < 2.0) {
            const snapStrength = 1 - (dist / 2.0);
            p.x = p.tx * snapStrength + p.x * (1 - snapStrength);
            p.y = p.ty * snapStrength + p.y * (1 - snapStrength);
            // Smoothly reduce velocity
            p.vx *= (1 - snapStrength * 0.9);
            p.vy *= (1 - snapStrength * 0.9);
          }
          
          // Force snap when extremely close to ensure particles reach targets
          if (dist < 0.5) {
            p.x = p.tx;
            p.y = p.ty;
            p.vx = 0;
            p.vy = 0;
          }
        }
        
        // Draw particle with natural, smooth alpha transition
        // Make particles visible even during early formation
        const alpha = particleForm > 0.05 ? 1.0 : Math.max(0.5, particleForm * 12);
        const particleColor = `rgba(255,255,255,${alpha})`;
        this.ctx.fillStyle = particleColor;
        // Natural glow that intensifies as logo forms
        this.ctx.shadowBlur = 4 + form * 3;
        this.ctx.shadowColor = form > 0.25 ? "rgba(0,122,51,0.8)" : "rgba(255,255,255,0.5)";
        this.ctx.beginPath();
        // Make particles slightly larger when formed for better visibility
        const radius = p.r * (1 + form * 0.3);
        this.ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.shadowBlur = 0;
      }
      
      // Smooth solidification - progressive and anti-grainy
      if (form > 0.50) {
        const fillProgress = (form - 0.50) / 0.50; // 0 to 1 as form goes from 0.50 to 1.0
        const easedProgress = easeOutCubic(fillProgress); // Smooth easing for natural flow
        
        // Layer 1: Large soft base fill - smooth, flowing appearance
        const fillAlpha1 = 0.30 + easedProgress * 0.50; // 0.30 to 0.80
        this.ctx.fillStyle = `rgba(255,255,255,${fillAlpha1})`;
        this.ctx.globalCompositeOperation = "source-over";
        for (const p of particlesWithTargets) {
          const fillRadius = p.r * (1.4 + easedProgress * 0.6); // 1.4x to 2.0x - larger for smoothness
          this.ctx.beginPath();
          this.ctx.arc(p.x, p.y, fillRadius, 0, Math.PI * 2);
          this.ctx.fill();
        }
        
        // Layer 2: Medium density fill - builds naturally
        if (easedProgress > 0.2) {
          const fillAlpha2 = (easedProgress - 0.2) / 0.8 * 0.40; // 0 to 0.40
          this.ctx.fillStyle = `rgba(255,255,255,${fillAlpha2})`;
          for (const p of particlesWithTargets) {
            const fillRadius = p.r * (1.2 + easedProgress * 0.5); // 1.2x to 1.7x
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, fillRadius, 0, Math.PI * 2);
            this.ctx.fill();
          }
        }
        
        // Layer 3: Crisp detail layer - sharpens naturally
        if (easedProgress > 0.5) {
          const fillAlpha3 = (easedProgress - 0.5) / 0.5 * 0.30; // 0 to 0.30
          this.ctx.fillStyle = `rgba(255,255,255,${fillAlpha3})`;
          for (const p of particlesWithTargets) {
            const fillRadius = p.r * 1.3; // Larger crisp fill for smoothness
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, fillRadius, 0, Math.PI * 2);
            this.ctx.fill();
          }
        }
      }
      
      // Final solidification phase - smooth, solid logo (anti-grainy)
      if (form > 0.80) {
        const crispProgress = (form - 0.80) / 0.20; // 0 to 1 as form goes from 0.80 to 1.0
        const easedCrisp = easeOutCubic(crispProgress); // Smooth final transition
        
        // Base layer: Large, solid fill for smoothness
        this.ctx.fillStyle = `rgba(255,255,255,${0.80 + easedCrisp * 0.20})`; // 0.80 to 1.0
        this.ctx.globalCompositeOperation = "source-over";
        for (const p of particlesWithTargets) {
          this.ctx.beginPath();
          this.ctx.arc(p.x, p.y, p.r * 2.0, 0, Math.PI * 2); // Larger for smoothness
          this.ctx.fill();
        }
        
        // Density layer: Medium fill for solid appearance
        this.ctx.fillStyle = `rgba(255,255,255,${0.70 + easedCrisp * 0.25})`; // 0.70 to 0.95
        for (const p of particlesWithTargets) {
          this.ctx.beginPath();
          this.ctx.arc(p.x, p.y, p.r * 1.6, 0, Math.PI * 2);
          this.ctx.fill();
        }
        
        // Crisp layer: Smooth fill for sharp edges
        this.ctx.fillStyle = `rgba(255,255,255,${0.90 + easedCrisp * 0.10})`; // 0.90 to 1.0
        for (const p of particlesWithTargets) {
          this.ctx.beginPath();
          this.ctx.arc(p.x, p.y, p.r * 1.4, 0, Math.PI * 2);
          this.ctx.fill();
        }
        
        // Edge definition: Subtle outline for crisp clarity
        if (easedCrisp > 0.3) {
          this.ctx.strokeStyle = `rgba(0,122,51,${0.3 + easedCrisp * 0.5})`; // Celtics green
          this.ctx.lineWidth = 0.8;
          for (const p of particlesWithTargets) {
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.r * 1.4, 0, Math.PI * 2);
            this.ctx.stroke();
          }
        }
      }
      
      // Ultra-smooth final state - perfectly clear, solid, smooth logo
      if (form >= 0.95) {
        // Multiple layered passes for maximum smoothness (anti-grainy)
        this.ctx.fillStyle = "rgba(255,255,255,1.0)"; // Fully opaque white
        this.ctx.globalCompositeOperation = "source-over";
        
        for (const p of particlesWithTargets) {
          // Pass 1: Large base (2.2x) - ensures full smooth coverage
          this.ctx.beginPath();
          this.ctx.arc(p.x, p.y, p.r * 2.2, 0, Math.PI * 2);
          this.ctx.fill();
          
          // Pass 2: Medium density (1.8x) - builds solidity smoothly
          this.ctx.beginPath();
          this.ctx.arc(p.x, p.y, p.r * 1.8, 0, Math.PI * 2);
          this.ctx.fill();
          
          // Pass 3: Smooth crisp (1.5x) - smooth, clear edges
          this.ctx.beginPath();
          this.ctx.arc(p.x, p.y, p.r * 1.5, 0, Math.PI * 2);
          this.ctx.fill();
        }
        
        // Final smooth edge definition
        this.ctx.strokeStyle = "rgba(0,122,51,0.7)"; // Strong Celtics green outline
        this.ctx.lineWidth = 1.0;
        for (const p of particlesWithTargets) {
          this.ctx.beginPath();
          this.ctx.arc(p.x, p.y, p.r * 1.5, 0, Math.PI * 2);
          this.ctx.stroke();
        }
      }
    },
    
    showActiveRooms(progress) {
      if (!this.activeRoomsPanel) return;
      
      const eased = this.easeOutCubic(progress);
      this.activeRoomsPanel.style.opacity = eased;
      
      if (progress >= 1) {
        this.activeRoomsPanel.classList.add('visible');
        // Setup dropdown toggle
        const header = document.getElementById('activeRoomsHeader');
        if (header && !header.dataset.listenerAdded) {
          header.dataset.listenerAdded = 'true';
          header.addEventListener('click', () => {
            this.activeRoomsPanel.classList.toggle('collapsed');
          });
        }
      }
    },
    
    showCTA(progress) {
      if (!this.introCTA) return;
      
      const eased = this.easeOutCubic(progress);
      this.introCTA.style.opacity = eased;
      this.introCTA.style.transform = `translateX(-50%) scale(${0.8 + 0.2 * eased})`;
      
      if (progress >= 1) {
        this.introCTA.classList.add('visible');
        if (this.letsHuddleBtn) {
          this.letsHuddleBtn.classList.add('pulse');
        }
      }
    },
    
    idleState(elapsed) {
      // Gentle pulsing of backdrop particles
      for (const p of this.backdropParticles) {
        p.x += p.vx * 0.5;
        p.y += p.vy * 0.5;
      }
    },
    
    easeOutCubic(t) {
      return 1 - Math.pow(1 - t, 3);
    },
    
    stop() {
      this.running = false;
      if (this.rafId) {
        cancelAnimationFrame(this.rafId);
        this.rafId = 0;
      }
    }
  };
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      IntroAnimation.init();
    });
  } else {
    IntroAnimation.init();
  }
  
  // Export for external access
  window.IntroAnimation = IntroAnimation;
})();
