import * as THREE from 'three'
import {
  formatMoney,
  type GroupStyle,
  type Insets,
  type MapEdge,
  type MapLayout,
  type MapMeasure,
  type MapNode,
  radiusFor,
  shortLabel,
} from './map-types.ts'
import { type Centre3D, clusterCentres3D, ForceSim3D, type SimNode3D } from './force3d.ts'
import { ACCENT, CLUSTER_COLOURS, SURFACE } from './palette.ts'

// ---------------------------------------------------------------------------
// The money map's 3D engine - ported from corpuskit's map3d-engine.ts.
//
// Everything imperative lives here - the three.js scene, the camera, the
// gestures, the force simulation and the DOM label overlay - so the vanilla
// adapter above it (mount.ts) stays a thin shell that pushes data in and
// receives selections back.
//
// The visual grammar, carried into depth:
//
//   position   the industry territory a donor belongs to, and inside it, who
//              it gives to - an orbit around the parties at the centre
//   colour     the industry cluster (party nodes carry their party's colour)
//   size       lifetime dollars, log scaled
//   presence   dimmed nodes recede when something has focus
//   depth      distance fades into the paper via fog, so the third axis
//              reads as atmosphere rather than clutter
//
// Port changes, kept deliberately small: colours come from the static
// palette module instead of tenant CSS tokens (so the palette observer and
// probe element are gone), nodes may override their cluster hue (parties),
// and cluster centres accept a central group (the parties ring's origin).
// Everything else - gestures, momentum, labels, reduced motion - is the
// source engine's behaviour, unchanged.
// ---------------------------------------------------------------------------

/** Camera vertical field of view. Narrow enough to keep spheres round at the edges. */
const FOV = 40

/** Dolly bounds, as multiples of the fitted distance. */
const MIN_DIST_FACTOR = 0.22
const MAX_DIST_FACTOR = 3.2

/** How long the view takes to move to a selection - mirrors the 2D map. */
const FOCUS_MS = 380
const FIT_MS = 520

/**
 * The band a focus move lands in, in world units of camera distance. The
 * floor keeps a whole neighbourhood in frame; the ceiling stops a lone
 * entity pulling the camera into its surface.
 */
const FOCUS_MIN_DIST = 230
const FOCUS_MAX_DIST = 560

/** Idle drift, radians per second. Slow enough to read as alive, not busy. */
const IDLE_SPIN = 0.05

/** Polar clamp - the camera never goes underneath or straight overhead. */
const PHI_MIN = 0.35
const PHI_MAX = Math.PI - 0.55

type Palette3D = {
  cats: THREE.Color[]
  /** Text-safe ink per slot, for territory captions. */
  inks: string[]
  surface: THREE.Color
  accent: THREE.Color
}

export type EngineData = {
  nodes: MapNode[]
  edges: MapEdge[]
  groupStyles: Map<string, GroupStyle>
  degrees: Map<string, number>
  measure: MapMeasure
  layout: MapLayout
  aspect: number
  /** Group pinned to the origin with the rest ringed around it (the parties). */
  centralGroup?: string
}

export type EngineEmphasis = {
  selectedId: string | null
  pathEdges: MapEdge[] | null
  pathFrom: string | null
}

/**
 * A second reading laid over the scene, 0..1 per mark: a bronze ring around
 * a node whose reach and intensity follow the value, and an edge whose hue
 * leans towards the accent by its value. The words layer feeds it a party's
 * share of a debate; the engine only knows intensities.
 */
export type WordsOverlay = {
  /** Node id -> intensity. */
  rings: Map<string, number>
  /** `${source}|${target}` -> intensity. */
  edgeTint: Map<string, number>
}

type Fade = { current: number; target: number }

type HaloVisual = {
  mesh: THREE.Mesh
  material: THREE.MeshBasicMaterial
  /** 0..1 presence - eases in and out like every other mark. */
  presence: Fade
  /** The value itself, eased so a re-targeted ring glides rather than snaps. */
  value: Fade
}

type NodeVisual = {
  node: MapNode
  sim: SimNode3D
  r: number
  slot: number
  /** The mark's resolved hue: the node's own override, or its cluster slot. */
  colour: THREE.Color
  hollow: boolean
  unlinked: boolean
  mesh: THREE.Mesh
  material: THREE.MeshStandardMaterial
  /** Outline shell: the hollow ring for reused hues, the halo on hover. */
  shell: THREE.Mesh
  shellMaterial: THREE.MeshBasicMaterial
  opacity: Fade
  shellOpacity: Fade
  scale: Fade
  /** 0..1 - how far the node has come forward towards the camera on hover. */
  lift: Fade
  /** Edges on the node, for the hover card (a donor's parties, a party's donors). */
  degree: number
  /** Entrance stagger - the tick count before this node grows in. */
  bornAt: number
  label: HTMLDivElement
}

type EdgeVisual = {
  edge: MapEdge
  key: string
  from: NodeVisual
  to: NodeVisual
  mesh: THREE.Mesh
  material: THREE.MeshBasicMaterial
  cone: THREE.Mesh
  coneMaterial: THREE.MeshBasicMaterial
  width: number
  crossing: boolean
  /** Parallel relations between one pair fan sideways by this much. */
  lateral: number
  opacity: Fade
  emphasised: boolean
  label: HTMLDivElement | null
}

type TerritoryVisual = {
  group: string
  style: GroupStyle
  mesh: THREE.Mesh
  material: THREE.MeshBasicMaterial
  caption: HTMLDivElement
  centre: THREE.Vector3
  r: number
}

type View = {
  target: THREE.Vector3
  theta: number
  phi: number
  dist: number
}

type ViewTween = {
  from: View
  to: View
  started: number
  duration: number
}

type DragState = {
  id: string
  plane: THREE.Plane
  moved: boolean
  lastX: number
  lastY: number
  /** Cumulative pointer travel - a press only becomes a drag past a threshold. */
  travel: number
}

type OrbitState = {
  mode: 'orbit' | 'pan'
  lastX: number
  lastY: number
  moved: number
}

type PinchState = {
  a: number
  b: number
  gap: number
  dist: number
  midX: number
  midY: number
}

/** Edge weight -> tube radius, log scaled like the 2D stroke width. */
function edgeRadius(weight: number): number {
  return Math.max(0.6, Math.min(5, 0.55 + 1.2 * Math.log10(1 + Math.max(0, weight))))
}

/** How far each edge in a parallel bundle bows sideways - ported from buildCurves. */
function buildLaterals(edges: MapEdge[]): number[] {
  const seen = new Map<string, number[]>()
  edges.forEach((edge, i) => {
    const key = edge.source < edge.target
      ? `${edge.source} ${edge.target}`
      : `${edge.target} ${edge.source}`
    const list = seen.get(key)
    if (list) list.push(i)
    else seen.set(key, [i])
  })
  const laterals = new Array<number>(edges.length).fill(0)
  for (const list of seen.values()) {
    if (list.length === 1) continue
    list.forEach((edgeIndex, j) => {
      laterals[edgeIndex] = -1 + (2 * j) / (list.length - 1)
    })
  }
  return laterals
}

export function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

/**
 * The static palette, in the module's cluster order - slot i is the i-th
 * cluster. The source engine resolved these from tenant CSS tokens at
 * runtime; the money map's palette is fixed, so this is built once.
 */
function buildPalette(): Palette3D {
  const cats: THREE.Color[] = []
  const inks: string[] = []
  for (const style of CLUSTER_COLOURS.values()) {
    cats.push(new THREE.Color(style.colour))
    inks.push(style.ink)
  }
  return {
    cats,
    inks,
    surface: new THREE.Color(SURFACE),
    accent: new THREE.Color(ACCENT),
  }
}

// ---------------------------------------------------------------------------
// The engine.
// ---------------------------------------------------------------------------

export class KnowledgeMapEngine {
  private canvas: HTMLCanvasElement
  private labelLayer: HTMLDivElement
  private onSelect: (id: string | null) => void
  /** Optional: a click that hits no node but lands on an edge reports it here. */
  onEdgePick: ((edge: MapEdge | null) => void) | null = null

  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private nodeGroup = new THREE.Group()
  private edgeGroup = new THREE.Group()
  private territoryGroup = new THREE.Group()
  private hemi: THREE.HemisphereLight
  private key: THREE.DirectionalLight
  private fill: THREE.DirectionalLight
  private fog: THREE.Fog

  private sphereGeo = new THREE.SphereGeometry(1, 40, 24)
  private shellGeo = new THREE.SphereGeometry(1, 32, 18)
  private tubeGeo = new THREE.CylinderGeometry(1, 1, 1, 7, 1, true)
  private coneGeo = new THREE.ConeGeometry(1, 1, 10)
  private ringGeo = new THREE.RingGeometry(1.18, 1.32, 48)
  private territoryGeo = new THREE.SphereGeometry(1, 28, 18)
  /** Thinner than the selection ring: an engraved line, not a badge. */
  private haloGeo = new THREE.RingGeometry(1, 1.045, 64)
  private haloGroup = new THREE.Group()
  private halos = new Map<string, HaloVisual>()
  private overlay: WordsOverlay | null = null

  private selectionRing: THREE.Mesh
  private selectionRingMaterial: THREE.MeshBasicMaterial
  private traceRing: THREE.Mesh
  private traceRingMaterial: THREE.MeshBasicMaterial

  private palette: Palette3D
  private popup: HTMLDivElement
  private popupName: HTMLDivElement
  private popupMeta: HTMLDivElement
  private popupCounts: HTMLDivElement
  private placedLabelBoxes: { x1: number; y1: number; x2: number; y2: number }[] = []

  private data: EngineData | null = null
  private sim: ForceSim3D | null = null
  private centres: Map<string, Centre3D> = new Map()
  private nodeVisuals = new Map<string, NodeVisual>()
  private edgeVisuals: EdgeVisual[] = []
  private territories: TerritoryVisual[] = []
  private paintRank: NodeVisual[] = []
  private worldCentre = new THREE.Vector3()
  private worldRadius = 320

  private emphasis: EngineEmphasis = { selectedId: null, pathEdges: null, pathFrom: null }
  private hoveredId: string | null = null
  private neighbourIds: Set<string> | null = null
  private pathNodeIds: Set<string> | null = null
  private pathEdgeKeys: Set<string> | null = null

  private insets: Insets = { left: 0, right: 0, bottom: 0 }

  private view: View
  private distGoal: number
  private tween: ViewTween | null = null
  private idleSpin: boolean
  private reduced: boolean
  private reducedQuery: MediaQueryList | null = null
  private onContextLost: ((event: Event) => void) | null = null

  private onReducedChange = (event: MediaQueryListEvent) => {
    this.reduced = event.matches
    if (event.matches) this.idleSpin = false
  }
  private viewOwnedFlag = false
  private focusOwnedFlag = false
  private fitDist = 420

  private pointers = new Map<number, { x: number; y: number }>()
  private orbit: OrbitState | null = null
  private pinch: PinchState | null = null
  private drag: DragState | null = null
  private gestured = false
  private hoverPos: { x: number; y: number } | null = null
  private hoverDirty = false

  private raycaster = new THREE.Raycaster()
  private frameHandle: number | null = null
  private lastFrame = performance.now()
  private frameCount = 0
  private renderDirty = true
  private paused = false
  private resizeObserver: ResizeObserver
  private disposed = false
  private width = 1
  private height = 1

  constructor(
    canvas: HTMLCanvasElement,
    labelLayer: HTMLDivElement,
    onSelect: (id: string | null) => void,
    onContextLost?: () => void,
  ) {
    this.canvas = canvas
    this.labelLayer = labelLayer
    this.onSelect = onSelect
    // A lost context would otherwise freeze the canvas with no way back;
    // the shell swaps in the 2D map instead.
    if (onContextLost) {
      this.onContextLost = (event: Event) => {
        event.preventDefault()
        onContextLost()
      }
      canvas.addEventListener('webglcontextlost', this.onContextLost)
    }
    // Live, not a snapshot: a reader who turns reduced motion on mid-session
    // gets it honoured immediately, not at the next remount.
    this.reducedQuery = typeof globalThis.matchMedia === 'function'
      ? globalThis.matchMedia('(prefers-reduced-motion: reduce)')
      : null
    this.reduced = this.reducedQuery?.matches ?? false
    this.idleSpin = !this.reduced
    this.reducedQuery?.addEventListener('change', this.onReducedChange)

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2))

    // The hover card - one pooled element, filled per node. DOM in the label
    // layer idiom: inert to the pointer, styled by the adapter's stylesheet.
    this.popup = document.createElement('div')
    this.popup.className = 'rp-map3d-popup'
    this.popup.style.display = 'none'
    this.popupName = document.createElement('div')
    this.popupName.className = 'rp-map3d-popup-name'
    this.popupMeta = document.createElement('div')
    this.popupMeta.className = 'rp-map3d-popup-meta'
    this.popupCounts = document.createElement('div')
    this.popupCounts.className = 'rp-map3d-popup-counts'
    const popupHint = document.createElement('div')
    popupHint.className = 'rp-map3d-popup-hint'
    popupHint.textContent = 'Click for details'
    this.popup.append(this.popupName, this.popupMeta, this.popupCounts, popupHint)
    labelLayer.appendChild(this.popup)

    this.palette = buildPalette()

    this.camera = new THREE.PerspectiveCamera(FOV, 1.5, 2, 9000)
    this.fog = new THREE.Fog(this.palette.surface.clone(), 600, 2400)
    this.scene.fog = this.fog
    this.scene.add(this.territoryGroup)
    this.scene.add(this.edgeGroup)
    this.scene.add(this.nodeGroup)
    this.scene.add(this.haloGroup)

    // Light-mode-first lighting: a bright hemisphere for the airy paper feel
    // and a soft key so the spheres read as satin objects, not flat dots. All
    // three derive from the surface token, so dark palettes relight themselves.
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 0.95)
    this.key = new THREE.DirectionalLight(0xffffff, 1.15)
    this.key.position.set(0.55, 1, 0.4)
    this.fill = new THREE.DirectionalLight(0xffffff, 0.3)
    this.fill.position.set(-0.6, -0.35, -0.7)
    this.scene.add(this.hemi, this.key, this.fill)

    this.selectionRingMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    this.selectionRing = new THREE.Mesh(this.ringGeo, this.selectionRingMaterial)
    this.selectionRing.visible = false
    this.scene.add(this.selectionRing)
    this.traceRingMaterial = this.selectionRingMaterial.clone()
    this.traceRing = new THREE.Mesh(this.ringGeo, this.traceRingMaterial)
    this.traceRing.visible = false
    this.scene.add(this.traceRing)

    this.applyPaletteToScene()

    // Start from a raised three-quarter view: high enough that the cluster
    // ring reads as a ring rather than clusters stacked behind one another,
    // low enough that depth still shows.
    this.view = {
      target: new THREE.Vector3(),
      theta: -0.5,
      phi: 0.95,
      dist: 640,
    }
    this.distGoal = this.view.dist

    this.resizeObserver = new ResizeObserver(() => this.handleResize())
    this.resizeObserver.observe(canvas.parentElement ?? canvas)
    this.handleResize()

    this.bindPointerHandlers()
    this.frameHandle = requestAnimationFrame(this.frame)
  }

  // -------------------------------------------------------------------
  // Palette.
  // -------------------------------------------------------------------

  private applyPaletteToScene() {
    const surface = this.palette.surface
    this.renderer.setClearColor(surface, 1)
    this.fog.color.copy(surface)
    // Sky drifts towards white above the surface, ground sits below it, so
    // the shading direction survives both light and dark palettes.
    this.hemi.color.copy(surface.clone().lerp(new THREE.Color(0xffffff), 0.72))
    this.hemi.groundColor.copy(surface.clone().multiplyScalar(0.55))
    this.selectionRingMaterial.color.copy(this.palette.accent)
    this.traceRingMaterial.color.copy(this.palette.accent)
  }

  private catColour(slot: number): THREE.Color {
    return this.palette.cats[slot] ?? this.palette.accent
  }

  private applyNodeColour(visual: NodeVisual) {
    const cat = visual.colour
    if (visual.hollow) {
      visual.material.color.copy(this.palette.surface)
      visual.material.emissive.set(0x000000)
      visual.shellMaterial.color.copy(cat)
    } else {
      visual.material.color.copy(cat)
      // A whisper of self-illumination keeps the hue saturated inside the
      // shadowed half of the sphere, which is where flat dots go muddy.
      visual.material.emissive.copy(cat).multiplyScalar(0.16)
      visual.shellMaterial.color.copy(cat)
    }
  }

  private applyEdgeColour(visual: EdgeVisual) {
    const onPath = this.pathEdgeKeys?.has(visual.key) ?? false
    const focus = this.emphasis.selectedId ?? this.hoveredId
    const touchesFocus = focus !== null &&
      (visual.edge.source === focus || visual.edge.target === focus)
    if (onPath) {
      visual.material.color.copy(this.palette.accent)
      visual.coneMaterial.color.copy(this.palette.accent)
      return
    }
    if (touchesFocus) {
      const focusVisual = focus ? this.nodeVisuals.get(focus) : undefined
      const colour = focusVisual ? focusVisual.colour : this.palette.accent
      visual.material.color.copy(colour)
      visual.coneMaterial.color.copy(colour)
    } else {
      const colour = visual.from.colour
      visual.material.color.copy(colour)
      visual.coneMaterial.color.copy(colour)
    }
    const tint = this.edgeTintOf(visual)
    if (tint > 0) {
      visual.material.color.lerp(this.palette.accent, tint)
      visual.coneMaterial.color.lerp(this.palette.accent, tint)
    }
  }

  private edgeTintOf(visual: EdgeVisual): number {
    const tint = this.overlay?.edgeTint.get(`${visual.edge.source}|${visual.edge.target}`) ?? 0
    return Math.max(0, Math.min(1, tint))
  }

  // -------------------------------------------------------------------
  // The words overlay - halos and edge tint.
  // -------------------------------------------------------------------

  /**
   * Lay the words reading over the scene, or clear it with null. Rings ease
   * in and out (instantly under reduced motion) and survive a data rebuild;
   * a ring for a node the scene does not hold simply waits for it.
   */
  setWordsOverlay(overlay: WordsOverlay | null) {
    this.overlay = overlay
    this.syncHalos()
    this.updateEmphasisSets()
  }

  private syncHalos() {
    const rings = this.overlay?.rings
    for (const [id, halo] of this.halos) {
      const value = rings?.get(id) ?? 0
      halo.presence.target = value > 0 ? 1 : 0
      if (value > 0) halo.value.target = value
    }
    if (!rings) return
    for (const [id, value] of rings) {
      if (value <= 0 || this.halos.has(id) || !this.nodeVisuals.has(id)) continue
      const material = new THREE.MeshBasicMaterial({
        color: this.palette.accent,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
      const mesh = new THREE.Mesh(this.haloGeo, material)
      mesh.raycast = () => undefined
      mesh.visible = false
      this.haloGroup.add(mesh)
      this.halos.set(id, {
        mesh,
        material,
        presence: { current: 0, target: 1 },
        value: { current: value, target: value },
      })
    }
  }

  private clearHalos() {
    for (const halo of this.halos.values()) halo.material.dispose()
    this.haloGroup.clear()
    this.halos.clear()
  }

  // -------------------------------------------------------------------
  // Data - build the simulation and the scene.
  // -------------------------------------------------------------------

  setData(data: EngineData) {
    this.data = data
    const previous = new Map<string, { x: number; y: number; z: number }>()
    for (const [id, visual] of this.nodeVisuals) {
      previous.set(id, { x: visual.sim.x, y: visual.sim.y, z: visual.sim.z })
    }
    const firstBuild = this.nodeVisuals.size === 0

    const counts = new Map<string, number>()
    for (const node of data.nodes) counts.set(node.group, (counts.get(node.group) ?? 0) + 1)
    const ordered = new Map(
      [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    )
    const centres: Map<string, Centre3D> = clusterCentres3D(
      ordered,
      data.aspect,
      data.centralGroup,
    )
    this.centres = centres
    // The landing angle is chosen, not fixed: looking straight down the ring
    // stacks one cluster behind another, so before the first fit the camera
    // walks the circle and keeps the azimuth that spreads the cluster
    // centres furthest apart on screen. A reader who has taken the view
    // keeps it.
    if (!this.viewOwnedFlag && centres.size > 2) {
      this.view.theta = this.bestTheta(centres)
    }

    const radiusOf = (node: MapNode) =>
      radiusFor(
        data.measure,
        data.measure === 'links' ? (data.degrees.get(node.id) ?? 0) : node.weight,
      )

    this.sim = new ForceSim3D({
      nodes: data.nodes.map((node) => {
        const kept = previous.get(node.id)
        return {
          id: node.id,
          group: node.group,
          radius: radiusOf(node),
          ...(kept ? { x: kept.x, y: kept.y, z: kept.z } : {}),
        }
      }),
      links: data.edges.map((edge) => ({ source: edge.source, target: edge.target })),
      layout: data.layout,
      centres,
    })
    // Settle synchronously, like the 2D map - instant, and immune to
    // background-tab rAF throttling. Live physics then only animates drags.
    this.sim.tick(300)

    this.clearScene()

    data.nodes.forEach((node, index) => {
      const sim = this.sim?.byId(node.id)
      if (!sim) return
      const style = data.groupStyles.get(node.group)
      const slot = style?.slot ?? 0
      const hollow = style?.hollow ?? false
      const degree = data.degrees.get(node.id) ?? 0
      const unlinked = data.measure === 'links' && degree === 0
      const r = radiusOf(node)

      const material = new THREE.MeshStandardMaterial({
        roughness: 0.42,
        metalness: 0.04,
        transparent: true,
        opacity: 1,
      })
      const mesh = new THREE.Mesh(this.sphereGeo, material)
      mesh.userData.nodeId = node.id
      const shellMaterial = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: hollow ? 0.95 : 0,
        side: THREE.BackSide,
        depthWrite: false,
      })
      const shell = new THREE.Mesh(this.shellGeo, shellMaterial)
      shell.raycast = () => undefined
      mesh.add(shell)
      shell.scale.setScalar(hollow ? 1.22 : 1.14)
      this.nodeGroup.add(mesh)

      const label = document.createElement('div')
      label.className = 'rp-map3d-label'
      label.textContent = shortLabel(node.label)
      label.style.display = 'none'
      this.labelLayer.appendChild(label)

      const visual: NodeVisual = {
        node,
        sim,
        r: unlinked ? Math.max(3.5, r - 1.5) : r,
        slot,
        colour: node.colour ? new THREE.Color(node.colour) : this.catColour(slot).clone(),
        hollow,
        unlinked,
        mesh,
        material,
        shell,
        shellMaterial,
        opacity: { current: 1, target: 1 },
        shellOpacity: { current: hollow ? 0.95 : 0, target: hollow ? 0.95 : 0 },
        scale: {
          current: firstBuild && !this.reduced ? 0.001 : 1,
          target: 1,
        },
        lift: { current: 0, target: 0 },
        degree,
        bornAt: firstBuild && !this.reduced ? performance.now() + Math.min(index * 9, 900) : 0,
        label,
      }
      this.applyNodeColour(visual)
      this.nodeVisuals.set(node.id, visual)
    })

    const laterals = buildLaterals(data.edges)
    this.edgeVisuals = []
    data.edges.forEach((edge, index) => {
      const from = this.nodeVisuals.get(edge.source)
      const to = this.nodeVisuals.get(edge.target)
      if (!from || !to) return
      const material = new THREE.MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
      })
      const mesh = new THREE.Mesh(this.tubeGeo, material)
      mesh.raycast = () => undefined
      const coneMaterial = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })
      const cone = new THREE.Mesh(this.coneGeo, coneMaterial)
      cone.raycast = () => undefined
      cone.visible = false
      this.edgeGroup.add(mesh, cone)
      const crossing = from.node.group !== to.node.group
      const visual: EdgeVisual = {
        edge,
        key: `${edge.source}|${edge.label}|${edge.target}`,
        from,
        to,
        mesh,
        material,
        cone,
        coneMaterial,
        width: edgeRadius(edge.weight),
        crossing,
        lateral: laterals[index] ?? 0,
        opacity: { current: 0, target: crossing ? 0.16 : 0.4 },
        emphasised: false,
        label: null,
      }
      this.applyEdgeColour(visual)
      this.edgeVisuals.push(visual)
    })

    // Territories only exist in the grouped layout, and only when there is
    // more than one category to tell apart.
    this.territories = []
    if (data.layout === 'grouped' && ordered.size > 1) {
      for (const [group] of ordered) {
        const style = data.groupStyles.get(group)
        if (!style) continue
        const material = new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: 0.055,
          depthWrite: false,
        })
        const cat = this.palette.cats[style.slot]
        if (cat) material.color.copy(cat)
        const mesh = new THREE.Mesh(this.territoryGeo, material)
        mesh.raycast = () => undefined
        mesh.renderOrder = -2
        this.territoryGroup.add(mesh)
        const caption = document.createElement('div')
        caption.className = 'rp-map3d-territory'
        caption.style.color = this.palette.inks[style.slot] ?? '#5A616B'
        caption.textContent = `${group.toUpperCase()} · ${counts.get(group) ?? 0}`
        caption.style.display = 'none'
        this.labelLayer.appendChild(caption)
        this.territories.push({
          group,
          style,
          mesh,
          material,
          caption,
          centre: new THREE.Vector3(),
          r: 0,
        })
      }
    }

    this.paintRank = [...this.nodeVisuals.values()].sort((a, b) => b.r - a.r)
    this.updateWorldBounds()
    // Seed the territory volumes now rather than waiting for the first
    // rendered frame - captions must never paint at a stale origin.
    this.updateTerritories()
    this.syncHalos()
    this.updateEmphasisSets()
    this.renderDirty = true
  }

  private clearScene() {
    this.clearHalos()
    for (const visual of this.nodeVisuals.values()) {
      visual.material.dispose()
      visual.shellMaterial.dispose()
      visual.label.remove()
    }
    for (const visual of this.edgeVisuals) {
      visual.material.dispose()
      visual.coneMaterial.dispose()
      visual.label?.remove()
    }
    for (const territory of this.territories) {
      territory.material.dispose()
      territory.caption.remove()
    }
    this.nodeGroup.clear()
    this.edgeGroup.clear()
    this.territoryGroup.clear()
    this.nodeVisuals.clear()
    this.edgeVisuals = []
    this.territories = []
  }

  private updateWorldBounds() {
    const centre = new THREE.Vector3()
    let count = 0
    for (const visual of this.nodeVisuals.values()) {
      centre.x += visual.sim.x
      centre.y += visual.sim.y
      centre.z += visual.sim.z
      count += 1
    }
    if (count === 0) return
    centre.multiplyScalar(1 / count)
    let radius = 120
    for (const visual of this.nodeVisuals.values()) {
      const d = Math.hypot(
        visual.sim.x - centre.x,
        visual.sim.y - centre.y,
        visual.sim.z - centre.z,
      ) + visual.r
      if (d > radius) radius = d
    }
    this.worldCentre.copy(centre)
    this.worldRadius = radius
  }

  // -------------------------------------------------------------------
  // Emphasis - selection, hover, path.
  // -------------------------------------------------------------------

  setEmphasis(emphasis: EngineEmphasis) {
    this.emphasis = emphasis
    this.updateEmphasisSets()
  }

  private setHovered(id: string | null) {
    if (this.hoveredId === id) return
    this.hoveredId = id
    this.updatePopup()
    this.canvas.style.cursor = id ? 'pointer' : 'grab'
    this.updateEmphasisSets()
  }

  private updateEmphasisSets() {
    const { selectedId, pathEdges, pathFrom } = this.emphasis
    const focus = selectedId ?? this.hoveredId
    if (focus) {
      const ids = new Set<string>([focus])
      for (const visual of this.edgeVisuals) {
        if (visual.edge.source === focus) ids.add(visual.edge.target)
        if (visual.edge.target === focus) ids.add(visual.edge.source)
      }
      this.neighbourIds = ids
    } else {
      this.neighbourIds = null
    }
    if (pathEdges) {
      const ids = new Set<string>()
      for (const edge of pathEdges) {
        ids.add(edge.source)
        ids.add(edge.target)
      }
      this.pathNodeIds = ids
      this.pathEdgeKeys = new Set(pathEdges.map((e) => `${e.source}|${e.label}|${e.target}`))
    } else {
      this.pathNodeIds = null
      this.pathEdgeKeys = null
    }

    for (const visual of this.nodeVisuals.values()) {
      const id = visual.node.id
      const isSelected = id === selectedId
      const isHovered = id === this.hoveredId
      const isPathStart = id === pathFrom
      const inNeighbourhood = this.neighbourIds?.has(id) ?? true
      const onPath = this.pathNodeIds?.has(id) ?? false
      const dimmed = (this.pathNodeIds && !onPath) || (!this.pathNodeIds && !inNeighbourhood)
      const emphasised = isSelected || isHovered || isPathStart || onPath
      // Dimmed marks recede but stay clearly there - they still carry the
      // shape of the map, and the depth fog is already quietening the far
      // side, so a hard fade here would wash the back of the scene out.
      visual.opacity.target = dimmed ? 0.3 : visual.unlinked && !emphasised ? 0.6 : 1
      visual.shellOpacity.target = visual.hollow
        ? (dimmed ? 0.2 : 0.95)
        : isHovered && !isSelected
        ? 0.4
        : 0
      // The hovered node comes forward decisively; the selected one holds a
      // quieter, steadier presence under its ring.
      visual.scale.target = isHovered && !isSelected
        ? 1.24
        : isSelected
        ? 1.14
        : emphasised
        ? 1.08
        : 1
      visual.lift.target = isHovered && !isSelected ? 1 : 0
    }

    for (const visual of this.edgeVisuals) {
      const onPath = this.pathEdgeKeys?.has(visual.key) ?? false
      const touchesFocus = focus !== null &&
        (visual.edge.source === focus || visual.edge.target === focus)
      const dimmed = (this.pathEdgeKeys && !onPath) ||
        (focus !== null && !touchesFocus && !this.pathEdgeKeys)
      const emphasised = onPath || touchesFocus
      visual.emphasised = emphasised
      // A tinted edge that nothing else is quietening comes forward with its
      // value, so the bronze reads even on the faint cross-cluster flows.
      const resting = Math.max(visual.crossing ? 0.16 : 0.4, 0.16 + 0.6 * this.edgeTintOf(visual))
      visual.opacity.target = dimmed ? 0.06 : emphasised ? 0.92 : resting
      this.applyEdgeColour(visual)
    }
    this.updatePopup()
    this.renderDirty = true
  }

  /**
   * Fill and show the hover card for the hovered node, or hide it. The card
   * is for scouting - the info card already tells the selected node's story,
   * so a hovered node that is also selected shows nothing.
   */
  private updatePopup() {
    const visual = this.hoveredId ? this.nodeVisuals.get(this.hoveredId) : undefined
    if (!visual || visual.node.id === this.emphasis.selectedId) {
      this.popup.style.display = 'none'
      return
    }
    const node = visual.node
    this.popupName.textContent = node.label
    this.popupMeta.replaceChildren()
    const dot = document.createElement('span')
    dot.className = 'rp-map3d-popup-dot'
    dot.style.background = `#${visual.colour.getHexString()}`
    const category = document.createElement('span')
    category.textContent = node.kind === 'party'
      ? 'political party'
      : (node.industry ?? node.group).replace(/_/g, ' ')
    category.style.color = this.palette.inks[visual.slot] ?? '#5A616B'
    this.popupMeta.append(dot, category)
    const links = visual.degree === 1 ? '1' : `${visual.degree}`
    const who = node.kind === 'party'
      ? (visual.degree === 1 ? '1 donor shown' : `${links} donors shown`)
      : (visual.degree === 1 ? '1 party' : `${links} parties`)
    this.popupCounts.textContent = node.total !== undefined
      ? `${formatMoney(node.total)} · ${who}`
      : who
    // Kept as the layer's last child so it rides above every label.
    this.labelLayer.appendChild(this.popup)
    this.popup.style.display = 'block'
    this.positionPopup()
  }

  /** Pin the card beside the hovered node, flipped inside the canvas edges. */
  private positionPopup() {
    if (this.popup.style.display === 'none') return
    const visual = this.hoveredId ? this.nodeVisuals.get(this.hoveredId) : undefined
    if (!visual) {
      this.popup.style.display = 'none'
      return
    }
    this.labelVec.set(visual.sim.x, visual.sim.y, visual.sim.z).project(this.camera)
    if (this.labelVec.z > 1 || this.labelVec.z < -1) {
      this.popup.style.display = 'none'
      return
    }
    const sx = (this.labelVec.x * 0.5 + 0.5) * this.width
    const sy = (-this.labelVec.y * 0.5 + 0.5) * this.height
    const camDist = Math.hypot(
      visual.sim.x - this.camera.position.x,
      visual.sim.y - this.camera.position.y,
      visual.sim.z - this.camera.position.z,
    )
    const halfTan = Math.tan(THREE.MathUtils.degToRad(FOV / 2))
    const screenR = ((visual.r * visual.scale.current * (this.height / 2)) /
      (camDist * halfTan)) * (1 + visual.lift.current * 0.15)
    const w = this.popup.offsetWidth
    const h = this.popup.offsetHeight
    let x = sx + screenR + 16
    if (x + w > this.width - 8) x = sx - screenR - 16 - w
    const y = Math.max(8, Math.min(this.height - h - 8, sy - h / 2))
    this.popup.style.transform = `translate(${Math.max(8, x).toFixed(1)}px, ${y.toFixed(1)}px)`
  }

  // -------------------------------------------------------------------
  // View - fit, focus, zoom, insets.
  // -------------------------------------------------------------------

  setInsets(insets: Insets) {
    this.insets = insets
  }

  get viewOwned(): boolean {
    return this.viewOwnedFlag
  }

  /**
   * True while the view is the one a focus move put there and the reader has
   * not touched it since - what lets the map give the space back when the
   * panel that caused the move goes away, without overriding a reader who
   * has moved on.
   */
  get focusOwned(): boolean {
    return this.focusOwnedFlag
  }

  private claimView() {
    this.tween = null
    this.viewOwnedFlag = true
    this.focusOwnedFlag = false
    this.idleSpin = false
  }

  /** The part of the canvas the floating panels leave free, in pixels. */
  private freeBox() {
    const w = Math.max(1, this.width - this.insets.left - this.insets.right)
    const h = Math.max(1, this.height - this.insets.bottom)
    return {
      w,
      h,
      cx: this.insets.left + w / 2,
      cy: h / 2,
    }
  }

  /**
   * The camera distance at which a sphere of the given radius fits the free
   * box, and the world-space offset that shifts the camera target so the
   * subject lands in the box's centre rather than the canvas's.
   */
  private frameFor(radius: number) {
    const box = this.freeBox()
    const vHalf = THREE.MathUtils.degToRad(FOV / 2)
    const heightShare = Math.max(0.2, box.h / this.height)
    const widthShare = Math.max(0.2, box.w / this.width)
    const vLimit = Math.atan(Math.tan(vHalf) * heightShare * 0.9)
    const hLimit = Math.atan(Math.tan(vHalf) * this.camera.aspect * widthShare * 0.9)
    const dist = radius / Math.tan(Math.min(vLimit, hLimit))
    return { box, dist }
  }

  /** World units per screen pixel at the given camera distance. */
  private worldPerPixel(dist: number): number {
    return (2 * dist * Math.tan(THREE.MathUtils.degToRad(FOV / 2))) / this.height
  }

  /** Shift a target so `point` projects at the free box's centre. */
  private offsetTarget(point: THREE.Vector3, dist: number): THREE.Vector3 {
    const box = this.freeBox()
    const wpp = this.worldPerPixel(dist)
    const ox = box.cx - this.width / 2
    const oy = box.cy - this.height / 2
    const right = new THREE.Vector3()
    const up = new THREE.Vector3()
    const forward = new THREE.Vector3()
    this.camera.matrixWorld.extractBasis(right, up, forward)
    return point.clone()
      .addScaledVector(right, -ox * wpp)
      .addScaledVector(up, oy * wpp)
  }

  fit(animate = true) {
    this.tween = null
    this.viewOwnedFlag = false
    this.focusOwnedFlag = false
    if (this.nodeVisuals.size === 0) return
    this.updateWorldBounds()
    this.updateCamera()
    const dist = this.fitDistance()
    this.fitDist = dist
    const target = this.offsetTarget(this.worldCentre, dist)
    const to: View = {
      target,
      theta: this.view.theta,
      phi: this.view.phi,
      dist,
    }
    this.moveView(to, animate ? FIT_MS : 0)
  }

  /**
   * The azimuth from which the cluster ring reads best: the candidate that
   * maximises the worst pairwise on-screen separation of the territory
   * centres, each distance normalised by the pair's blob radii so a large
   * pair is allowed to sit closer than two small ones.
   */
  private bestTheta(centres: Map<string, Centre3D>): number {
    const phi = this.view.phi
    const list = [...centres.values()]
    let best = this.view.theta
    let bestScore = -Infinity
    for (let step = 0; step < 36; step++) {
      const theta = (step / 36) * Math.PI * 2
      // Screen-plane basis at this azimuth: right in the ground plane, up
      // tilted by the elevation.
      const rx = Math.cos(theta)
      const rz = -Math.sin(theta)
      const upScale = Math.cos(phi)
      let score = Infinity
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i]
          const b = list[j]
          if (!a || !b) continue
          const dx = (a.x - b.x) * rx + (a.z - b.z) * rz
          const du = (a.y - b.y) * Math.sin(phi) -
            ((a.x - b.x) * -rz + (a.z - b.z) * rx) * upScale
          const separation = Math.hypot(dx, du) / (a.r + b.r)
          if (separation < score) score = separation
        }
      }
      if (score > bestScore) {
        bestScore = score
        best = theta
      }
    }
    return best
  }

  /**
   * The distance at which every node fits the free box at the CURRENT
   * orientation. A 3D bounding sphere is rotation-proof but wasteful: seen
   * from the map's natural elevation the cluster ring is far wider than it
   * is deep on screen, and a sphere fit strands half the canvas. Each node
   * instead constrains the camera along its own line of sight -
   * dist >= lateral / tan(halfAngle) + depth.
   */
  private fitDistance(): number {
    const { theta, phi } = this.view
    // The basis the view will have, from the same spherical coordinates
    // updateCamera uses; e points from the target towards the camera.
    const e = new THREE.Vector3(
      Math.sin(phi) * Math.sin(theta),
      Math.cos(phi),
      Math.sin(phi) * Math.cos(theta),
    )
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), e)
    if (right.lengthSq() < 0.001) right.set(1, 0, 0)
    right.normalize()
    const up = new THREE.Vector3().crossVectors(e, right)
    const box = this.freeBox()
    const vHalf = THREE.MathUtils.degToRad(FOV / 2)
    const hLimit = Math.atan(
      Math.tan(vHalf) * this.camera.aspect * Math.max(0.2, box.w / this.width) * 0.92,
    )
    const vLimit = Math.atan(Math.tan(vHalf) * Math.max(0.2, box.h / this.height) * 0.92)
    const d = new THREE.Vector3()
    let dist = 240
    for (const visual of this.nodeVisuals.values()) {
      d.set(visual.sim.x, visual.sim.y, visual.sim.z).sub(this.worldCentre)
      const depth = d.dot(e)
      const lx = Math.abs(d.dot(right)) + visual.r
      // Headroom for the labels and territory captions above the marks.
      const ly = Math.abs(d.dot(up)) + visual.r + 26
      dist = Math.max(dist, lx / Math.tan(hLimit) + depth, ly / Math.tan(vLimit) + depth)
    }
    return dist
  }

  /**
   * Move the view so a node sits in the middle of the space the panels leave
   * free, close enough that its neighbourhood reads. Returns the distance it
   * settled on (for the follow-up pass when a panel finishes measuring), or
   * null when the node is already comfortably in view - moving the map under
   * someone who can see what they clicked is worse than doing nothing.
   */
  focusOn(id: string, keepDist: number | null): number | null {
    const visual = this.nodeVisuals.get(id)
    if (!visual) return null
    this.updateCamera()
    const point = new THREE.Vector3(visual.sim.x, visual.sim.y, visual.sim.z)
    const box = this.freeBox()

    const projected = point.clone().project(this.camera)
    const sx = (projected.x * 0.5 + 0.5) * this.width
    const sy = (-projected.y * 0.5 + 0.5) * this.height
    const marginX = Math.min(90, box.w * 0.18)
    const marginY = Math.min(90, box.h * 0.18)
    const settled = projected.z < 1 &&
      sx > this.insets.left + marginX && sx < this.insets.left + box.w - marginX &&
      sy > marginY && sy < box.h - marginY
    if (settled && this.insets.bottom <= 0) return null

    let dist = keepDist
    if (dist === null) {
      let span = visual.r + 30
      let neighbours = 0
      for (const edgeVisual of this.edgeVisuals) {
        const otherId = edgeVisual.edge.source === id
          ? edgeVisual.edge.target
          : edgeVisual.edge.target === id
          ? edgeVisual.edge.source
          : null
        if (otherId === null) continue
        const other = this.nodeVisuals.get(otherId)
        if (!other) continue
        neighbours++
        const d = Math.hypot(
          other.sim.x - visual.sim.x,
          other.sim.y - visual.sim.y,
          other.sim.z - visual.sim.z,
        ) + other.r
        if (d > span) span = d
      }
      const { dist: fits } = this.frameFor(span * 1.12)
      // Hubs (a major party with hundreds of flows) need the whole
      // neighbourhood in frame: lift the ceiling with the log of the degree
      // and allow zooming OUT for them. The never-zoom-out rule (mirroring
      // the 2D map) only guards nodes with a handful of neighbours.
      const hub = neighbours >= 40
      const ceiling = hub ? FOCUS_MAX_DIST * (1 + Math.log10(neighbours / 20)) : FOCUS_MAX_DIST
      const fitted = Math.max(FOCUS_MIN_DIST, Math.min(ceiling, fits))
      dist = hub ? fitted : Math.min(this.view.dist, fitted)
    }
    dist = Math.max(this.minDist(), Math.min(this.maxDist(), dist))

    const target = this.offsetTarget(point, dist)
    this.moveView(
      { target, theta: this.view.theta, phi: this.view.phi, dist },
      FOCUS_MS,
    )
    this.viewOwnedFlag = true
    this.focusOwnedFlag = true
    this.idleSpin = false
    return dist
  }

  /**
   * A panel came or went with nothing selected: slide the view by half the
   * change so whatever was centred stays centred, rather than snapping back.
   */
  nudgeForInsets(dxPx: number, dyPx: number) {
    if (dxPx === 0 && dyPx === 0) return
    const wpp = this.worldPerPixel(this.view.dist)
    const right = new THREE.Vector3()
    const up = new THREE.Vector3()
    const forward = new THREE.Vector3()
    this.camera.matrixWorld.extractBasis(right, up, forward)
    const target = this.view.target.clone()
      .addScaledVector(right, -dxPx * wpp)
      .addScaledVector(up, dyPx * wpp)
    this.moveView({ ...this.view, target }, FOCUS_MS)
  }

  zoomBy(factor: number) {
    this.claimView()
    this.distGoal = Math.max(this.minDist(), Math.min(this.maxDist(), this.distGoal / factor))
  }

  private minDist(): number {
    return Math.max(60, this.fitDist * MIN_DIST_FACTOR)
  }

  private maxDist(): number {
    return this.fitDist * MAX_DIST_FACTOR
  }

  private moveView(to: View, duration: number) {
    if (this.reduced || duration <= 0) {
      this.view = { ...to, target: to.target.clone() }
      this.distGoal = to.dist
      this.tween = null
      this.renderDirty = true
      return
    }
    this.tween = {
      from: { ...this.view, target: this.view.target.clone() },
      to: { ...to, target: to.target.clone() },
      started: performance.now(),
      duration,
    }
    this.distGoal = to.dist
  }

  // -------------------------------------------------------------------
  // Pointer input - orbit, pan, pinch, node drag, hover, click.
  // -------------------------------------------------------------------

  private bindPointerHandlers() {
    const canvas = this.canvas
    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerup', this.onPointerUp)
    canvas.addEventListener('pointercancel', this.onPointerUp)
    canvas.addEventListener('pointerleave', this.onPointerLeave)
    canvas.addEventListener('wheel', this.onWheel, { passive: false })
    canvas.addEventListener('contextmenu', this.onContextMenu)
    canvas.addEventListener('keydown', this.onKeyDown)
  }

  private unbindPointerHandlers() {
    const canvas = this.canvas
    canvas.removeEventListener('pointerdown', this.onPointerDown)
    canvas.removeEventListener('pointermove', this.onPointerMove)
    canvas.removeEventListener('pointerup', this.onPointerUp)
    canvas.removeEventListener('pointercancel', this.onPointerUp)
    canvas.removeEventListener('pointerleave', this.onPointerLeave)
    canvas.removeEventListener('wheel', this.onWheel)
    canvas.removeEventListener('contextmenu', this.onContextMenu)
    canvas.removeEventListener('keydown', this.onKeyDown)
  }

  private localPoint(event: PointerEvent | WheelEvent) {
    const rect = this.canvas.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  /**
   * Pointer capture can throw (NotFoundError) for a pointer the browser no
   * longer considers active - synthetic events, or a touch that ended while
   * the handler ran. Losing capture is cosmetic; aborting the handler and
   * stranding half-initialised gesture state is not, so both calls are
   * fenced.
   */
  private capturePointer(pointerId: number) {
    try {
      this.canvas.setPointerCapture?.(pointerId)
    } catch {
      // Capture is best-effort.
    }
  }

  private releasePointer(pointerId: number) {
    try {
      this.canvas.releasePointerCapture?.(pointerId)
    } catch {
      // Already released.
    }
  }

  private raycastVec = new THREE.Vector3()

  /**
   * Picking is analytic - a ray/sphere test against the SIM positions - not
   * a mesh raycast. Mesh matrixWorld is only current after a rendered frame,
   * and a tab whose rAF is throttled (backgrounded, just restored, headless)
   * has painted nothing yet: a mesh raycast there tests unit spheres at the
   * origin and every pick silently misses. The sim positions and the view
   * are always current, so this path cannot go stale. Dimmed marks stay
   * clickable, exactly as in 2D.
   */
  private raycastNode(x: number, y: number): NodeVisual | null {
    // The camera may not have been placed yet this frame (or ever, in a
    // throttled tab) - derive it from the view before casting.
    this.updateCamera()
    this.raycaster.setFromCamera(
      new THREE.Vector2((x / this.width) * 2 - 1, -(y / this.height) * 2 + 1),
      this.camera,
    )
    const origin = this.raycaster.ray.origin
    const dir = this.raycaster.ray.direction
    const toCentre = this.raycastVec
    let best: NodeVisual | null = null
    let bestAlong = Infinity
    for (const visual of this.nodeVisuals.values()) {
      toCentre.set(
        visual.sim.x - origin.x,
        visual.sim.y - origin.y,
        visual.sim.z - origin.z,
      )
      const along = toCentre.dot(dir)
      if (along < 0) continue
      // The resting radius, not the animated scale: mid-entrance nodes are
      // visually small but should be pickable at full size.
      const r = visual.r
      const missSq = toCentre.lengthSq() - along * along
      if (missSq > r * r) continue
      // Rank by where the ray ENTERS the sphere, so a small mark in front
      // beats the big one behind it - the same order a mesh raycast reports.
      const entry = along - Math.sqrt(r * r - missSq)
      if (entry < this.camera.near || entry >= bestAlong) continue
      best = visual
      bestAlong = entry
    }
    return best
  }

  private pickVecA = new THREE.Vector3()
  private pickVecB = new THREE.Vector3()

  /**
   * The edge nearest a click, tested in SCREEN space (point-to-segment
   * distance against the projected endpoints) so a thin tube is as easy to
   * hit as it is to see. Same sim-position discipline as raycastNode - no
   * dependence on rendered mesh state. Invisible edges never pick.
   */
  private pickEdge(x: number, y: number, threshold = 9): EdgeVisual | null {
    this.updateCamera()
    let best: EdgeVisual | null = null
    let bestD = threshold
    const a = this.pickVecA
    const b = this.pickVecB
    for (const visual of this.edgeVisuals) {
      // Gate on the INTENDED opacity: `current` only animates while frames
      // run, so a throttled tab would report every edge invisible (the same
      // trap raycastNode avoids by using sim positions).
      if (Math.max(visual.opacity.current, visual.opacity.target) < 0.05) continue
      a.set(visual.from.sim.x, visual.from.sim.y, visual.from.sim.z).project(this.camera)
      b.set(visual.to.sim.x, visual.to.sim.y, visual.to.sim.z).project(this.camera)
      if ((a.z > 1 && b.z > 1) || (a.z < -1 && b.z < -1)) continue
      const ax = (a.x * 0.5 + 0.5) * this.width
      const ay = (-a.y * 0.5 + 0.5) * this.height
      const bx = (b.x * 0.5 + 0.5) * this.width
      const by = (-b.y * 0.5 + 0.5) * this.height
      const dx = bx - ax
      const dy = by - ay
      const lenSq = dx * dx + dy * dy
      const t = lenSq > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lenSq)) : 0
      const d = Math.hypot(x - (ax + t * dx), y - (ay + t * dy))
      if (d < bestD) {
        bestD = d
        best = visual
      }
    }
    return best
  }

  private onPointerDown = (event: PointerEvent) => {
    const point = this.localPoint(event)
    this.pointers.set(event.pointerId, point)
    this.capturePointer(event.pointerId)

    if (this.pointers.size === 2) {
      // A second finger ends whatever one finger had started.
      this.orbit = null
      this.releaseDrag()
      const [a, b] = [...this.pointers.entries()]
      if (a && b) {
        this.claimView()
        this.pinch = {
          a: a[0],
          b: b[0],
          gap: Math.hypot(a[1].x - b[1].x, a[1].y - b[1].y),
          dist: this.view.dist,
          midX: (a[1].x + b[1].x) / 2,
          midY: (a[1].y + b[1].y) / 2,
        }
      }
      return
    }
    if (this.pointers.size > 2 || this.pinch) return
    // A press means the reader is acting, not scouting - the hover card and
    // lift depart before the gesture starts.
    this.setHovered(null)

    const hit = event.button === 0 ? this.raycastNode(point.x, point.y) : null
    if (hit && this.sim) {
      // Drag the node on a camera-facing plane through it, so the motion
      // follows the pointer exactly at any orbit angle.
      const forward = new THREE.Vector3()
      this.camera.getWorldDirection(forward)
      const origin = new THREE.Vector3(hit.sim.x, hit.sim.y, hit.sim.z)
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(forward, origin)
      this.drag = {
        id: hit.node.id,
        plane,
        moved: false,
        lastX: point.x,
        lastY: point.y,
        travel: 0,
      }
      // A drag plane fixed at pointerdown under a still-drifting camera makes
      // the held node crawl away from the pointer - the drift stops here,
      // without claiming the whole view the way a pan or zoom does.
      this.idleSpin = false
      this.sim.reheat()
      return
    }
    this.orbit = {
      mode: event.button === 2 || event.button === 1 || event.shiftKey ? 'pan' : 'orbit',
      lastX: point.x,
      lastY: point.y,
      moved: 0,
    }
    this.canvas.style.cursor = 'grabbing'
  }

  private onPointerMove = (event: PointerEvent) => {
    const point = this.localPoint(event)
    if (this.pointers.has(event.pointerId)) this.pointers.set(event.pointerId, point)

    const pinch = this.pinch
    if (pinch) {
      const a = this.pointers.get(pinch.a)
      const b = this.pointers.get(pinch.b)
      if (!a || !b) return
      const gap = Math.hypot(a.x - b.x, a.y - b.y)
      if (gap > 0 && pinch.gap > 0) {
        const next = Math.max(
          this.minDist(),
          Math.min(this.maxDist(), pinch.dist * (pinch.gap / gap)),
        )
        this.view.dist = next
        this.distGoal = next
      }
      const midX = (a.x + b.x) / 2
      const midY = (a.y + b.y) / 2
      this.panBy(midX - pinch.midX, midY - pinch.midY)
      pinch.midX = midX
      pinch.midY = midY
      this.renderDirty = true
      return
    }

    const drag = this.drag
    if (drag && this.sim) {
      // A press only becomes a drag after real travel - browsers fire
      // sub-pixel pointermoves during a plain click, and a single one must
      // not consume the selection (the same 3px threshold the orbit uses).
      drag.travel += Math.abs(point.x - drag.lastX) + Math.abs(point.y - drag.lastY)
      drag.lastX = point.x
      drag.lastY = point.y
      if (drag.travel <= 3) return
      drag.moved = true
      this.raycaster.setFromCamera(
        new THREE.Vector2((point.x / this.width) * 2 - 1, -(point.y / this.height) * 2 + 1),
        this.camera,
      )
      const hitPoint = new THREE.Vector3()
      if (this.raycaster.ray.intersectPlane(drag.plane, hitPoint)) {
        this.sim.pin(drag.id, hitPoint.x, hitPoint.y, hitPoint.z)
      }
      return
    }

    const orbit = this.orbit
    if (orbit) {
      const dx = point.x - orbit.lastX
      const dy = point.y - orbit.lastY
      orbit.moved += Math.abs(dx) + Math.abs(dy)
      orbit.lastX = point.x
      orbit.lastY = point.y
      if (orbit.moved > 3) this.claimView()
      if (orbit.mode === 'pan') this.panBy(dx, dy)
      else {
        this.view.theta -= dx * 0.005
        this.view.phi = Math.max(PHI_MIN, Math.min(PHI_MAX, this.view.phi - dy * 0.005))
      }
      this.renderDirty = true
      return
    }

    this.hoverPos = point
    this.hoverDirty = true
  }

  private panBy(dxPx: number, dyPx: number) {
    const wpp = this.worldPerPixel(this.view.dist)
    const right = new THREE.Vector3()
    const up = new THREE.Vector3()
    const forward = new THREE.Vector3()
    this.camera.matrixWorld.extractBasis(right, up, forward)
    this.view.target.addScaledVector(right, -dxPx * wpp).addScaledVector(up, dyPx * wpp)
  }

  private releaseDrag() {
    const drag = this.drag
    if (!drag) return
    this.sim?.unpin(drag.id)
    this.sim?.cool()
    // No gesture guard here: a drag's own pointerup is consumed inside the
    // drag branch, so flagging it would swallow the reader's NEXT click.
    // Only a pinch leaves a browser-synthesised click behind to guard against.
    this.drag = null
  }

  private onPointerUp = (event: PointerEvent) => {
    const point = this.localPoint(event)
    this.pointers.delete(event.pointerId)
    this.releasePointer(event.pointerId)

    if (this.pinch) {
      if (this.pointers.size < 2) {
        this.pinch = null
        this.gestured = true
      }
      return
    }

    const drag = this.drag
    if (drag) {
      const moved = drag.moved
      this.releaseDrag()
      if (!moved) {
        // A press on a node that never moved is a selection.
        this.onSelect(drag.id)
      }
      return
    }

    const orbit = this.orbit
    this.orbit = null
    this.canvas.style.cursor = 'grab'
    if (orbit && orbit.moved <= 3) {
      // The pointer went down and came back up in place: a click. The click
      // some browsers synthesise after a pinch must not clear the selection.
      if (this.gestured) {
        this.gestured = false
        return
      }
      const hit = this.raycastNode(point.x, point.y)
      if (hit) {
        this.onSelect(hit.node.id)
      } else {
        // A miss can still land on an edge - the flow between two nodes is a
        // selectable fact of its own.
        const edge = this.onEdgePick ? this.pickEdge(point.x, point.y) : null
        if (edge) this.onEdgePick?.(edge.edge)
        else this.onSelect(null)
      }
    }
    this.gestured = false
  }

  private onPointerLeave = () => {
    this.hoverPos = null
    this.setHovered(null)
  }

  private onWheel = (event: WheelEvent) => {
    event.preventDefault()
    this.claimView()
    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12
    this.distGoal = Math.max(this.minDist(), Math.min(this.maxDist(), this.distGoal / factor))
  }

  private onContextMenu = (event: Event) => {
    event.preventDefault()
  }

  /**
   * The entity closest to the middle of the free box - what Enter selects.
   * Orbiting with the arrows re-aims it, so the keyboard can reach anything
   * visible; the navigator rail and the find field cover the rest by name.
   */
  private centremostNodeId(): string | null {
    const box = this.freeBox()
    let best: string | null = null
    let bestD = Infinity
    const v = this.labelVec
    for (const visual of this.nodeVisuals.values()) {
      v.set(visual.sim.x, visual.sim.y, visual.sim.z).project(this.camera)
      if (v.z > 1 || v.z < -1) continue
      const sx = (v.x * 0.5 + 0.5) * this.width
      const sy = (-v.y * 0.5 + 0.5) * this.height
      if (sx < 0 || sx > this.width || sy < 0 || sy > this.height) continue
      const d = Math.hypot(sx - box.cx, sy - box.cy)
      if (d < bestD) {
        bestD = d
        best = visual.node.id
      }
    }
    return best
  }

  /** Keyboard access: arrows orbit, plus and minus zoom, Enter selects. */
  private onKeyDown = (event: KeyboardEvent) => {
    const step = 0.15
    switch (event.key) {
      case 'Enter':
      case ' ': {
        const id = this.centremostNodeId()
        if (id) this.onSelect(id)
        break
      }
      case 'ArrowLeft':
        this.claimView()
        this.view.theta += step
        break
      case 'ArrowRight':
        this.claimView()
        this.view.theta -= step
        break
      case 'ArrowUp':
        this.claimView()
        this.view.phi = Math.max(PHI_MIN, this.view.phi - step)
        break
      case 'ArrowDown':
        this.claimView()
        this.view.phi = Math.min(PHI_MAX, this.view.phi + step)
        break
      case '+':
      case '=':
        this.zoomBy(1.3)
        break
      case '-':
        this.zoomBy(1 / 1.3)
        break
      default:
        return
    }
    event.preventDefault()
    this.renderDirty = true
  }

  // -------------------------------------------------------------------
  // Frame loop.
  // -------------------------------------------------------------------

  private handleResize() {
    const parent = this.canvas.parentElement
    if (!parent) return
    const rect = parent.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) return
    this.width = rect.width
    this.height = rect.height
    this.renderer.setSize(rect.width, rect.height, false)
    this.camera.aspect = rect.width / rect.height
    this.camera.updateProjectionMatrix()
    if (!this.viewOwnedFlag && this.nodeVisuals.size > 0) this.fit(false)
    this.renderDirty = true
  }

  private stepFades(dt: number): boolean {
    // Exponential approach: reads as the same cross-fade the 2D map does with
    // its 180ms opacity transition.
    const rate = this.reduced ? 1 : 1 - Math.exp(-dt / 110)
    let active = false
    const step = (fade: Fade): number => {
      const delta = fade.target - fade.current
      if (Math.abs(delta) < 0.004) {
        fade.current = fade.target
        return fade.current
      }
      active = true
      fade.current += delta * rate
      return fade.current
    }
    const now = performance.now()
    for (const visual of this.nodeVisuals.values()) {
      if (visual.bornAt > 0 && now < visual.bornAt) {
        active = true
      } else {
        visual.bornAt = 0
        step(visual.scale)
      }
      step(visual.opacity)
      step(visual.shellOpacity)
      step(visual.lift)
    }
    for (const visual of this.edgeVisuals) step(visual.opacity)
    for (const halo of this.halos.values()) {
      step(halo.presence)
      step(halo.value)
    }
    return active
  }

  private frame = (now: number) => {
    if (this.disposed || this.paused) return
    this.frameHandle = requestAnimationFrame(this.frame)
    const dt = Math.min(64, now - this.lastFrame)
    this.lastFrame = now
    this.frameCount += 1

    const simWarm = this.sim !== null && (this.sim.alpha() > 0.02 || this.drag !== null)
    if (simWarm) {
      this.sim?.tick(1)
      this.renderDirty = true
    }

    // Camera motion: the focus tween, the smoothed dolly and the idle drift.
    const tween = this.tween
    if (tween) {
      const t = Math.min(1, (now - tween.started) / tween.duration)
      const e = 1 - Math.pow(1 - t, 3)
      this.view.target.lerpVectors(tween.from.target, tween.to.target, e)
      this.view.theta = tween.from.theta + (tween.to.theta - tween.from.theta) * e
      this.view.phi = tween.from.phi + (tween.to.phi - tween.from.phi) * e
      this.view.dist = tween.from.dist * Math.pow(tween.to.dist / tween.from.dist, e)
      if (t >= 1) this.tween = null
      this.renderDirty = true
    } else {
      const distDelta = this.distGoal - this.view.dist
      if (Math.abs(distDelta) > 0.5) {
        this.view.dist += distDelta * (this.reduced ? 1 : Math.min(1, dt / 90))
        this.renderDirty = true
      }
      if (this.idleSpin && this.nodeVisuals.size > 0) {
        this.view.theta += (IDLE_SPIN * dt) / 1000
        this.renderDirty = true
      }
    }

    if (this.stepFades(dt)) this.renderDirty = true

    if (this.hoverDirty && !this.drag && !this.orbit && !this.pinch) {
      this.hoverDirty = false
      if (this.hoverPos) {
        const hit = this.raycastNode(this.hoverPos.x, this.hoverPos.y)
        this.setHovered(hit ? hit.node.id : null)
      }
    }

    if (!this.renderDirty) return

    this.renderDirty = false
    this.updateCamera()
    this.updateNodeMeshes()
    this.updateEdgeMeshes()
    if (simWarm) this.updateTerritories()
    this.updateRings()
    this.renderer.render(this.scene, this.camera)
    this.projectLabels()
    if (simWarm || this.tween) this.renderDirty = true
  }

  private updateCamera() {
    const { target, theta, phi, dist } = this.view
    const sinPhi = Math.sin(phi)
    this.camera.position.set(
      target.x + dist * sinPhi * Math.sin(theta),
      target.y + dist * Math.cos(phi),
      target.z + dist * sinPhi * Math.cos(theta),
    )
    this.camera.lookAt(target)
    this.camera.updateMatrixWorld()
    // Fog rides the camera so depth always fades at the same visual rate.
    // Gentle: the far side of the map softens into the paper but every mark
    // stays clearly readable at the fitted view - depth is a cue, not a veil.
    this.fog.near = dist + this.worldRadius * 0.35
    this.fog.far = dist + this.worldRadius * 4.4
  }

  private nodeLiftDir = new THREE.Vector3()

  private updateNodeMeshes() {
    for (const visual of this.nodeVisuals.values()) {
      const scale = Math.max(0.001, visual.r * visual.scale.current)
      visual.mesh.position.set(visual.sim.x, visual.sim.y, visual.sim.z)
      if (visual.lift.current > 0.001) {
        // The lift runs along the view axis, so the node comes towards the
        // reader without sliding off its own edges on screen.
        this.nodeLiftDir.copy(this.camera.position).sub(visual.mesh.position).normalize()
        visual.mesh.position.addScaledVector(
          this.nodeLiftDir,
          visual.lift.current * (visual.r * 0.6 + 10),
        )
      }
      visual.mesh.scale.setScalar(scale)
      visual.material.opacity = visual.opacity.current
      visual.material.depthWrite = visual.opacity.current > 0.5
      visual.shellMaterial.opacity = visual.shellOpacity.current
      visual.shell.visible = visual.shellOpacity.current > 0.01
    }
  }

  private edgeUp = new THREE.Vector3(0, 1, 0)
  private edgeTmpDir = new THREE.Vector3()
  private edgeTmpSide = new THREE.Vector3()
  private edgeTmpMid = new THREE.Vector3()
  private edgeTmpQuat = new THREE.Quaternion()

  private updateEdgeMeshes() {
    const dir = this.edgeTmpDir
    const side = this.edgeTmpSide
    const mid = this.edgeTmpMid
    for (const visual of this.edgeVisuals) {
      const { from, to } = visual
      dir.set(to.sim.x - from.sim.x, to.sim.y - from.sim.y, to.sim.z - from.sim.z)
      const len = dir.length()
      if (len < 1) {
        visual.mesh.visible = false
        visual.cone.visible = false
        continue
      }
      dir.multiplyScalar(1 / len)
      const rFrom = from.r * from.scale.current
      const rTo = to.r * to.scale.current
      const arrow = visual.emphasised ? Math.max(4.5, visual.width * 3.2) : 0
      // The tube runs rim to rim, not midpoint out: a hub-leaf pair centred
      // on the geometric midpoint leaves a floating gap at the small end.
      const startOffset = rFrom + 1
      const endOffset = rTo + arrow + 1
      const span = Math.max(1, len - startOffset - endOffset)

      // A stable sideways direction for parallel relations to fan along.
      side.set(dir.z, 0, -dir.x)
      if (side.lengthSq() < 0.01) side.set(1, 0, 0)
      side.normalize()
      const bow = visual.lateral * Math.min(12, len * 0.1)

      const along = startOffset + span / 2
      mid.set(
        from.sim.x + dir.x * along + side.x * bow,
        from.sim.y + dir.y * along + side.y * bow,
        from.sim.z + dir.z * along + side.z * bow,
      )
      const width = visual.emphasised ? Math.max(visual.width, 1.5) : visual.width
      visual.mesh.visible = visual.opacity.current > 0.01
      visual.mesh.position.copy(mid)
      visual.mesh.quaternion.copy(this.edgeTmpQuat.setFromUnitVectors(this.edgeUp, dir))
      visual.mesh.scale.set(width, span, width)
      visual.material.opacity = visual.opacity.current

      if (visual.emphasised) {
        visual.cone.visible = true
        visual.cone.position.set(
          to.sim.x - dir.x * (rTo + arrow / 2 + 1),
          to.sim.y - dir.y * (rTo + arrow / 2 + 1),
          to.sim.z - dir.z * (rTo + arrow / 2 + 1),
        )
        visual.cone.quaternion.copy(this.edgeTmpQuat)
        const coneW = Math.max(2.2, width * 2.1)
        visual.cone.scale.set(coneW, arrow, coneW)
        visual.coneMaterial.opacity = Math.min(1, visual.opacity.current + 0.05)
      } else {
        visual.cone.visible = false
      }
    }
  }

  private updateTerritories() {
    for (const territory of this.territories) {
      let x = 0
      let y = 0
      let z = 0
      let n = 0
      for (const visual of this.nodeVisuals.values()) {
        if (visual.node.group !== territory.group) continue
        x += visual.sim.x
        y += visual.sim.y
        z += visual.sim.z
        n += 1
      }
      if (n === 0) {
        territory.mesh.visible = false
        territory.caption.style.display = 'none'
        continue
      }
      x /= n
      y /= n
      z /= n
      let spread = 0
      for (const visual of this.nodeVisuals.values()) {
        if (visual.node.group !== territory.group) continue
        const d = Math.hypot(visual.sim.x - x, visual.sim.y - y, visual.sim.z - z) + visual.r
        if (d > spread) spread = d
      }
      territory.centre.set(x, y, z)
      territory.r = spread + 22
      territory.mesh.visible = true
      territory.mesh.position.set(x, y, z)
      territory.mesh.scale.setScalar(territory.r)
    }
  }

  private updateRings() {
    const place = (ring: THREE.Mesh, material: THREE.MeshBasicMaterial, id: string | null) => {
      const visual = id ? this.nodeVisuals.get(id) : undefined
      if (!visual) {
        ring.visible = false
        return
      }
      ring.visible = true
      ring.position.set(visual.sim.x, visual.sim.y, visual.sim.z)
      ring.scale.setScalar(visual.r * visual.scale.current)
      ring.quaternion.copy(this.camera.quaternion)
      material.opacity = 0.85
    }
    place(this.selectionRing, this.selectionRingMaterial, this.emphasis.selectedId)
    place(
      this.traceRing,
      this.traceRingMaterial,
      this.emphasis.pathFrom !== this.emphasis.selectedId ? this.emphasis.pathFrom : null,
    )
    // Halos sit outside the selection ring; reach grows a little with the
    // value, intensity carries it. A dimmed node's halo recedes with it.
    for (const [id, halo] of this.halos) {
      const visual = this.nodeVisuals.get(id)
      const presence = halo.presence.current
      if (!visual || presence < 0.01) {
        halo.mesh.visible = false
        continue
      }
      const value = Math.max(0, Math.min(1, halo.value.current))
      halo.mesh.visible = true
      halo.mesh.position.copy(visual.mesh.position)
      halo.mesh.scale.setScalar(visual.r * visual.scale.current * (1.42 + 0.5 * value))
      halo.mesh.quaternion.copy(this.camera.quaternion)
      halo.material.opacity = presence * (0.18 + 0.72 * value) * visual.opacity.current
    }
  }

  // -------------------------------------------------------------------
  // Labels - DOM, projected. Real type set in the tenant's own tokens, which
  // WebGL text never quite matches.
  // -------------------------------------------------------------------

  private labelVec = new THREE.Vector3()

  private projectLabels() {
    const cam = this.camera
    const halfTan = Math.tan(THREE.MathUtils.degToRad(FOV / 2))
    const focus = this.emphasis.selectedId ?? this.hoveredId
    const placed: { x1: number; y1: number; x2: number; y2: number }[] = []
    // The label budget grows as the camera comes closer, like the 2D zoom.
    const budget = Math.max(
      10,
      Math.min(48, Math.round(24 * (this.fitDist / Math.max(1, this.view.dist)))),
    )
    let kept = 0

    // First pass: every node's screen disc, so a label can be tested against
    // ALL nearer spheres - not just the ones that happen to have labels of
    // their own. In the dense party blob a label anchored above a low sphere
    // otherwise lands on the FACE of the taller sphere behind its anchor and
    // reads as that sphere's caption ("Labor" printed across Liberal).
    const discs = this.paintRank.map((visual) => {
      this.labelVec.set(visual.sim.x, visual.sim.y, visual.sim.z).project(cam)
      const ok = this.labelVec.z <= 1 && this.labelVec.z >= -1
      const sx = (this.labelVec.x * 0.5 + 0.5) * this.width
      const sy = (-this.labelVec.y * 0.5 + 0.5) * this.height
      const camDist = Math.hypot(
        visual.sim.x - cam.position.x,
        visual.sim.y - cam.position.y,
        visual.sim.z - cam.position.z,
      )
      // A lifted (hovered) node is nearer the camera than its sim position
      // says, so its apparent radius grows a touch beyond this figure.
      const screenR = ((visual.r * visual.scale.current * (this.height / 2)) /
        (camDist * halfTan)) * (1 + visual.lift.current * 0.15)
      return { ok, sx, sy, camDist, screenR, opacity: visual.opacity.current }
    })

    for (let rank = 0; rank < this.paintRank.length; rank++) {
      const visual = this.paintRank[rank]
      const disc = discs[rank]
      if (!visual || !disc) continue
      const label = visual.label
      const emphasised = visual.node.id === focus ||
        visual.node.id === this.emphasis.pathFrom ||
        (this.pathNodeIds?.has(visual.node.id) ?? false)
      const inNeighbourhood = this.neighbourIds?.has(visual.node.id) ?? false
      const hovered = visual.node.id === this.hoveredId
      const wanted = emphasised || inNeighbourhood || hovered || kept < budget
      if (!wanted || (visual.opacity.current < 0.2 && !hovered) || !disc.ok) {
        label.style.display = 'none'
        continue
      }
      const { sx, sy, camDist, screenR } = disc
      if (sx < -40 || sx > this.width + 40 || sy < -20 || sy > this.height + 20) {
        label.style.display = 'none'
        continue
      }
      const text = label.textContent ?? ''
      const halfW = text.length * 6.2 * 0.5
      const box = { x1: sx - halfW, x2: sx + halfW, y1: sy - screenR - 22, y2: sy - screenR - 4 }
      if (!emphasised && !inNeighbourhood && !hovered) {
        // The label box's centre must not sit on the face of a nearer,
        // clearly-visible sphere of readable size - see the discs note.
        const ax = sx
        const ay = sy - screenR - 13
        const covered = discs.some((p, j) =>
          j !== rank && p.ok && p.opacity > 0.2 && p.screenR > 13 &&
          p.camDist < camDist - 1 &&
          Math.hypot(ax - p.sx, ay - p.sy) < p.screenR * 0.92
        )
        if (covered) {
          label.style.display = 'none'
          continue
        }
        const hits = placed.some((p) =>
          box.x1 < p.x2 && box.x2 > p.x1 && box.y1 < p.y2 && box.y2 > p.y1
        )
        if (hits) {
          label.style.display = 'none'
          continue
        }
        kept += 1
      }
      placed.push(box)
      // Distance fade matches the scene fog, so a label never floats at full
      // strength over a mark that has already melted into the paper.
      const fogT = Math.max(
        0,
        Math.min(1, (camDist - this.fog.near) / Math.max(1, this.fog.far - this.fog.near)),
      )
      label.style.display = 'block'
      label.style.transform = `translate(-50%, -100%) translate(${sx.toFixed(1)}px, ${
        (sy - screenR - 4).toFixed(1)
      }px)`
      label.style.opacity = String(
        Math.max(0.35, (1 - fogT * 0.5) * Math.min(1, visual.opacity.current + 0.1)),
      )
      if (emphasised) label.setAttribute('data-emphasised', '')
      else label.removeAttribute('data-emphasised')
      if (visual.node.id === this.emphasis.selectedId) label.setAttribute('data-selected', '')
      else label.removeAttribute('data-selected')
    }
    this.placedLabelBoxes = placed
    this.positionPopup()

    // Territory captions above their volume, dimmed while something has focus.
    for (const territory of this.territories) {
      if (!territory.mesh.visible) continue
      this.labelVec.copy(territory.centre)
      this.labelVec.y += territory.r
      this.labelVec.project(cam)
      const visible = this.labelVec.z < 1 && this.labelVec.z > -1
      if (!visible) {
        territory.caption.style.display = 'none'
        continue
      }
      const sx = (this.labelVec.x * 0.5 + 0.5) * this.width
      const sy = (-this.labelVec.y * 0.5 + 0.5) * this.height
      territory.caption.style.display = 'block'
      territory.caption.style.transform = `translate(-50%, -100%) translate(${sx.toFixed(1)}px, ${
        (sy - 6).toFixed(1)
      }px)`
      territory.caption.style.opacity = focus ? '0.3' : '0.9'
    }

    this.projectEdgeLabels()
  }

  /** Relation labels ride emphasised edges only, like the 2D map's textPath. */
  private projectEdgeLabels() {
    for (const visual of this.edgeVisuals) {
      const show = visual.emphasised && Boolean(visual.edge.label) &&
        this.view.dist < this.fitDist * 1.15
      if (!show) {
        if (visual.label) visual.label.style.display = 'none'
        continue
      }
      if (!visual.label) {
        const el = document.createElement('div')
        el.className = 'rp-map3d-edge-label'
        el.textContent = visual.edge.label
        this.labelLayer.appendChild(el)
        visual.label = el
      }
      this.labelVec.set(
        (visual.from.sim.x + visual.to.sim.x) / 2,
        (visual.from.sim.y + visual.to.sim.y) / 2,
        (visual.from.sim.z + visual.to.sim.z) / 2,
      ).project(this.camera)
      if (this.labelVec.z > 1 || this.labelVec.z < -1) {
        visual.label.style.display = 'none'
        continue
      }
      const sx = (this.labelVec.x * 0.5 + 0.5) * this.width
      const sy = (-this.labelVec.y * 0.5 + 0.5) * this.height
      // Relation labels give way to node labels: an amount riding an edge
      // that mushes into a donor's name reads as neither.
      const halfW = visual.edge.label.length * 5.4 * 0.5
      const box = { x1: sx - halfW, x2: sx + halfW, y1: sy - 21, y2: sy - 5 }
      const hits = this.placedLabelBoxes.some((p) =>
        box.x1 < p.x2 && box.x2 > p.x1 && box.y1 < p.y2 && box.y2 > p.y1
      )
      if (hits) {
        visual.label.style.display = 'none'
        continue
      }
      visual.label.style.display = 'block'
      visual.label.style.transform = `translate(-50%, -140%) translate(${sx.toFixed(1)}px, ${
        sy.toFixed(1)
      }px)`
    }
  }

  // -------------------------------------------------------------------
  // Pause / teardown.
  // -------------------------------------------------------------------

  /**
   * Stop the frame loop while nobody can see the canvas (scrolled away, or a
   * display:none ancestor) - an idle spin off screen is wasted work. Resuming
   * restarts the clock so the first frame back carries no jump.
   */
  setPaused(paused: boolean) {
    if (this.disposed || this.paused === paused) return
    this.paused = paused
    if (paused) {
      if (this.frameHandle !== null) cancelAnimationFrame(this.frameHandle)
      this.frameHandle = null
    } else {
      this.lastFrame = performance.now()
      this.renderDirty = true
      this.frameHandle = requestAnimationFrame(this.frame)
    }
  }

  dispose() {
    this.disposed = true
    if (this.frameHandle !== null) cancelAnimationFrame(this.frameHandle)
    this.unbindPointerHandlers()
    if (this.onContextLost) this.canvas.removeEventListener('webglcontextlost', this.onContextLost)
    this.reducedQuery?.removeEventListener('change', this.onReducedChange)
    this.resizeObserver.disconnect()
    this.clearScene()
    this.popup.remove()
    this.sphereGeo.dispose()
    this.shellGeo.dispose()
    this.tubeGeo.dispose()
    this.coneGeo.dispose()
    this.ringGeo.dispose()
    this.haloGeo.dispose()
    this.territoryGeo.dispose()
    this.selectionRingMaterial.dispose()
    this.traceRingMaterial.dispose()
    this.renderer.dispose()
  }
}
