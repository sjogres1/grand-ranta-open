import { Canvas, useFrame } from '@react-three/fiber'
import { Html, Sparkles, Trail } from '@react-three/drei'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

/* Real doubles-court dimensions in metres. */
const HALF_L = 6.7
const HALF_W = 3.05
const NET_H = 1.55

type ShotType = 'clear' | 'drive' | 'drop' | 'smash'

interface Athlete {
  name: string
  age: number
  side: 1 | -1
  home: [number, number]
  shirt: string
  shorts: string
  skin: string
  hair: string
  headband?: string
  ponytail?: boolean
  moustache?: boolean
}

// Fit people aged 25–75: two doubles teams mixing generations.
const ATHLETES: Athlete[] = [
  { name: 'Mikko', age: 29, side: 1, home: [-1.3, 3.3], shirt: '#ff4d6d', shorts: '#1b1f3a', skin: '#f1c7a5', hair: '#3a2618', headband: '#ffffff' },
  { name: 'Pirjo', age: 63, side: 1, home: [1.4, 4.7], shirt: '#ffd166', shorts: '#1b1f3a', skin: '#eab796', hair: '#d9d9d9', ponytail: true },
  { name: 'Aino', age: 41, side: -1, home: [-1.4, -4.6], shirt: '#2ec4b6', shorts: '#14213d', skin: '#c68b62', hair: '#1d1d1d', ponytail: true, headband: '#c6ff3d' },
  { name: 'Raimo', age: 74, side: -1, home: [1.3, -3.3], shirt: '#4cc9f0', shorts: '#14213d', skin: '#f0c9a8', hair: '#f4f4f4', moustache: true },
]

interface Sim {
  from: THREE.Vector3
  to: THREE.Vector3
  start: number
  dur: number
  peak: number
  shot: ShotType
  plannedReply: ShotType
  receiver: number
  swingAt: number[]
  swingShot: ShotType[]
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)]

function randomShot(): ShotType {
  const r = Math.random()
  return r < 0.35 ? 'clear' : r < 0.6 ? 'drive' : r < 0.78 ? 'drop' : 'smash'
}

/** Where the receiver will meet the shuttle. Smash replies are met high so they can jump. */
function contactPoint(idx: number, reply: ShotType, shot: ShotType): THREE.Vector3 {
  const a = ATHLETES[idx]
  const s = a.side
  let z = a.home[1] + rand(-1, 1)
  if (shot === 'clear') z = s * rand(4.6, 6.0)
  if (shot === 'drop') z = s * rand(1.6, 2.6)
  z = clamp(Math.abs(z), 1.4, 6.2) * s
  const x = clamp(a.home[0] + rand(-1.2, 1.2), -2.6, 2.6)
  const y = reply === 'smash' ? rand(2.5, 2.8) : shot === 'drop' ? rand(0.8, 1.2) : rand(1.5, 2.2)
  return new THREE.Vector3(x, y, z)
}

function shuttlePos(sim: Sim, p: number, out: THREE.Vector3) {
  // Shuttles decelerate hard: cover ground fast, then drop.
  const h = 1 - Math.pow(1 - p, 1.35)
  out.x = THREE.MathUtils.lerp(sim.from.x, sim.to.x, h)
  out.z = THREE.MathUtils.lerp(sim.from.z, sim.to.z, h)
  out.y = THREE.MathUtils.lerp(sim.from.y, sim.to.y, h) + 4 * sim.peak * h * (1 - h)
  return out
}

function launch(sim: Sim, hitter: number, t: number) {
  const shot = sim.plannedReply
  const side = ATHLETES[hitter].side
  const opponents = ATHLETES.map((a, i) => (a.side === -side ? i : -1)).filter((i) => i >= 0)
  sim.receiver = pick(opponents)
  sim.plannedReply = randomShot()
  sim.shot = shot
  sim.swingAt[hitter] = t
  sim.swingShot[hitter] = shot
  sim.from.copy(sim.to)
  sim.to.copy(contactPoint(sim.receiver, sim.plannedReply, shot))
  sim.start = t
  switch (shot) {
    case 'clear': sim.peak = rand(3.4, 4.4); sim.dur = rand(1.45, 1.7); break
    case 'drive': sim.peak = rand(0.3, 0.6); sim.dur = rand(0.7, 0.85); break
    case 'drop': sim.peak = rand(0.6, 1.0); sim.dur = rand(1.0, 1.2); break
    case 'smash': sim.peak = 0.05; sim.dur = rand(0.45, 0.55); break
  }
  // Make sure it clears the net.
  const p0 = sim.from.z / (sim.from.z - sim.to.z)
  const base = THREE.MathUtils.lerp(sim.from.y, sim.to.y, p0)
  const needed = (NET_H + 0.25 - base) / (4 * p0 * (1 - p0))
  sim.peak = Math.max(sim.peak, needed)
}

function useSim(): Sim {
  return useMemo(() => {
    const sim: Sim = {
      from: new THREE.Vector3(),
      to: new THREE.Vector3(-1.3, 2, 3.0),
      start: 0,
      dur: 1,
      peak: 1,
      shot: 'clear',
      plannedReply: 'clear',
      receiver: 0,
      swingAt: ATHLETES.map(() => -10),
      swingShot: ATHLETES.map(() => 'clear' as ShotType),
    }
    launch(sim, 0, 0)
    return sim
  }, [])
}

/* ------------------------------------------------------------------ court */

function Court() {
  const lines = useMemo(() => {
    const L: [number, number, number, number][] = [] // x, z, sizeX, sizeZ
    const T = 0.04
    for (const x of [-HALF_W, HALF_W, -2.59, 2.59]) L.push([x, 0, T, HALF_L * 2])
    for (const z of [-HALF_L, HALF_L, -5.94, 5.94, -1.98, 1.98]) L.push([0, z, HALF_W * 2, T])
    for (const s of [-1, 1]) L.push([0, s * (1.98 + HALF_L) / 2, T, HALF_L - 1.98])
    return L
  }, [])

  const netTexture = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const g = c.getContext('2d')!
    g.strokeStyle = 'rgba(240,240,240,0.9)'
    g.lineWidth = 3
    g.strokeRect(0, 0, 64, 64)
    const tex = new THREE.CanvasTexture(c)
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(70, 9)
    return tex
  }, [])

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color="#1a2238" roughness={0.9} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.003} receiveShadow>
        <planeGeometry args={[HALF_W * 2 + 2.4, HALF_L * 2 + 3.2]} />
        <meshStandardMaterial color="#17573f" roughness={0.7} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.006} receiveShadow>
        <planeGeometry args={[HALF_W * 2, HALF_L * 2]} />
        <meshStandardMaterial color="#1f7a55" roughness={0.6} />
      </mesh>
      {lines.map(([x, z, sx, sz], i) => (
        <mesh key={i} position={[x, 0.01, z]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[sx, sz]} />
          <meshStandardMaterial color="#f5f5f5" />
        </mesh>
      ))}
      {/* net */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (HALF_W + 0.05), NET_H / 2, 0]} castShadow>
          <cylinderGeometry args={[0.03, 0.04, NET_H, 12]} />
          <meshStandardMaterial color="#d0d4dd" metalness={0.6} roughness={0.3} />
        </mesh>
      ))}
      <mesh position={[0, NET_H - 0.38, 0]}>
        <planeGeometry args={[HALF_W * 2, 0.76]} />
        <meshStandardMaterial map={netTexture} transparent opacity={0.55} side={THREE.DoubleSide} color="#0d0d0d" />
      </mesh>
      <mesh position={[0, NET_H - 0.02, 0]}>
        <boxGeometry args={[HALF_W * 2, 0.05, 0.015]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      {/* glowing advertising boards around the court */}
      {(
        [
          [0, -10.2, 12, 0, '#c6ff3d'],
          [0, 10.2, 12, 0, '#ff4d6d'],
          [-6.6, 0, 17, Math.PI / 2, '#4cc9f0'],
          [6.6, 0, 17, Math.PI / 2, '#ffd166'],
        ] as const
      ).map(([x, z, w, rot, c], i) => (
        <group key={i} position={[x, 0, z]} rotation-y={rot}>
          <mesh position-y={0.35}>
            <boxGeometry args={[w, 0.7, 0.08]} />
            <meshStandardMaterial color="#0d1328" roughness={0.8} />
          </mesh>
          <mesh position-y={0.66}>
            <boxGeometry args={[w, 0.06, 0.1]} />
            <meshBasicMaterial color={c} />
          </mesh>
        </group>
      ))}
      {/* ceiling light strips */}
      {[-5, 0, 5].map((z) => (
        <mesh key={z} position={[0, 11, z]}>
          <boxGeometry args={[8, 0.1, 0.6]} />
          <meshBasicMaterial color="#fff6dd" />
        </mesh>
      ))}
    </group>
  )
}

/* ---------------------------------------------------------------- players */

function Racket() {
  return (
    <group position={[0, -0.6, 0]}>
      <mesh position={[0, -0.1, 0]}>
        <cylinderGeometry args={[0.018, 0.018, 0.2, 8]} />
        <meshStandardMaterial color="#222" />
      </mesh>
      <mesh position={[0, -0.33, 0]}>
        <cylinderGeometry args={[0.006, 0.006, 0.28, 6]} />
        <meshStandardMaterial color="#c6ff3d" metalness={0.5} />
      </mesh>
      <group position={[0, -0.58, 0]}>
        <mesh scale={[1, 1.25, 1]}>
          <torusGeometry args={[0.11, 0.009, 8, 32]} />
          <meshStandardMaterial color="#c6ff3d" metalness={0.4} roughness={0.3} />
        </mesh>
        <mesh scale={[1, 1.25, 1]}>
          <circleGeometry args={[0.105, 24]} />
          <meshStandardMaterial color="#ffffff" transparent opacity={0.3} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  )
}

function Player({ idx, sim }: { idx: number; sim: Sim }) {
  const a = ATHLETES[idx]
  const root = useRef<THREE.Group>(null!)
  const body = useRef<THREE.Group>(null!)
  const arm = useRef<THREE.Group>(null!)
  const legL = useRef<THREE.Mesh>(null!)
  const legR = useRef<THREE.Mesh>(null!)
  const target = useMemo(() => new THREE.Vector3(), [])
  const last = useMemo(() => new THREE.Vector3(a.home[0], 0, a.home[1]), [a])
  const facing = a.side === 1 ? Math.PI : 0

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime
    const g = root.current
    const isReceiver = sim.receiver === idx
    const flight = (t - sim.start) / sim.dur

    // Racket hand is on the player's right; offset body so the racket meets the shuttle.
    if (isReceiver) target.set(sim.to.x + 0.45 * a.side, 0, sim.to.z + 0.25 * a.side)
    else target.set(a.home[0], 0, a.home[1])
    const speed = isReceiver ? 5.5 : 2.5
    g.position.x = THREE.MathUtils.damp(g.position.x, target.x, speed, dt)
    g.position.z = THREE.MathUtils.damp(g.position.z, target.z, speed, dt)

    const moved = g.position.distanceTo(last) / Math.max(dt, 1e-3)
    last.copy(g.position)
    const running = clamp(moved / 3, 0, 1)

    // Legs + bounce (ready-position split steps when idle).
    const stride = Math.sin(t * 14) * 0.6 * running
    legL.current.rotation.x = stride
    legR.current.rotation.x = -stride
    let y = Math.abs(Math.sin(t * (running > 0.2 ? 14 : 5) + idx)) * (0.03 + 0.05 * running)

    // Arm: ready → wind-up while shuttle approaches → fast swing after contact.
    const since = t - sim.swingAt[idx]
    let armX: number
    if (since < 0.32) {
      const k = since / 0.32
      const ease = 1 - Math.pow(1 - k, 3)
      armX = THREE.MathUtils.lerp(-3.9, sim.swingShot[idx] === 'drop' ? -2.0 : -1.2, ease)
      if (sim.swingShot[idx] === 'smash') y += Math.sin(Math.min(1, since / 0.32 + 0.5) * Math.PI) * 0.35
    } else if (isReceiver && flight > 0.45) {
      armX = THREE.MathUtils.damp(arm.current.rotation.x, -3.9, 10, dt)
      if (sim.plannedReply === 'smash' && flight > 0.75) y += (flight - 0.75) * 1.4
    } else {
      armX = THREE.MathUtils.damp(arm.current.rotation.x, -2.3 + Math.sin(t * 2 + idx) * 0.08, 4, dt)
    }
    arm.current.rotation.x = armX
    body.current.position.y = y
    body.current.rotation.x = 0.12 + running * 0.12

    // Turn slightly toward the shuttle.
    const sp = shuttlePos(sim, clamp(flight, 0, 1), target)
    const look = Math.atan2(sp.x - g.position.x, sp.z - g.position.z)
    const delta = Math.atan2(Math.sin(look - facing), Math.cos(look - facing))
    g.rotation.y = facing + clamp(delta, -0.6, 0.6) * 0.6
  })

  return (
    <group ref={root} position={[a.home[0], 0, a.home[1]]} rotation-y={facing}>
      <group ref={body}>
        {/* legs */}
        <mesh ref={legL} position={[-0.11, 0.48, 0]} castShadow>
          <capsuleGeometry args={[0.075, 0.6, 4, 10]} />
          <meshStandardMaterial color={a.skin} roughness={0.7} />
        </mesh>
        <mesh ref={legR} position={[0.11, 0.48, 0]} castShadow>
          <capsuleGeometry args={[0.075, 0.6, 4, 10]} />
          <meshStandardMaterial color={a.skin} roughness={0.7} />
        </mesh>
        {[-0.11, 0.11].map((x) => (
          <mesh key={x} position={[x, 0.06, 0.05]} castShadow>
            <boxGeometry args={[0.13, 0.1, 0.28]} />
            <meshStandardMaterial color="#f7f7f7" />
          </mesh>
        ))}
        {/* shorts */}
        <mesh position={[0, 0.85, 0]} castShadow>
          <cylinderGeometry args={[0.2, 0.22, 0.3, 14]} />
          <meshStandardMaterial color={a.shorts} />
        </mesh>
        {/* torso */}
        <mesh position={[0, 1.2, 0]} castShadow>
          <capsuleGeometry args={[0.2, 0.36, 6, 14]} />
          <meshStandardMaterial color={a.shirt} roughness={0.5} />
        </mesh>
        {/* head */}
        <group position={[0, 1.66, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.14, 20, 20]} />
            <meshStandardMaterial color={a.skin} roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.035, -0.02]} scale={[1.06, 0.9, 1.06]}>
            <sphereGeometry args={[0.14, 20, 20, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color={a.hair} roughness={0.9} />
          </mesh>
          {a.ponytail && (
            <mesh position={[0, 0.02, -0.17]}>
              <sphereGeometry args={[0.06, 12, 12]} />
              <meshStandardMaterial color={a.hair} roughness={0.9} />
            </mesh>
          )}
          {a.headband && (
            <mesh position={[0, 0.05, 0]} rotation-x={Math.PI / 2}>
              <torusGeometry args={[0.142, 0.018, 8, 24]} />
              <meshStandardMaterial color={a.headband} />
            </mesh>
          )}
          {[-0.05, 0.05].map((x) => (
            <mesh key={x} position={[x, 0.02, 0.13]}>
              <sphereGeometry args={[0.016, 8, 8]} />
              <meshBasicMaterial color="#111" />
            </mesh>
          ))}
          {a.moustache && (
            <mesh position={[0, -0.04, 0.13]}>
              <boxGeometry args={[0.09, 0.022, 0.02]} />
              <meshStandardMaterial color={a.hair} />
            </mesh>
          )}
        </group>
        {/* left arm */}
        <mesh position={[-0.28, 1.15, 0.06]} rotation={[-0.5, 0, -0.25]} castShadow>
          <capsuleGeometry args={[0.055, 0.45, 4, 8]} />
          <meshStandardMaterial color={a.skin} roughness={0.7} />
        </mesh>
        {/* racket arm, pivots at the shoulder */}
        <group ref={arm} position={[0.28, 1.42, 0]} rotation-x={-2.3}>
          <mesh position={[0, -0.3, 0]} castShadow>
            <capsuleGeometry args={[0.055, 0.48, 4, 8]} />
            <meshStandardMaterial color={a.skin} roughness={0.7} />
          </mesh>
          <Racket />
        </group>
      </group>
      <Html position={[0, 2.05, 0]} center distanceFactor={11} zIndexRange={[5, 0]}>
        <div className="player-tag">
          <b>{a.name}</b> · {a.age}
        </div>
      </Html>
    </group>
  )
}

/* ---------------------------------------------------------------- shuttle */

function Shuttle({ sim }: { sim: Sim }) {
  const ref = useRef<THREE.Group>(null!)
  const ahead = useMemo(() => new THREE.Vector3(), [])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    let p = (t - sim.start) / sim.dur
    if (p >= 1) {
      launch(sim, sim.receiver, t)
      p = 0
    }
    shuttlePos(sim, p, ref.current.position)
    shuttlePos(sim, Math.min(1, p + 0.03), ahead)
    if (ahead.distanceToSquared(ref.current.position) > 1e-6) ref.current.lookAt(ahead)
  })

  // Built pointing along +Z (cork first), scaled up ~3x so it reads from afar.
  return (
    <Trail width={0.9} length={5} color="#c6ff3d" attenuation={(w) => w * w}>
      <group ref={ref} scale={3}>
        <mesh position={[0, 0, 0.035]}>
          <sphereGeometry args={[0.014, 12, 12]} />
          <meshStandardMaterial color="#f8f8f8" emissive="#ffffff" emissiveIntensity={0.3} />
        </mesh>
        <mesh position={[0, 0, -0.005]} rotation-x={Math.PI / 2}>
          <coneGeometry args={[0.033, 0.07, 16, 1, true]} />
          <meshStandardMaterial color="#ffffff" side={THREE.DoubleSide} transparent opacity={0.92} emissive="#ffffff" emissiveIntensity={0.25} />
        </mesh>
      </group>
    </Trail>
  )
}

/* ----------------------------------------------------------------- camera */

function CameraRig() {
  const goal = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera, clock, pointer }) => {
    const ang = 0.95 + Math.sin(clock.elapsedTime * 0.07) * 0.6
    goal.set(Math.sin(ang) * 12.5 + pointer.x * 1.2, 4.6 + pointer.y * 0.6, Math.cos(ang) * 12.5)
    camera.position.lerp(goal, 0.04)
    camera.lookAt(0, 3.2, 0) // look above the court so it sits in the lower part of the frame
  })
  return null
}

function Scene() {
  const sim = useSim()
  return (
    <>
      <color attach="background" args={['#0a0f1f']} />
      <fog attach="fog" args={['#0a0f1f', 16, 38]} />
      <hemisphereLight args={['#c8d8ff', '#1a2238', 0.6]} />
      <directionalLight
        position={[6, 14, 6]}
        intensity={2.1}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
      />
      <spotLight position={[-8, 9, -6]} angle={0.5} penumbra={0.8} intensity={120} color="#ff4d6d" />
      <spotLight position={[8, 9, -8]} angle={0.5} penumbra={0.8} intensity={120} color="#4cc9f0" />
      <Court />
      {ATHLETES.map((_, i) => (
        <Player key={i} idx={i} sim={sim} />
      ))}
      <Shuttle sim={sim} />
      <Sparkles count={80} scale={[16, 8, 20]} position={[0, 4, 0]} size={2.5} speed={0.25} opacity={0.35} color="#fff6dd" />
      <CameraRig />
    </>
  )
}

export default function HeroScene() {
  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: [10, 5.5, 9], fov: 42 }}>
      <Scene />
    </Canvas>
  )
}
