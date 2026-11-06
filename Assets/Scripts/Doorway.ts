/**
 * Doorway — one stand-in doorway that the physio can select and mark (design brief "Hands and input").
 *
 * Owns: the doorway's pinch target (SIK Interactable on `target`, which carries a Box collider
 * covering the opening), its aim/selection highlight, and its marked indicator (outline + corner
 * marker under `markedRoot`). Marks last for this session only; there is no unmark.
 * Geometry for CueDecider comes from this object's transform: world X/Z of this object is the
 * centre of the opening at floor level, and its horizontal forward axis is the doorway normal.
 * Must not: decide anything about cues. ThresholdSetupUI drives selection and marking;
 * CueController reads `geometry` for marked doorways.
 */
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable";
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";
import { Doorway as DoorwayGeometry } from "./CueDecider";

const TARGET_DEPTH_CM = 20;

@component
export class Doorway extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">Doorway – selectable, markable stand-in doorway</span>')
  @ui.separator
  @ui.group_start("References")
  @input
  @hint("Pinch target: carries a Box collider covering the opening; an Interactable is added if missing")
  target!: SceneObject;

  @input
  @hint("Highlight frame shown while aimed at (Marking Mode) and while selected")
  highlightRoot!: SceneObject;

  @input
  @hint("Marked indicator (2 cm outline + corner marker), shown from Mark as Trouble Spot until the session ends")
  markedRoot!: SceneObject;
  @ui.group_end

  @ui.separator
  @ui.group_start("Settings")
  @input
  @hint("Half the opening width, cm (110 cm opening = 55)")
  @widget(new SliderWidget(20, 100, 1))
  halfWidthCm: number = 55;

  @input
  @hint("Opening height, cm; sizes the pinch target")
  @widget(new SliderWidget(150, 300, 1))
  openingHeightCm: number = 210;

  @input
  @hint("Highlight colour (light; the display is additive)")
  @widget(new ColorWidget())
  highlightColor: vec3 = new vec3(0.75, 0.9, 1.0);

  @input
  @hint("Highlight opacity while only aimed at; a selected doorway shows it at full opacity")
  @widget(new SliderWidget(0.1, 1, 0.05))
  hoverOpacity: number = 0.45;
  @ui.group_end

  /** Fires when the doorway is pinched while selectable (Marking Mode). */
  readonly onPinched = new Event<Doorway>();

  private interactable: Interactable | null = null;
  private highlightMat: Material | null = null;
  private hovered = false;
  private selectable = false;
  private selected = false;
  private _marked = false;

  onAwake(): void {
    if (!this.target || !this.highlightRoot || !this.markedRoot) {
      print(`[Doorway] ERROR: ${this.sceneObject.name} is missing target/highlightRoot/markedRoot`);
      return;
    }
    this.fitTargetCollider();
    this.interactable =
      (this.target.getComponent(Interactable.getTypeName()) as Interactable) ||
      (this.target.createComponent(Interactable.getTypeName()) as Interactable);
    this.highlightMat = this.shareClonedMaterial(this.highlightRoot);
    this.markedRoot.enabled = false;
    this.refresh();

    this.createEvent("OnStartEvent").bind(() => {
      if (!this.interactable) return;
      this.interactable.onHoverEnter.add(() => {
        this.hovered = true;
        this.refresh();
      });
      this.interactable.onHoverExit.add(() => {
        this.hovered = false;
        this.refresh();
      });
      this.interactable.onTriggerEnd.add(() => {
        if (this.selectable) this.onPinched.invoke(this);
      });
    });
  }

  // ---------- setup flow ----------

  /** Marking Mode on/off: only a selectable doorway reacts to aim and pinch. */
  setSelectable(on: boolean): void {
    this.selectable = on;
    if (!on) this.hovered = false;
    this.refresh();
  }

  setSelected(on: boolean): void {
    this.selected = on;
    this.refresh();
  }

  get isSelected(): boolean {
    return this.selected;
  }

  get isSelectable(): boolean {
    return this.selectable;
  }

  /** Shows the marked indicator for the rest of the session. */
  mark(): void {
    this._marked = true;
    if (this.markedRoot) this.markedRoot.enabled = true;
  }

  get marked(): boolean {
    return this._marked;
  }

  /** Floor-plane geometry for CueDecider. id = this SceneObject's name. */
  get geometry(): DoorwayGeometry {
    const tr = this.sceneObject.getTransform();
    const p = tr.getWorldPosition();
    const f = tr.forward;
    let nx = f.x;
    let nz = f.z;
    const len = Math.sqrt(nx * nx + nz * nz);
    if (len < 1e-4) {
      nx = 0;
      nz = 1;
    } else {
      nx /= len;
      nz /= len;
    }
    return { id: this.sceneObject.name, center: { x: p.x, z: p.z }, normal: { x: nx, z: nz }, halfWidth: this.halfWidthCm };
  }

  // ---------- visuals ----------

  private refresh(): void {
    if (!this.highlightRoot) return;
    const show = this.selected || (this.selectable && this.hovered);
    this.highlightRoot.enabled = show;
    if (show && this.highlightMat) {
      const a = this.selected ? 1 : this.hoverOpacity;
      const c = this.highlightColor;
      this.highlightMat.mainPass.baseColor = new vec4(c.x, c.y, c.z, a);
    }
  }

  /** Makes the pinch target a box covering the whole opening. Set before the Interactable is created. */
  private fitTargetCollider(): void {
    const collider =
      (this.target.getComponent("Physics.ColliderComponent") as ColliderComponent) ||
      (this.target.createComponent("Physics.ColliderComponent") as ColliderComponent);
    const box = Shape.createBoxShape();
    box.size = new vec3(this.halfWidthCm * 2, this.openingHeightCm, TARGET_DEPTH_CM);
    collider.shape = box;
    collider.fitVisual = false;
  }

  /** Clones the first mesh material under `root`, switches it to alpha blending and shares it with every bar. */
  private shareClonedMaterial(root: SceneObject): Material | null {
    const visuals: RenderMeshVisual[] = [];
    const collect = (so: SceneObject) => {
      const rmv = so.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
      if (rmv) visuals.push(rmv);
      for (let i = 0; i < so.getChildrenCount(); i++) collect(so.getChild(i));
    };
    collect(root);
    if (visuals.length === 0 || !visuals[0].mainMaterial) return null;
    const mat = visuals[0].mainMaterial.clone();
    mat.mainPass.blendMode = BlendMode.Normal;
    mat.mainPass.depthWrite = false;
    for (const v of visuals) v.mainMaterial = mat;
    return mat;
  }
}
