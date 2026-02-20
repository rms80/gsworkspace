import { useRef, useEffect, useMemo, Suspense, useCallback } from 'react'
import { Canvas, useThree, useLoader } from '@react-three/fiber'
import { OrbitControls, Environment, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import type { Model3DFormat } from '../../../types'

interface Model3DViewportProps {
  src: string
  format: Model3DFormat
  width: number
  height: number
  isInteractive: boolean
  cameraPosition?: [number, number, number]
  cameraTarget?: [number, number, number]
  resetKey?: number
  onCameraChange?: (position: [number, number, number], target: [number, number, number]) => void
}

function GLTFModel({ src }: { src: string }) {
  const gltf = useGLTF(src)
  return <primitive object={gltf.scene.clone()} />
}

function OBJModel({ src }: { src: string }) {
  const obj = useLoader(OBJLoader, src)
  return <primitive object={obj.clone()} />
}

function STLModel({ src }: { src: string }) {
  const geometry = useLoader(STLLoader, src)
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color="#888888" />
    </mesh>
  )
}

function FBXModel({ src }: { src: string }) {
  const fbx = useLoader(FBXLoader, src)
  return <primitive object={fbx.clone()} />
}

function ModelLoader({ src, format }: { src: string; format: Model3DFormat }) {
  switch (format) {
    case 'glb':
    case 'gltf':
      return <GLTFModel src={src} />
    case 'obj':
      return <OBJModel src={src} />
    case 'stl':
      return <STLModel src={src} />
    case 'fbx':
      return <FBXModel src={src} />
    default:
      return <GLTFModel src={src} />
  }
}

/** Combined auto-fit camera + orbit controls. Sets OrbitControls target to model
 *  center so the camera orbits around the model, not the origin. */
function CameraController({
  cameraPosition,
  cameraTarget,
  resetKey,
  onCameraChange,
}: {
  cameraPosition?: [number, number, number]
  cameraTarget?: [number, number, number]
  resetKey?: number
  onCameraChange?: (position: [number, number, number], target: [number, number, number]) => void
}) {
  const { scene, camera } = useThree()
  const controlsRef = useRef<any>(null)
  const fitted = useRef(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>()
  const lastResetKey = useRef(resetKey ?? 0)

  /** Position camera to frame the scene bounding box */
  const fitToView = useCallback(() => {
    const box = new THREE.Box3().setFromObject(scene)
    if (box.isEmpty()) return

    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    const controls = controlsRef.current
    const distance = maxDim * 2

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

  // Auto-fit on first load
  useEffect(() => {
    if (fitted.current) return

    const timer = setTimeout(() => {
      const box = new THREE.Box3().setFromObject(scene)
      if (box.isEmpty()) return

      const controls = controlsRef.current

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
  }, [scene, camera, cameraPosition, cameraTarget, fitToView])

  // React to reset requests
  useEffect(() => {
    if (resetKey != null && resetKey !== lastResetKey.current) {
      lastResetKey.current = resetKey
      fitToView()
    }
  }, [resetKey, fitToView])

  const handleEnd = useCallback(() => {
    if (!onCameraChange) return
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      const pos: [number, number, number] = [camera.position.x, camera.position.y, camera.position.z]
      const controls = controlsRef.current
      const target: [number, number, number] = controls
        ? [controls.target.x, controls.target.y, controls.target.z]
        : [0, 0, 0]
      onCameraChange(pos, target)
    }, 500)
  }, [camera, onCameraChange])

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

function LoadingFallback() {
  return (
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#555" wireframe />
    </mesh>
  )
}

export default function Model3DViewport({
  src,
  format,
  width,
  height,
  isInteractive,
  cameraPosition,
  cameraTarget,
  resetKey,
  onCameraChange,
}: Model3DViewportProps) {
  const dpr = useMemo(() => Math.min(window.devicePixelRatio, 2), [])

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
        camera={{ fov: 50, near: 0.01, far: 10000 }}
        style={{ width: '100%', height: '100%', pointerEvents: isInteractive ? 'auto' : 'none' }}
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 5, 5]} intensity={1} />
        <directionalLight position={[-3, 2, -3]} intensity={0.3} />
        <Environment preset="studio" />
        <Suspense fallback={<LoadingFallback />}>
          <ModelLoader src={src} format={format} />
        </Suspense>
        <CameraController
          cameraPosition={cameraPosition}
          cameraTarget={cameraTarget}
          resetKey={resetKey}
          onCameraChange={onCameraChange}
        />
      </Canvas>
    </div>
  )
}
