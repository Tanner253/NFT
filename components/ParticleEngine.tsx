'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import styles from './ParticleEngine.module.css'

export default function ParticleEngine() {
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingProgress, setRecordingProgress] = useState(0)
  const [showControls, setShowControls] = useState(false)
  const [config, setConfig] = useState({
    particleCount: 25000,
    particleSize: 0.05,
    seedText: 'oSKNYo_dev',
    noiseStrength: 0.2,
    rotationSpeed: 1,
    morphSpeed: 0.05,
    radius: 4
  })

  useEffect(() => {
    if (!containerRef.current) return
    
    const container = containerRef.current

    // --- RANDOM SEED UTILITIES ---
    function cyrb128(str: string) {
      let h1 = 1779033703, h2 = 3144134277,
          h3 = 1013904242, h4 = 2773480762
      for (let i = 0, k; i < str.length; i++) {
        k = str.charCodeAt(i)
        h1 = h2 ^ Math.imul(h1 ^ k, 597399067)
        h2 = h3 ^ Math.imul(h2 ^ k, 2869860233)
        h3 = h4 ^ Math.imul(h3 ^ k, 951274213)
        h4 = h1 ^ Math.imul(h4 ^ k, 2716044179)
      }
      h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067)
      h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233)
      h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213)
      h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179)
      return [h1>>>0, h2>>>0, h3>>>0, h4>>>0]
    }

    function sfc32(a: number, b: number, c: number, d: number) {
      return function() {
        a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0
        let t = (a + b) | 0
        a = b ^ b >>> 9
        b = c + (c << 3) | 0
        c = (c << 21 | c >>> 11)
        d = d + 1 | 0
        t = t + d | 0
        c = c + t | 0
        return (t >>> 0) / 4294967296
      }
    }

    // --- SCENE SETUP ---
    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(0x050505, 0.035)

    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    )
    camera.position.z = 12
    camera.position.y = 5

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setPixelRatio(window.devicePixelRatio)
    container.appendChild(renderer.domElement)
    
    rendererRef.current = renderer
    sceneRef.current = scene
    cameraRef.current = camera

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.autoRotate = true
    controls.autoRotateSpeed = config.rotationSpeed

    // --- PARTICLE SYSTEM ---
    let particles: THREE.Points
    let geometry: THREE.BufferGeometry
    let material: THREE.PointsMaterial
    let targetPositions: Float32Array
    let targetColors: Float32Array

    // --- HELPER: Superformula ---
    function superShape(theta: number, m: number, n1: number, n2: number, n3: number) {
      const a = 1
      const b = 1
      const t1 = Math.abs((1/a) * Math.cos(m * theta / 4))
      const t2 = Math.abs((1/b) * Math.sin(m * theta / 4))
      return Math.pow(Math.pow(t1, n2) + Math.pow(t2, n3), -1 / n1)
    }

    // --- PROCEDURAL GENERATION ENGINE ---
    function calculateTargetsFromSeed(seedString: string) {
      if(!seedString) seedString = "default"
      
      const seed = cyrb128(seedString)
      const rand = sfc32(seed[0], seed[1], seed[2], seed[3])

      // --- 1. SHAPE DNA ---
      const archetype = rand() // 0-1 determines base class
      
      // DNA params
      const modA = Math.floor(rand() * 10) + 1
      const modB = Math.floor(rand() * 10) + 1
      const twist = (rand() - 0.5) * 5
      const spikes = rand() > 0.7 ? 1 : 0
      const globalScale = 0.8 + rand() * 0.4
      
      // Superformula params (randomized)
      const sf_m = Math.floor(rand() * 20)
      const sf_n1 = 0.2 + rand() * 5
      const sf_n2 = 0.2 + rand() * 5
      const sf_n3 = 0.2 + rand() * 5

      // --- 2. COLOR DNA ---
      const hueBase = rand()
      const hueVar = rand() * 0.5
      const col1 = new THREE.Color().setHSL(hueBase, 0.8, 0.5)
      const col2 = new THREE.Color().setHSL((hueBase + 0.3 + hueVar)%1, 0.9, 0.6)
      const col3 = new THREE.Color().setHSL((hueBase + 0.6 + hueVar)%1, 0.5, 0.5)
      
      const colorPattern = Math.floor(rand() * 5)
      const colorFreq = 0.5 + rand() * 2

      const count = config.particleCount
      const rBase = config.radius

      for (let i = 0; i < count; i++) {
        let x: number, y: number, z: number
        
        const u = Math.random() * Math.PI * 2
        const v = Math.random() * Math.PI

        if (archetype < 0.25) {
          // TYPE: Super-Sphere / Blob
          const r1 = superShape(u, sf_m, sf_n1, sf_n2, sf_n3)
          const r2 = superShape(v, sf_m, sf_n1, sf_n2, sf_n3)
          
          let r = rBase * r1 * r2
          if(spikes) r += Math.sin(u * 20) * Math.cos(v * 20) * 0.2
          
          x = r * Math.sin(v) * Math.cos(u)
          y = r * Math.sin(v) * Math.sin(u)
          z = r * Math.cos(v)
        } else if (archetype < 0.5) {
          // TYPE: Torus Knot / Complex Torus
          const p = Math.floor(rand() * 5) + 2
          const q = Math.floor(rand() * 5) + 1
          const tubularR = 1 + rand()
          
          const rKnot = rBase * 0.6 + Math.cos(q * u) * 1.5
          x = rKnot * Math.cos(p * u)
          y = rKnot * Math.sin(p * u)
          z = Math.sin(q * u) * 2

          const theta = v * 2
          x += tubularR * Math.cos(theta) * Math.cos(p*u)
          y += tubularR * Math.cos(theta) * Math.sin(p*u)
          z += tubularR * Math.sin(theta)
        } else if (archetype < 0.75) {
          // TYPE: Parametric Ribbon / Mobius
          const t = u * 2
          const width = (v - 1.5)
          const radius = rBase * (0.8 + 0.2 * Math.cos(modA * t))
          
          const twisting = t * modB * 0.5
          
          x = (radius + width * Math.cos(twisting)) * Math.cos(t)
          y = (radius + width * Math.cos(twisting)) * Math.sin(t)
          z = width * Math.sin(twisting) + Math.sin(t*2)
        } else {
          // TYPE: Strange Shell (Math Chaos)
          const a = modA / 2
          const b = modB / 2
          
          x = rBase * Math.sin(u) * Math.cos(v + u*twist*0.1)
          y = rBase * Math.cos(u) * Math.sin(v) * (1 + 0.4*Math.sin(a*u))
          z = rBase * Math.cos(v) + Math.sin(b*u)
        }

        // Global Twist & Scale
        const oldX = x
        const twistAmt = z * twist * 0.1
        x = x * Math.cos(twistAmt) - y * Math.sin(twistAmt)
        y = oldX * Math.sin(twistAmt) + y * Math.cos(twistAmt)

        x *= globalScale
        y *= globalScale
        z *= globalScale

        targetPositions[i * 3] = x
        targetPositions[i * 3 + 1] = y
        targetPositions[i * 3 + 2] = z

        // --- COLOR GENERATION ---
        let mix = 0.5
        const px = x / (rBase * 2)
        const py = y / (rBase * 2)
        const pz = z / (rBase * 2)

        switch(colorPattern) {
          case 0: // Linear Y
            mix = (py + 0.5)
            break
          case 1: // Linear X + Z
            mix = (px + pz + 1) / 2
            break
          case 2: // Radial
            mix = Math.sqrt(px*px + py*py + pz*pz) * 1.5
            break
          case 3: // Spiral / Stripes
            mix = (Math.sin(u * colorFreq) + 1) / 2
            break
          case 4: // Noise-ish
            mix = (Math.sin(x*colorFreq) * Math.cos(y*colorFreq) + 1) / 2
            break
        }

        mix = Math.max(0, Math.min(1, mix))

        const c = new THREE.Color()
        if (mix < 0.5) {
          c.lerpColors(col1, col2, mix * 2)
        } else {
          c.lerpColors(col2, col3, (mix - 0.5) * 2)
        }

        targetColors[i * 3] = c.r
        targetColors[i * 3 + 1] = c.g
        targetColors[i * 3 + 2] = c.b
      }
    }

    function initParticles() {
      if (particles) {
        scene.remove(particles)
        geometry.dispose()
        material.dispose()
      }

      geometry = new THREE.BufferGeometry()
      const positions = new Float32Array(config.particleCount * 3)
      const colors = new Float32Array(config.particleCount * 3)
      
      targetPositions = new Float32Array(config.particleCount * 3)
      targetColors = new Float32Array(config.particleCount * 3)
      
      for (let i = 0; i < config.particleCount * 3; i++) {
        positions[i] = (Math.random() - 0.5) * 20
        colors[i] = 1.0
      }

      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

      const canvas = document.createElement('canvas')
      canvas.width = 64
      canvas.height = 64
      const ctx = canvas.getContext('2d')!
      const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
      gradient.addColorStop(0, 'rgba(255,255,255,1)')
      gradient.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, 64, 64)
      const texture = new THREE.CanvasTexture(canvas)

      material = new THREE.PointsMaterial({
        size: config.particleSize,
        vertexColors: true,
        map: texture,
        transparent: true,
        opacity: 0.8,
        sizeAttenuation: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })

      particles = new THREE.Points(geometry, material)
      scene.add(particles)

      calculateTargetsFromSeed(config.seedText)
    }

    initParticles()

    // --- ANIMATION LOOP ---
    const clock = new THREE.Clock()
    let animationId: number

    function animate() {
      animationId = requestAnimationFrame(animate)
      const time = clock.getElapsedTime()
      
      const positions = geometry.attributes.position.array as Float32Array
      const colors = geometry.attributes.color.array as Float32Array

      controls.autoRotateSpeed = config.rotationSpeed
      controls.update()

      for (let i = 0; i < config.particleCount; i++) {
        const i3 = i * 3

        // Position morph
        positions[i3] += (targetPositions[i3] - positions[i3]) * config.morphSpeed
        positions[i3 + 1] += (targetPositions[i3 + 1] - positions[i3 + 1]) * config.morphSpeed
        positions[i3 + 2] += (targetPositions[i3 + 2] - positions[i3 + 2]) * config.morphSpeed

        // Color morph
        colors[i3] += (targetColors[i3] - colors[i3]) * 0.03
        colors[i3 + 1] += (targetColors[i3 + 1] - colors[i3 + 1]) * 0.03
        colors[i3 + 2] += (targetColors[i3 + 2] - colors[i3 + 2]) * 0.03

        // Noise jitter
        if (config.noiseStrength > 0) {
          const noise = Math.sin(time * 2 + i) * (config.noiseStrength * 0.02)
          const noise2 = Math.cos(time * 1.5 + i * 0.5) * (config.noiseStrength * 0.02)
          
          positions[i3] += noise
          positions[i3 + 1] -= noise2
          positions[i3 + 2] += noise
        }
      }

      geometry.attributes.position.needsUpdate = true
      geometry.attributes.color.needsUpdate = true

      renderer.render(scene, camera)
    }

    animate()

    // Window resize handler
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setSize(window.innerWidth, window.innerHeight)
    }
    window.addEventListener('resize', handleResize)

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize)
      cancelAnimationFrame(animationId)
      geometry.dispose()
      material.dispose()
      renderer.dispose()
      container.removeChild(renderer.domElement)
    }
  }, [config])

  const handleSeedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfig(prev => ({ ...prev, seedText: e.target.value }))
  }

  const handleCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfig(prev => ({ ...prev, particleCount: parseInt(e.target.value) }))
  }

  const handleSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfig(prev => ({ ...prev, particleSize: parseFloat(e.target.value) }))
  }

  const handleNoiseChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfig(prev => ({ ...prev, noiseStrength: parseFloat(e.target.value) }))
  }

  const handleSpeedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfig(prev => ({ ...prev, rotationSpeed: parseFloat(e.target.value) }))
  }

  const downloadVideo = async () => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current || isRecording) return
    
    setIsRecording(true)
    setRecordingProgress(0)
    
    const renderer = rendererRef.current
    const scene = sceneRef.current
    const camera = cameraRef.current
    const canvas = renderer.domElement
    
    // Force a render to ensure colors are fresh
    renderer.render(scene, camera)
    
    // Use captureStream with explicit frame rate
    const stream = canvas.captureStream(30) // 30 FPS
    
    const chunks: Blob[] = []
    
    // Try different codecs for better color support
    let mimeType = 'video/webm;codecs=vp9'
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm;codecs=vp8'
    }
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm'
    }
    
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: mimeType,
      videoBitsPerSecond: 8000000 // Higher bitrate for better quality
    })
    
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data)
      }
    }
    
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${config.seedText}-${Date.now()}.webm`
      a.click()
      URL.revokeObjectURL(url)
      setIsRecording(false)
      setRecordingProgress(0)
    }
    
    // Start recording
    mediaRecorder.start(100) // Request data every 100ms
    
    // Record for 10 seconds
    const duration = 10000
    const interval = setInterval(() => {
      setRecordingProgress(prev => {
        const next = prev + (100 / (duration / 100))
        return next >= 100 ? 100 : next
      })
    }, 100)
    
    setTimeout(() => {
      clearInterval(interval)
      mediaRecorder.stop()
      stream.getTracks().forEach(track => track.stop())
    }, duration)
  }

  return (
    <>
      <div className={styles.header}>
        <h1 className={styles.title}>$NFT</h1>
        <p className={styles.subtitle}>Name Fungible Token</p>
      </div>

      <button 
        className={styles.settingsToggle}
        onClick={() => setShowControls(!showControls)}
        aria-label="Toggle settings"
        title="Settings"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 1v6m0 6v6M1 12h6m6 0h6"/>
        </svg>
      </button>
      
      <div className={styles.mainInput}>
        <label className={styles.inputLabel}>Shape DNA</label>
        <input 
          type="text" 
          maxLength={32}
          value={config.seedText}
          onChange={handleSeedChange}
          placeholder="oSKNYo_dev"
          className={styles.textInput}
        />
        <p className={styles.inputHint}>Enter text to generate your unique particle shape</p>
        
        {/* <div className={styles.downloadButtons}>
          <button 
            onClick={downloadVideo} 
            disabled={isRecording}
            className={styles.downloadBtn}
          >
            {isRecording ? `Recording ${Math.round(recordingProgress)}%` : 'Download Video'}
          </button>
        </div> */}
      </div>

      <div className={`${styles.advancedControls} ${showControls ? styles.showMobile : ''}`}>
        <button 
          className={styles.closeButton}
          onClick={() => setShowControls(false)}
          aria-label="Close settings"
        >
          ×
        </button>
        <div className={styles.controlGroup}>
          <label>
            Particle Count: <span className={styles.valueDisplay}>{config.particleCount}</span>
          </label>
          <input 
            type="range" 
            min="1000" 
            max="50000" 
            step="1000"
            value={config.particleCount}
            onChange={handleCountChange}
          />
        </div>

        <div className={styles.controlGroup}>
          <label>
            Particle Size: <span className={styles.valueDisplay}>{config.particleSize}</span>
          </label>
          <input 
            type="range" 
            min="0.01" 
            max="0.3" 
            step="0.01"
            value={config.particleSize}
            onChange={handleSizeChange}
          />
        </div>

        <div className={styles.controlGroup}>
          <label>
            Surface Jitter (Noise): <span className={styles.valueDisplay}>{config.noiseStrength}</span>
          </label>
          <input 
            type="range" 
            min="0" 
            max="2.0" 
            step="0.1"
            value={config.noiseStrength}
            onChange={handleNoiseChange}
          />
        </div>

        <div className={styles.controlGroup}>
          <label>
            Rotation Speed: <span className={styles.valueDisplay}>{config.rotationSpeed}</span>
          </label>
          <input 
            type="range" 
            min="0" 
            max="5" 
            step="0.1"
            value={config.rotationSpeed}
            onChange={handleSpeedChange}
          />
        </div>

        <div className={styles.stats}>Colors & Shapes are 100% Procedural</div>
      </div>
      <div ref={containerRef} className={styles.canvasContainer} />
    </>
  )
}

