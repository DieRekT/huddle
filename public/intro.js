/**
 * Huddle Intro System - Dual Mode (SVG/CSS Lite + Canvas Enhanced)
 * Stable, always-on brand intro with robust routing and lifecycle management
 */

// ============================================================
// A) GATING & ROUTING (Single source of truth)
// ============================================================

/**
 * Resolve whether intro should run and return final next URL
 * Prevents loops: if already on /intro, do not re-route
 * ALWAYS shows intro unless skipIntro=1 is explicitly set
 */
function shouldShowIntro() {
  // If already on /intro, always serve it (no loop)
  if (window.location.pathname === '/intro') {
    return { shouldShow: true, skipReason: null };
  }
  
  // Check query param override (only way to skip)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('skipIntro') === '1') {
    return { shouldShow: false, skipReason: 'skipIntro=1' };
  }
  
  // ALWAYS show intro (removed localStorage checks)
  return { shouldShow: true, skipReason: null };
}

/**
 * Get safe next URL from query params
 * Ensures it's a relative path starting with "/"
 */
function getNextUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  let next = urlParams.get('next') || '';
  
  // Decode once (handle double-encoding)
  try {
    next = decodeURIComponent(next);
  } catch (e) {
    next = '';
  }
  
  // Validate: must be relative path starting with "/"
  if (!next || !next.startsWith('/')) {
    return '/rooms'; // Safe default
  }
  
  // Ensure it's not another /intro route (prevent loop)
  if (next.startsWith('/intro')) {
    return '/rooms'; // Fallback to rooms
  }
  
  return next;
}

/**
 * Get mode from query params
 */
function getMode() {
  const urlParams = new URLSearchParams(window.location.search);
  const mode = urlParams.get('mode') || 'boot';
  
  // Validate mode
  if (['boot', 'create', 'join'].includes(mode)) {
    return mode;
  }
  
  return 'boot'; // Default
}

/**
 * Get duration based on mode
 * All modes use 15s for consistent experience
 */
function getDuration(mode) {
  return 15000; // Always 15s
}

// ============================================================
// B) INTRO SYSTEM (Single instance, lifecycle managed)
// ============================================================

const IntroSystem = {
  // State
  mode: 'boot',
  duration: 15000,
  nextUrl: '/rooms',
  didRedirect: false, // Guard against multiple redirects
  running: false,     // Guard against multiple animation loops
  rafId: 0,           // RAF ID for cancellation
  startTime: 0,       // Animation start timestamp
  debug: false,       // Debug logging flag
  
  // Mode detection
  useEnhanced: false, // Canvas boids mode
  useLite: true,      // SVG/CSS mode (default)
  
  // Lite mode (SVG/CSS) elements
  liteContainer: null,
  markStyled: null,
  stars: null,
  ripples: null,
  arcs: null,
  core: null,
  
  // Enhanced mode (Canvas) elements
  canvas: null,
  ctx: null,
  particles: [],
  targets: [],
  grid: null, // Spatial hashing grid
  gridCellSize: 64,
  
  /**
   * Initialize intro system
   */
  init() {
    // Debug mode
    this.debug = localStorage.getItem('huddle_debug_intro') === '1';
    
    // Check gating
    const gate = shouldShowIntro();
    if (!gate.shouldShow && this.debug) {
      console.log('[Intro] Gated:', gate.skipReason);
    }
    
    // Get mode and next URL
    this.mode = getMode();
    this.nextUrl = getNextUrl();
    this.duration = getDuration(this.mode);
    
    if (this.debug) {
      console.log('[Intro] Init:', { mode: this.mode, duration: this.duration, next: this.nextUrl });
    }
    
    // Detect mode preference
    this.detectMode();
    
    // Initialize UI
    this.initUI();
    
    // Start animation
    this.start();
    
    // Setup lifecycle hooks
    this.setupLifecycle();
  },
  
  /**
   * Detect which animation mode to use
   */
  detectMode() {
    const introMode = localStorage.getItem('huddle_intro_mode') || 'auto';
    
    if (introMode === 'lite') {
      this.useLite = true;
      this.useEnhanced = false;
      return;
    }
    
    if (introMode === 'enhanced') {
      this.useEnhanced = true;
      this.useLite = false;
      return;
    }
    
    // Auto mode: detect capability
    if (introMode === 'auto') {
      // Check device capability
      const hasConcurrency = navigator.hardwareConcurrency >= 4;
      const hasMemory = !navigator.deviceMemory || navigator.deviceMemory >= 4;
      const isDesktop = !/iPad|iPhone|iPod|Android/i.test(navigator.userAgent);
      
      // Use enhanced if capable, otherwise lite
      this.useEnhanced = hasConcurrency && hasMemory && isDesktop;
      this.useLite = !this.useEnhanced;
    }
  },
  
  /**
   * Initialize UI elements and controls
   */
  initUI() {
    // Get elements
    const skipBtn = document.getElementById('introSkipBtn');
    const dontShowCheck = document.getElementById('dontShowAgain');
    const modeSelector = document.getElementById('introModeSelector');
    
    // Skip button
    if (skipBtn) {
      skipBtn.addEventListener('click', () => {
        this.skip();
      });
    }
    
    // Remove "Don't show again" checkbox (always show intro)
    if (dontShowCheck) {
      dontShowCheck.parentElement.style.display = 'none';
    }
    
    // Mode selector
    if (modeSelector) {
      const currentMode = localStorage.getItem('huddle_intro_mode') || 'auto';
      modeSelector.value = currentMode;
      
      modeSelector.addEventListener('change', (e) => {
        const newMode = e.target.value;
        localStorage.setItem('huddle_intro_mode', newMode);
        
        // Reload page to apply new mode
        window.location.reload();
      });
    }
    
    // Initialize animation containers
    if (this.useLite) {
      this.initLite();
    } else if (this.useEnhanced) {
      this.initEnhanced();
    }
  },
  
  /**
   * Initialize Lite mode (SVG/CSS)
   */
  initLite() {
    this.liteContainer = document.getElementById('introLiteContainer');
    if (!this.liteContainer) {
      // Create container if missing
      this.liteContainer = document.createElement('div');
      this.liteContainer.id = 'introLiteContainer';
      this.liteContainer.className = 'intro-lite-container';
      document.querySelector('.intro-screen').appendChild(this.liteContainer);
    }
    
    // Load SVG mark with styled variant
    this.loadMarkSVG();
    
    // Create animation elements
    this.createLiteElements();
  },
  
  /**
   * Load mark SVG and show styled variant
   */
  loadMarkSVG() {
    const logoContainer = document.getElementById('logoContainer');
    if (!logoContainer) return;
    
    // Load SVG and show mark-styled variant
    fetch('/assets/huddle-mark.svg')
      .then(r => r.text())
      .then(svgText => {
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
        const styled = svgDoc.querySelector('#mark-styled');
        
        if (styled && logoContainer) {
          logoContainer.innerHTML = '';
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svg.setAttribute('viewBox', '0 0 64 64');
          svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
          svg.appendChild(styled.cloneNode(true));
          logoContainer.appendChild(svg);
          
          // Show styled variant
          setTimeout(() => {
            const styledEl = svg.querySelector('#mark-styled');
            if (styledEl) styledEl.setAttribute('opacity', '1');
          }, 100);
        }
      })
      .catch(err => {
        console.error('[Intro] Failed to load SVG:', err);
      });
  },
  
  /**
   * Create Lite mode animation elements
   */
  createLiteElements() {
    // Elements are created in HTML/CSS
    // Animation is driven by CSS keyframes
    // Timeline controlled by JavaScript phase transitions
  },
  
  /**
   * Initialize Enhanced mode (Canvas boids)
   */
  initEnhanced() {
    this.canvas = document.getElementById('particleCanvas');
    if (!this.canvas) {
      console.error('[Intro] Canvas not found');
      this.useEnhanced = false;
      this.useLite = true;
      this.initLite();
      return;
    }
    
    this.ctx = this.canvas.getContext('2d');
    if (!this.ctx) {
      console.error('[Intro] Canvas context not available');
      this.useEnhanced = false;
      this.useLite = true;
      this.initLite();
      return;
    }
    
    // Setup canvas
    this.setupCanvas();
    
    // Sample logo points for particle targets
    this.sampleLogoPoints();
    
    // Initialize particles
    this.initParticles();
  },
  
  /**
   * Setup canvas with devicePixelRatio scaling
   */
  setupCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
    
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
  },
  
  /**
   * Sample logo points from SVG for particle targets
   */
  async sampleLogoPoints() {
    try {
      const response = await fetch('/assets/huddle-mark.svg');
      const svgText = await response.text();
      const parser = new DOMParser();
      const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
      const solid = svgDoc.querySelector('#mark-solid');
      
      if (!solid) {
        console.warn('[Intro] mark-solid not found in SVG');
        return;
      }
      
      // Rasterize SVG to canvas
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      const size = 256;
      tempCanvas.width = size;
      tempCanvas.height = size;
      
      // Draw SVG to canvas
      const img = new Image();
      const blob = new Blob([svgText], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      
      await new Promise((resolve, reject) => {
        img.onload = () => {
          tempCtx.fillStyle = '#007A33';
          tempCtx.fillRect(0, 0, size, size);
          tempCtx.drawImage(img, 0, 0, size, size);
          URL.revokeObjectURL(url);
          resolve();
        };
        img.onerror = reject;
        img.src = url;
      });
      
      // Sample points where alpha > threshold
      const ALPHA_THRESHOLD = 40;
      const points = [];
      const data = tempCtx.getImageData(0, 0, size, size).data;
      
      for (let y = 0; y < size; y += 2) {
        for (let x = 0; x < size; x += 2) {
          const idx = (y * size + x) * 4;
          const alpha = data[idx + 3];
          if (alpha > ALPHA_THRESHOLD) {
            points.push({
              x: (x / size) * this.canvas.width,
              y: (y / size) * this.canvas.height
            });
          }
        }
      }
      
      // Downsample to particle count
      const particleCount = this.getParticleCount();
      if (points.length > particleCount) {
        // Shuffle and slice
        for (let i = points.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [points[i], points[j]] = [points[j], points[i]];
        }
        this.targets = points.slice(0, particleCount);
      } else {
        this.targets = points;
      }
      
      // Center targets on canvas
      const centerX = this.canvas.width / 2;
      const centerY = this.canvas.height / 2;
      const logoSize = Math.min(this.canvas.width, this.canvas.height) * 0.4;
      
      this.targets = this.targets.map(p => ({
        x: centerX + (p.x - size / 2) * (logoSize / size),
        y: centerY + (p.y - size / 2) * (logoSize / size)
      }));
      
    } catch (err) {
      console.error('[Intro] Failed to sample logo points:', err);
      this.useEnhanced = false;
      this.useLite = true;
      this.initLite();
    }
  },
  
  /**
   * Get particle count based on device
   */
  getParticleCount() {
    const isMobile = /iPad|iPhone|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      return 750; // Mobile: N = 750
    }
    return 1200; // Desktop: N = 1200
  },
  
  /**
   * Initialize particles for Enhanced mode
   */
  initParticles() {
    const count = this.getParticleCount();
    const width = this.canvas.width / (window.devicePixelRatio || 1);
    const height = this.canvas.height / (window.devicePixelRatio || 1);
    
    this.particles = [];
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        target: this.targets[i % this.targets.length] || { x: width / 2, y: height / 2 },
        color: this.getParticleColor()
      });
    }
  },
  
  /**
   * Get particle color (80% deep green, 15% lighter green, 5% gold)
   */
  getParticleColor() {
    const r = Math.random();
    if (r < 0.8) return '#007A33'; // Deep green
    if (r < 0.95) return '#00a852'; // Lighter green
    return '#BA9653'; // Gold
  },
  
  /**
   * Start animation
   */
  start() {
    // Guard: only one loop
    if (this.running) {
      if (this.debug) console.warn('[Intro] Animation already running');
      return;
    }
    
    this.running = true;
    this.startTime = performance.now();
    this.didRedirect = false;
    
    if (this.debug) {
      console.log('[Intro] Starting animation:', { mode: this.mode, duration: this.duration });
    }
    
    if (this.useLite) {
      this.startLite();
    } else if (this.useEnhanced) {
      this.startEnhanced();
    }
    
    // Auto-redirect at end
    setTimeout(() => {
      this.end();
    }, this.duration);
  },
  
  /**
   * Start Lite mode animation
   */
  startLite() {
    // Lite mode uses CSS keyframes
    // Timeline is controlled by phase transitions
    // See intro.css for animations
  },
  
  /**
   * Start Enhanced mode animation
   */
  startEnhanced() {
    // Cancel any existing RAF
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
    }
    
    // Start RAF loop
    const animate = (now) => {
      if (!this.running) return;
      
      // Clamp dt (prevent physics blowups)
      const elapsed = now - this.startTime;
      const dt = Math.min((now - (this.lastFrameTime || now)) / 1000, 0.033);
      this.lastFrameTime = now;
      
      // Update particles
      this.updateParticles(elapsed, dt);
      
      // Draw
      this.drawParticles();
      
      // Continue loop
      if (this.running && elapsed < this.duration) {
        this.rafId = requestAnimationFrame(animate);
      }
    };
    
    this.lastFrameTime = performance.now();
    this.rafId = requestAnimationFrame(animate);
  },
  
  /**
   * Update particles (Enhanced mode)
   */
  updateParticles(elapsed, dt) {
    // Determine phase
    const phase = this.getPhase(elapsed);
    
    // Boids parameters
    const params = this.getBoidsParams(phase, elapsed);
    
    // Build spatial hash grid
    this.buildSpatialGrid();
    
    // Update each particle
    for (const p of this.particles) {
      this.updateParticle(p, params, dt, phase);
    }
  },
  
  /**
   * Build spatial hash grid for neighbor lookup
   */
  buildSpatialGrid() {
    const width = this.canvas.width / (window.devicePixelRatio || 1);
    const height = this.canvas.height / (window.devicePixelRatio || 1);
    const cols = Math.ceil(width / this.gridCellSize);
    const rows = Math.ceil(height / this.gridCellSize);
    
    this.grid = new Map();
    
    for (const p of this.particles) {
      const col = Math.floor(p.x / this.gridCellSize);
      const row = Math.floor(p.y / this.gridCellSize);
      const key = `${col},${row}`;
      
      if (!this.grid.has(key)) {
        this.grid.set(key, []);
      }
      this.grid.get(key).push(p);
    }
  },
  
  /**
   * Get neighbors for a particle using spatial hash
   */
  getNeighbors(p, radius) {
    const width = this.canvas.width / (window.devicePixelRatio || 1);
    const height = this.canvas.height / (window.devicePixelRatio || 1);
    const col = Math.floor(p.x / this.gridCellSize);
    const row = Math.floor(p.y / this.gridCellSize);
    const neighbors = [];
    
    // Check 3x3 grid around particle
    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        const key = `${col + dc},${row + dr}`;
        const cell = this.grid.get(key);
        if (cell) {
          for (const other of cell) {
            if (other === p) continue;
            const dx = other.x - p.x;
            const dy = other.y - p.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < radius) {
              neighbors.push({ particle: other, dist, dx, dy });
            }
          }
        }
      }
    }
    
    return neighbors;
  },
  
  /**
   * Get current phase based on elapsed time
   */
  getPhase(elapsed) {
    const t = elapsed / 1000; // Convert to seconds
    
    if (t < 4) return 'free'; // 0-4s: free flock
    if (t < 10) return 'morph'; // 4-10s: morph attraction ramp
    if (t < 13.5) return 'settle'; // 10-13.5s: settle phase
    return 'pulse'; // 13.5-15s: breathe pulse
  },
  
  /**
   * Get boids parameters for current phase (exact values from spec)
   */
  getBoidsParams(phase, elapsed) {
    const t = elapsed / 1000;
    const m = this.getMorph(t);
    
    const params = {
      neighborRadius: 52,
      separationRadius: 18,
      maxSpeed: 2.15,
      maxForce: 0.055,
      drag: 0.985,
      wSeparation: 1.55,
      wAlignment: 1.10,
      wCohesion: 0.85,
      wWander: 0.18,
      wWind: 0.06,
      wTarget: 0.00,
      arrivalRadius: 6,
      snapRadius: 2.5
    };
    
    if (phase === 'morph') {
      // Morph attraction ramp (4s-10s)
      params.wTarget = this.lerp(0.00, 2.40, m);
      params.wAlignment = this.lerp(1.10, 0.65, m);
      params.wCohesion = this.lerp(0.85, 0.55, m);
      // Keep separation strong: wSeparation ~ 1.55
    } else if (phase === 'settle') {
      // Settle phase (10s-13.5s)
      params.wTarget = 3.10;
      params.maxSpeed = 1.10;
      params.maxForce = 0.045;
      params.drag = 0.95;
      params.arrivalRadius = 6;
      params.snapRadius = 2.5;
    } else if (phase === 'pulse') {
      // Pulse phase (13.5s-15s) - use settle params with pulse scale
      params.wTarget = 3.10;
      params.maxSpeed = 1.10;
      params.maxForce = 0.045;
      params.drag = 0.95;
      params.arrivalRadius = 6;
      params.snapRadius = 2.5;
    }
    // Phase 1 (free): use defaults above
    
    return params;
  },
  
  /**
   * Get morph parameter (0 to 1)
   * Morph ramp: 4s-10s
   */
  getMorph(t) {
    const morphStart = 4;
    const morphEnd = 10;
    const m = Math.max(0, Math.min(1, (t - morphStart) / (morphEnd - morphStart)));
    return m; // Linear interpolation
  },
  
  /**
   * Update single particle
   */
  updateParticle(p, params, dt, phase) {
    // Boids forces
    const sep = this.separate(p, params);
    const align = this.align(p, params);
    const coh = this.cohesion(p, params);
    const wind = this.wind(p, params);
    const wander = this.wander(p, params);
    const target = this.arrive(p, params);
    
    // Sum forces
    let fx = sep.x * params.wSeparation + 
             align.x * params.wAlignment + 
             coh.x * params.wCohesion + 
             wind.x * params.wWind + 
             wander.x * params.wWander + 
             target.x * params.wTarget;
    let fy = sep.y * params.wSeparation + 
             align.y * params.wAlignment + 
             coh.y * params.wCohesion + 
             wind.y * params.wWind + 
             wander.y * params.wWander + 
             target.y * params.wTarget;
    
    // Clamp to max force
    const mag = Math.sqrt(fx * fx + fy * fy);
    if (mag > params.maxForce) {
      fx = (fx / mag) * params.maxForce;
      fy = (fy / mag) * params.maxForce;
    }
    
    // Update velocity
    p.vx += fx * dt;
    p.vy += fy * dt;
    
    // Apply drag
    p.vx *= params.drag;
    p.vy *= params.drag;
    
    // Clamp velocity
    const vmag = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    if (vmag > params.maxSpeed) {
      p.vx = (p.vx / vmag) * params.maxSpeed;
      p.vy = (p.vy / vmag) * params.maxSpeed;
    }
    
    // Update position
    p.x += p.vx * dt * 60; // Scale for 60fps
    p.y += p.vy * dt * 60;
    
    // Apply pulse scale during pulse phase
    if (phase === 'pulse') {
      const t = (performance.now() - this.startTime) / 1000;
      const pulseScale = 1 + 0.018 * Math.sin(t * 2 * Math.PI / 1.6);
      const centerX = this.canvas.width / (window.devicePixelRatio || 1) / 2;
      const centerY = this.canvas.height / (window.devicePixelRatio || 1) / 2;
      p.x = centerX + (p.x - centerX) * pulseScale;
      p.y = centerY + (p.y - centerY) * pulseScale;
    }
  },
  
  /**
   * Boids behaviors with spatial hashing
   */
  separate(p, params) {
    const neighbors = this.getNeighbors(p, params.separationRadius);
    let steerX = 0;
    let steerY = 0;
    let count = 0;
    
    for (const { dx, dy, dist } of neighbors) {
      if (dist > 0) {
        const invDist = 1 / dist;
        steerX += (dx / dist) * invDist;
        steerY += (dy / dist) * invDist;
        count++;
      }
    }
    
    if (count > 0) {
      steerX /= count;
      steerY /= count;
      const mag = Math.sqrt(steerX * steerX + steerY * steerY);
      if (mag > 0) {
        steerX = (steerX / mag) * params.maxSpeed;
        steerY = (steerY / mag) * params.maxSpeed;
        steerX -= p.vx;
        steerY -= p.vy;
        const steerMag = Math.sqrt(steerX * steerX + steerY * steerY);
        if (steerMag > params.maxForce) {
          steerX = (steerX / steerMag) * params.maxForce;
          steerY = (steerY / steerMag) * params.maxForce;
        }
      }
    }
    
    return { x: steerX, y: steerY };
  },
  
  align(p, params) {
    const neighbors = this.getNeighbors(p, params.neighborRadius);
    let avgVx = 0;
    let avgVy = 0;
    let count = 0;
    
    for (const { particle } of neighbors) {
      avgVx += particle.vx;
      avgVy += particle.vy;
      count++;
    }
    
    if (count > 0) {
      avgVx /= count;
      avgVy /= count;
      const mag = Math.sqrt(avgVx * avgVx + avgVy * avgVy);
      if (mag > 0) {
        avgVx = (avgVx / mag) * params.maxSpeed;
        avgVy = (avgVy / mag) * params.maxSpeed;
        const steerX = avgVx - p.vx;
        const steerY = avgVy - p.vy;
        const steerMag = Math.sqrt(steerX * steerX + steerY * steerY);
        if (steerMag > params.maxForce) {
          return {
            x: (steerX / steerMag) * params.maxForce,
            y: (steerY / steerMag) * params.maxForce
          };
        }
        return { x: steerX, y: steerY };
      }
    }
    
    return { x: 0, y: 0 };
  },
  
  cohesion(p, params) {
    const neighbors = this.getNeighbors(p, params.neighborRadius);
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    
    for (const { particle } of neighbors) {
      sumX += particle.x;
      sumY += particle.y;
      count++;
    }
    
    if (count > 0) {
      sumX /= count;
      sumY /= count;
      return this.seek(p, { x: sumX, y: sumY }, params);
    }
    
    return { x: 0, y: 0 };
  },
  
  /**
   * Seek behavior (helper for cohesion)
   */
  seek(p, target, params) {
    const dx = target.x - p.x;
    const dy = target.y - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist > 0) {
      const desiredX = (dx / dist) * params.maxSpeed;
      const desiredY = (dy / dist) * params.maxSpeed;
      const steerX = desiredX - p.vx;
      const steerY = desiredY - p.vy;
      const steerMag = Math.sqrt(steerX * steerX + steerY * steerY);
      if (steerMag > params.maxForce) {
        return {
          x: (steerX / steerMag) * params.maxForce,
          y: (steerY / steerMag) * params.maxForce
        };
      }
      return { x: steerX, y: steerY };
    }
    
    return { x: 0, y: 0 };
  },
  
  wind(p, params) {
    // Slow-changing wind vector
    const t = (performance.now() - this.startTime) * 0.001;
    return {
      x: Math.cos(t * 0.00025) * params.wWind,
      y: Math.sin(t * 0.00021) * params.wWind
    };
  },
  
  wander(p, params) {
    // Subtle random steering
    return {
      x: (Math.random() - 0.5) * params.wWander,
      y: (Math.random() - 0.5) * params.wWander
    };
  },
  
  arrive(p, params) {
    // Arrive at target with slowdown
    const dx = p.target.x - p.x;
    const dy = p.target.y - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist < params.snapRadius) {
      // Snap to target
      p.x = p.target.x;
      p.y = p.target.y;
      p.vx = 0;
      p.vy = 0;
      return { x: 0, y: 0 };
    }
    
    let desiredSpeed = params.maxSpeed;
    if (dist < params.arrivalRadius) {
      // Slow down as approaching
      desiredSpeed = (dist / params.arrivalRadius) * params.maxSpeed;
    }
    
    const desiredX = dist > 0 ? (dx / dist) * desiredSpeed : 0;
    const desiredY = dist > 0 ? (dy / dist) * desiredSpeed : 0;
    
    const steerX = desiredX - p.vx;
    const steerY = desiredY - p.vy;
    const steerMag = Math.sqrt(steerX * steerX + steerY * steerY);
    
    if (steerMag > params.maxForce) {
      return {
        x: (steerX / steerMag) * params.maxForce,
        y: (steerY / steerMag) * params.maxForce
      };
    }
    
    return { x: steerX, y: steerY };
  },
  
  /**
   * Draw particles (Enhanced mode)
   */
  drawParticles() {
    const width = this.canvas.width / (window.devicePixelRatio || 1);
    const height = this.canvas.height / (window.devicePixelRatio || 1);
    
    // Clear
    this.ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg') || '#F3FBF6';
    this.ctx.fillRect(0, 0, width, height);
    
    // Draw particles
    for (const p of this.particles) {
      this.ctx.fillStyle = p.color;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
      this.ctx.fill();
    }
  },
  
  /**
   * Utility functions
   */
  lerp(a, b, t) {
    return a + (b - a) * t;
  },
  
  easeInOut(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  },
  
  /**
   * Stop animation
   */
  stop() {
    if (!this.running) return;
    
    this.running = false;
    
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    
    if (this.debug) {
      console.log('[Intro] Animation stopped');
    }
  },
  
  /**
   * Skip intro (immediate redirect)
   */
  skip() {
    this.stop();
    this.end();
  },
  
  /**
   * End intro and redirect
   */
  end() {
    // Guard: only redirect once
    if (this.didRedirect) {
      if (this.debug) console.warn('[Intro] Already redirected');
      return;
    }
    
    this.didRedirect = true;
    this.stop();
    
    if (this.debug) {
      console.log('[Intro] Redirecting to:', this.nextUrl);
    }
    
    // Redirect
    window.location.assign(this.nextUrl);
  },
  
  /**
   * Setup lifecycle hooks
   */
  setupLifecycle() {
    // Visibility change: pause/resume
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.stop();
      } else if (this.didRedirect === false && this.startTime > 0) {
        // Resume if not redirected
        const elapsed = performance.now() - this.startTime;
        if (elapsed < this.duration) {
          this.start();
        }
      }
    });
    
    // Before unload: cleanup
    window.addEventListener('beforeunload', () => {
      this.stop();
    });
    
    window.addEventListener('pagehide', () => {
      this.stop();
    });
    
    // Resize: debounced
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (this.useEnhanced && this.canvas) {
          this.setupCanvas();
          // Reassign targets if needed (don't restart loop)
          if (this.targets.length > 0) {
            this.sampleLogoPoints().then(() => {
              // Reassign targets to particles
              for (let i = 0; i < this.particles.length; i++) {
                this.particles[i].target = this.targets[i % this.targets.length] || { x: this.canvas.width / 2, y: this.canvas.height / 2 };
              }
            });
          }
        }
      }, 150);
    });
  }
};

// ============================================================
// C) INITIALIZE ON PAGE LOAD
// ============================================================

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    IntroSystem.init();
  });
} else {
  IntroSystem.init();
}
