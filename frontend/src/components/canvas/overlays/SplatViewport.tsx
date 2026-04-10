import { useRef, useEffect, useMemo, useCallback, useState } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera, OrthographicCamera } from '@react-three/drei'
import * as THREE from 'three'
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d'
import type { SplatFormat } from '../../../types'

interface SplatViewportProps {
  src: string
  format: SplatFormat
  width: number
  height: number
  isInteractive: boolean
  isOrtho: boolean
  onToggleOrtho: () => void
  cameraPosition?: [number, number, number]
  cameraTarget?: [number, number, number]
  cameraUp?: [number, number, number]
  resetKey?: number
  onCameraChange?: (position: [number, number, number], target: [number, number, number], up: [number, number, number]) => void
}

function splatFormatEnum(format: SplatFormat): number {
  // GaussianSplats3D.SceneFormat: Splat=0, KSplat=1, Ply=2
  switch (format) {
    case 'ksplat': return GaussianSplats3D.SceneFormat.KSplat
    case 'ply': return GaussianSplats3D.SceneFormat.Ply
    case 'splat':
    default:
      return GaussianSplats3D.SceneFormat.Splat
  }
}

/** Loads a splat scene into a DropInViewer attached to the R3F scene. */
function SplatScene({
  src,
  format,
  onLoaded,
  viewerRef,
}: {
  src: string
  format: SplatFormat
  onLoaded: () => void
  viewerRef: React.MutableRefObject<any>
}) {
  const { scene } = useThree()

  useEffect(() => {
    let cancelled = false
    const viewer = new GaussianSplats3D.DropInViewer({
      gpuAcceleratedSort: false,
      sharedMemoryForWorkers: false,
      halfPrecisionCovariancesOnGPU: false,
    })
    viewerRef.current = viewer
    scene.add(viewer)

    viewer
      .addSplatScene(src, {
        format: splatFormatEnum(format),
        showLoadingUI: false,
        progressiveLoad: false,
        // 180° rotation around X to convert Y-down (COLMAP/trained) to Y-up.
        // Applying via the library's API ensures the spherical harmonics
        // coefficients are rotated too, so shading remains correct.
        rotation: [1, 0, 0, 0],
      })
      .then(() => {
        if (!cancelled) onLoaded()
      })
      .catch((err: unknown) => {
        console.error('Failed to load splat scene:', err)
      })

    return () => {
      cancelled = true
      try {
        scene.remove(viewer)
        if (typeof viewer.dispose === 'function') {
          viewer.dispose()
        }
      } catch (err) {
        console.warn('Error disposing splat viewer:', err)
      }
      viewerRef.current = null
    }
  }, [src, format, scene, onLoaded, viewerRef])

  return null
}

/** Fit camera to splat scene bounds after it's loaded. */
function CameraController({
  sceneLoaded,
  isInteractive,
  viewerRef,
  onToggleOrtho,
  cameraPosition,
  cameraTarget,
  cameraUp,
  resetKey,
  onCameraChange,
}: {
  sceneLoaded: boolean
  isInteractive: boolean
  viewerRef: React.MutableRefObject<any>
  onToggleOrtho: () => void
  cameraPosition?: [number, number, number]
  cameraTarget?: [number, number, number]
  cameraUp?: [number, number, number]
  resetKey?: number
  onCameraChange?: (position: [number, number, number], target: [number, number, number], up: [number, number, number]) => void
}) {
  const { scene, camera, gl } = useThree()
  const controlsRef = useRef<any>(null)
  const fitted = useRef(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>()
  const lastResetKey = useRef(resetKey ?? 0)
  const mouseClientRef = useRef<{ x: number; y: number }>({ x: -1, y: -1 })

  // Fly controls: track held WASD/EQ keys
  const flyKeysRef = useRef(new Set<string>())
  const FLY_KEYS = new Set(['w', 'a', 's', 'd', 'e', 'q'])

  const emitCameraChange = useCallback(() => {
    if (!onCameraChange) return
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      const pos: [number, number, number] = [camera.position.x, camera.position.y, camera.position.z]
      const up: [number, number, number] = [camera.up.x, camera.up.y, camera.up.z]
      const controls = controlsRef.current
      const target: [number, number, number] = controls
        ? [controls.target.x, controls.target.y, controls.target.z]
        : [0, 0, 0]
      onCameraChange(pos, target, up)
    }, 500)
  }, [camera, onCameraChange])

  // Track mouse position at window level (always fires, regardless of overlay state)
  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      mouseClientRef.current.x = e.clientX
      mouseClientRef.current.y = e.clientY
    }
    window.addEventListener('mousemove', handleMove)
    return () => window.removeEventListener('mousemove', handleMove)
  }, [])

  // Keyboard controls — only active when splat viewport is interactive
  // (selected) and the cursor is hovering over it. Capture phase so our
  // 'c' handler runs before the canvas-wide 'c' shortcut.
  useEffect(() => {
    if (!isInteractive) return

    const isCursorOverCanvas = () => {
      const canvas = gl.domElement
      const rect = canvas.getBoundingClientRect()
      const mx = mouseClientRef.current.x
      const my = mouseClientRef.current.y
      return mx >= rect.left && mx <= rect.right && my >= rect.top && my <= rect.bottom
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return
      if (!isCursorOverCanvas()) return

      const dropIn = viewerRef.current
      const innerViewer = dropIn?.viewer
      const splatMesh = dropIn?.splatMesh
      const controls = controlsRef.current

      switch (e.key) {
        case 'c': {
          if (!controls || !splatMesh) return
          e.preventDefault()
          e.stopImmediatePropagation()
          const rc = innerViewer?.raycaster
          if (!rc || typeof rc.setFromCameraAndScreenPosition !== 'function') return
          const canvas = gl.domElement
          const rect = canvas.getBoundingClientRect()
          const mousePx = new THREE.Vector2(mouseClientRef.current.x - rect.left, mouseClientRef.current.y - rect.top)
          const renderDims = new THREE.Vector2(rect.width, rect.height)
          rc.setFromCameraAndScreenPosition(camera, mousePx, renderDims)
          const outHits: Array<{ origin: THREE.Vector3 }> = []
          rc.intersectSplatMesh(splatMesh, outHits)
          if (outHits.length === 0) return
          controls.target.copy(outHits[0].origin)
          controls.update()
          emitCameraChange()
          return
        }
        case 'ArrowLeft':
        case 'ArrowRight': {
          if (!controls) return
          e.preventDefault()
          e.stopImmediatePropagation()
          // Rotate camera.up around the forward direction by ±π/128
          // (same step as the built-in Viewer).
          const forward = new THREE.Vector3(0, 0, -1).transformDirection(camera.matrixWorld)
          const angle = e.key === 'ArrowLeft' ? Math.PI / 128 : -Math.PI / 128
          const m = new THREE.Matrix4().makeRotationAxis(forward, angle)
          camera.up.transformDirection(m)
          controls.update()
          emitCameraChange()
          return
        }
        case 'p': {
          if (!splatMesh || typeof splatMesh.setPointCloudModeEnabled !== 'function') return
          e.preventDefault()
          e.stopImmediatePropagation()
          splatMesh.setPointCloudModeEnabled(!splatMesh.getPointCloudModeEnabled())
          return
        }
        case 'o': {
          e.preventDefault()
          e.stopImmediatePropagation()
          onToggleOrtho()
          return
        }
        case '=':
        case '+': {
          if (!splatMesh || typeof splatMesh.setSplatScale !== 'function') return
          e.preventDefault()
          e.stopImmediatePropagation()
          splatMesh.setSplatScale(splatMesh.getSplatScale() + 0.05)
          return
        }
        case '-': {
          if (!splatMesh || typeof splatMesh.setSplatScale !== 'function') return
          e.preventDefault()
          e.stopImmediatePropagation()
          splatMesh.setSplatScale(Math.max(splatMesh.getSplatScale() - 0.05, 0.0))
          return
        }
        case 'i': {
          const infoPanel = innerViewer?.infoPanel
          if (!infoPanel) return
          e.preventDefault()
          e.stopImmediatePropagation()
          if (innerViewer.showInfo) {
            innerViewer.showInfo = false
            infoPanel.hide()
          } else {
            innerViewer.showInfo = true
            infoPanel.show()
          }
          return
        }
      }
    }
    const handleFlyKeyDown = (e: KeyboardEvent) => {
      if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return
      if (!FLY_KEYS.has(e.key)) return
      if (!isCursorOverCanvas()) return
      e.preventDefault()
      e.stopImmediatePropagation()
      flyKeysRef.current.add(e.key)
    }

    const handleFlyKeyUp = (e: KeyboardEvent) => {
      if (FLY_KEYS.has(e.key)) {
        flyKeysRef.current.delete(e.key)
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('keydown', handleFlyKeyDown, true)
    window.addEventListener('keyup', handleFlyKeyUp, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('keydown', handleFlyKeyDown, true)
      window.removeEventListener('keyup', handleFlyKeyUp, true)
      flyKeysRef.current.clear()
    }
  }, [isInteractive, camera, scene, gl, viewerRef, onToggleOrtho, emitCameraChange])

  // Fly movement: apply per-frame translation while WASD/EQ keys are held.
  // Speed scales with distance from the orbit target so it feels natural at
  // any zoom level.
  const flyEmitTimerRef = useRef<ReturnType<typeof setTimeout>>()
  useFrame((_, delta) => {
    const keys = flyKeysRef.current
    if (keys.size === 0) return
    const controls = controlsRef.current
    if (!controls) return

    const distance = camera.position.distanceTo(controls.target)
    const speed = distance * 0.8 * delta // ~80% of target distance per second

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion)
    const up = camera.up.clone()

    const move = new THREE.Vector3()
    if (keys.has('w')) move.add(forward)
    if (keys.has('s')) move.sub(forward)
    if (keys.has('d')) move.add(right)
    if (keys.has('a')) move.sub(right)
    if (keys.has('e')) move.add(up)
    if (keys.has('q')) move.sub(up)

    if (move.lengthSq() === 0) return
    move.normalize().multiplyScalar(speed)

    camera.position.add(move)
    controls.target.add(move)
    controls.update()

    // Debounced persist — don't save every frame, just after movement settles
    if (flyEmitTimerRef.current) clearTimeout(flyEmitTimerRef.current)
    flyEmitTimerRef.current = setTimeout(() => emitCameraChange(), 500)
  })

  const fitToView = useCallback(() => {
    const box = new THREE.Box3().setFromObject(scene)
    if (box.isEmpty()) return

    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    const controls = controlsRef.current
    const distance = Math.max(maxDim * 2, 2)

    camera.position.set(
      center.x + distance * 0.5,
      center.y + distance * 0.4,
      center.z + distance * 0.5,
    )
    if (controls) {
      controls.target.copy(center)
      controls.update()
    }
    camera.updateProjectionMatrix()
  }, [scene, camera])

  useEffect(() => {
    if (!sceneLoaded || fitted.current) return

    const timer = setTimeout(() => {
      const controls = controlsRef.current
      if (cameraUp) {
        camera.up.set(...cameraUp)
      }
      if (cameraPosition && cameraTarget) {
        camera.position.set(...cameraPosition)
        if (controls) {
          controls.target.set(...cameraTarget)
          controls.update()
        }
      } else {
        fitToView()
      }
      camera.updateProjectionMatrix()
      fitted.current = true
    }, 100)

    return () => clearTimeout(timer)
  }, [sceneLoaded, camera, cameraPosition, cameraTarget, cameraUp, fitToView])

  useEffect(() => {
    if (resetKey != null && resetKey !== lastResetKey.current) {
      lastResetKey.current = resetKey
      fitToView()
    }
  }, [resetKey, fitToView])

  const handleEnd = emitCameraChange

  return (
    <OrbitControls
      ref={controlsRef}
      onEnd={handleEnd}
      mouseButtons={{
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.PAN,
      }}
    />
  )
}

export default function SplatViewport({
  src,
  format,
  width,
  height,
  isInteractive,
  isOrtho,
  onToggleOrtho,
  cameraPosition,
  cameraTarget,
  cameraUp,
  resetKey,
  onCameraChange,
}: SplatViewportProps) {
  const dpr = useMemo(() => Math.min(window.devicePixelRatio, 2), [])
  const [sceneLoaded, setSceneLoaded] = useState(false)
  const handleLoaded = useCallback(() => setSceneLoaded(true), [])
  const viewerRef = useRef<any>(null)

  return (
    <div
      style={{
        width,
        height,
        pointerEvents: isInteractive ? 'auto' : 'none',
        background: '#1a1a2e',
      }}
    >
      <Canvas
        dpr={dpr}
        style={{ width: '100%', height: '100%', pointerEvents: isInteractive ? 'auto' : 'none' }}
      >
        {isOrtho ? (
          <OrthographicCamera makeDefault near={0.1} far={1000} position={[0, 0, 5]} zoom={100} />
        ) : (
          <PerspectiveCamera makeDefault fov={50} near={0.1} far={1000} position={[0, 0, 5]} />
        )}
        <SplatScene src={src} format={format} onLoaded={handleLoaded} viewerRef={viewerRef} />
        <CameraController
          sceneLoaded={sceneLoaded}
          isInteractive={isInteractive}
          viewerRef={viewerRef}
          onToggleOrtho={onToggleOrtho}
          cameraPosition={cameraPosition}
          cameraTarget={cameraTarget}
          cameraUp={cameraUp}
          resetKey={resetKey}
          onCameraChange={onCameraChange}
        />
      </Canvas>
    </div>
  )
}
