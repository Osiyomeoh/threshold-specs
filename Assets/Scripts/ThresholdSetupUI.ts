/**
 * ThresholdSetupUI — the physio's setup panel (design brief "Setup panel", "Hands and input").
 *
 * Owns: a UIKit panel about 32 x 38 cm with Marking Mode, Mark as Trouble Spot and Finish Setup, and
 * three independent sliders that show their value as a number (line spacing, beat speed, first-line
 * distance). Finish Setup collapses it to a small Setup button, which reopens it.
 * Sizes: the brief said about 32 x 28 cm; on 2026-11-06 Sam approved 32 x 38 so buttons (6 cm) and
 * slider knobs (4 cm) are easier to pinch.
 * Flow: Marking Mode -> pinch a doorway (it highlights) -> Mark as Trouble Spot -> Finish Setup.
 * Cue detection runs only while the panel is collapsed, so a cue can't start mid-setup.
 * Must not: decide anything about cues (CueDecider), or give the wearer a control.
 */
import { BackPlate } from "SpectaclesUIKit.lspkg/Scripts/BackPlate";
import { Button } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button";
import { FlexItem } from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexItem";
import { FlexLayout } from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexLayout";
import { FlexAlign, FlexDirection, FlexJustify } from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexTypes";
import { Slider } from "SpectaclesUIKit.lspkg/Scripts/Components/Slider/Slider";
import {
  BPM_MAX,
  BPM_MIN,
  CueController,
  FIRST_LINE_MAX_CM,
  FIRST_LINE_MIN_CM,
  SPACING_MAX_CM,
  SPACING_MIN_CM,
} from "./CueController";
import { Doorway } from "./Doorway";

const TYPE_SCALE = {
  Headline2: { size: 48, weight: 700 },
  Button: { size: 39, weight: 500 },
  Body: { size: 39, weight: 500 },
  Caption: { size: 38, weight: 500 },
};
type TextRole = keyof typeof TYPE_SCALE;
const FOCAL_DISTANCE_CM = 100;

function roleSize(role: TextRole): number {
  return TYPE_SCALE[role].size * (FOCAL_DISTANCE_CM / 110);
}

/** Pinch-target sizes, cm at about 1 m. */
const BUTTON_H = 6;
const SLIDER_ROW_H = 4.8;
const SLIDER_H = 4; // UIKit sizes the knob to the slider's height, so this is also the knob size
const ROW_GAP = 0.8;

const CONTENT_Z = 0.6;
const LABEL_Z = 0.08;
const LAYOUT_Z_LIFT = 0.02;

@component
export class ThresholdSetupUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">ThresholdSetupUI – physio setup panel</span>')
  @ui.separator
  @ui.group_start("References")
  @input
  @hint("Receives marked doorways and slider values")
  cueController!: CueController;

  @input
  @hint("Parent of the Doorway components (searched recursively)")
  doorwaysRoot!: SceneObject;
  @ui.group_end

  @ui.separator
  @ui.group_start("Settings")
  @input
  @hint("Panel width, cm")
  @widget(new SliderWidget(24, 48, 1))
  panelWidthCm: number = 32;

  @input
  @hint("Panel height, cm")
  @widget(new SliderWidget(20, 40, 1))
  panelHeightCm: number = 38;

  @input
  @hint("Collapsed Setup button position relative to this object, cm (inside the 37 degree display, out of the walker's way)")
  collapsedOffsetCm: vec3 = new vec3(20, -17, 0);

  @input
  @hint("Text colour (light; the display is additive)")
  @widget(new ColorWidget())
  textColor: vec3 = new vec3(0.95, 0.97, 1.0);
  @ui.group_end

  private doorways: Doorway[] = [];
  private markingMode = false;
  private selected: Doorway | null = null;
  private expanded = true;
  private panelRoot!: SceneObject;
  private collapsedRoot!: SceneObject;
  private statusText!: Text;
  private spacingValue!: Text;
  private bpmValue!: Text;
  private firstLineValue!: Text;

  onAwake(): void {
    if (!this.cueController || !this.doorwaysRoot) {
      print("[Threshold] ERROR: ThresholdSetupUI is missing cueController/doorwaysRoot");
      return;
    }
    this.collectDoorways(this.doorwaysRoot);
    this.buildPanel();
    this.buildCollapsedButton();
    this.collapsedRoot.enabled = false;
    this.setStatus("Pinch Marking Mode to choose a doorway.");

    // Doorway.onPinched is ours, but the doorways' Interactables are set up in their own OnStart.
    this.createEvent("OnStartEvent").bind(() => {
      for (const d of this.doorways) d.onPinched.add((door: Doorway) => this.selectDoorway(door));
    });
  }

  // ---------- read-outs (LEAF scenarios) ----------

  get isExpanded(): boolean {
    return this.expanded;
  }
  get isMarkingMode(): boolean {
    return this.markingMode;
  }
  get status(): string {
    return this.statusText.text;
  }
  get spacingLabel(): string {
    return this.spacingValue.text;
  }
  get bpmLabel(): string {
    return this.bpmValue.text;
  }
  get firstLineLabel(): string {
    return this.firstLineValue.text;
  }

  // ---------- setup flow ----------

  private toggleMarkingMode(): void {
    this.setMarkingMode(!this.markingMode);
    this.setStatus(this.markingMode ? "Marking Mode on. Pinch a doorway." : "Marking Mode off.");
  }

  private setMarkingMode(on: boolean): void {
    this.markingMode = on;
    for (const d of this.doorways) d.setSelectable(on);
    if (!on) this.selectDoorway(null);
  }

  private selectDoorway(door: Doorway | null): void {
    if (this.selected && this.selected !== door) this.selected.setSelected(false);
    this.selected = door;
    if (!door) return;
    door.setSelected(true);
    this.setStatus(`${friendlyName(door)} selected. Pinch Mark as Trouble Spot.`);
  }

  private markSelected(): void {
    if (!this.selected) {
      this.setStatus(this.markingMode ? "Pinch a doorway first." : "Pinch Marking Mode, then a doorway.");
      return;
    }
    const door = this.selected;
    door.mark();
    this.cueController.refreshMarkedDoorways();
    this.selectDoorway(null);
    door.setSelected(false);
    this.setStatus(`${friendlyName(door)} marked. Pinch Finish Setup.`);
  }

  private finishSetup(): void {
    this.setMarkingMode(false);
    this.setExpanded(false);
    this.cueController.setDetectionEnabled(true);
  }

  private reopenSetup(): void {
    this.cueController.setDetectionEnabled(false);
    this.setExpanded(true);
    const marked = this.doorways.filter((d) => d.marked).map(friendlyName);
    this.setStatus(marked.length > 0 ? `Marked: ${marked.join(", ")}.` : "Pinch Marking Mode to choose a doorway.");
  }

  private setExpanded(on: boolean): void {
    this.expanded = on;
    this.panelRoot.enabled = on;
    this.collapsedRoot.enabled = !on;
  }

  private setStatus(s: string): void {
    this.statusText.text = s;
  }

  private collectDoorways(so: SceneObject): void {
    const d = so.getComponent(Doorway.getTypeName()) as Doorway;
    if (d) this.doorways.push(d);
    for (let i = 0; i < so.getChildrenCount(); i++) this.collectDoorways(so.getChild(i));
  }

  // ---------- panel ----------

  private buildPanel(): void {
    const W = this.panelWidthCm;
    const H = this.panelHeightCm;
    const innerW = W - 2;
    this.panelRoot = this.obj(this.sceneObject, "SetupPanel");
    this.panelRoot.createComponent("Component.Canvas");
    const plate = this.panelRoot.createComponent(BackPlate.getTypeName()) as BackPlate;
    plate.size = new vec2(W, H);

    const content = this.obj(this.panelRoot, "Content", new vec3(0, 0, CONTENT_Z));
    const column = this.makeFlex(content, FlexDirection.Column, W, H, ROW_GAP, 1);

    this.flexChild(column, innerW, 2.4, (so) => this.text(so, "Threshold setup", "Headline2", innerW));
    this.flexChild(column, innerW, 2.2, (so) => {
      this.statusText = this.text(so, "", "Caption", innerW);
    });
    this.flexChild(column, innerW, BUTTON_H, (so) => {
      const gap = 1;
      const markW = 16.5;
      const modeW = innerW - markW - gap;
      const row = this.makeFlex(so, FlexDirection.Row, innerW, BUTTON_H, gap, 0);
      this.flexChild(row, modeW, BUTTON_H, (cell) => this.button(cell, "Marking Mode", modeW, BUTTON_H, () => this.toggleMarkingMode()));
      this.flexChild(row, markW, BUTTON_H, (cell) => this.button(cell, "Mark as Trouble Spot", markW, BUTTON_H, () => this.markSelected()));
    });

    const c = this.cueController;
    this.spacingValue = this.sliderRow(column, innerW, "Line spacing", SPACING_MIN_CM, SPACING_MAX_CM, 5, c.lineSpacingCm, formatCm, (v) =>
      c.setLineSpacing(v)
    );
    this.bpmValue = this.sliderRow(column, innerW, "Beat speed", BPM_MIN, BPM_MAX, 1, c.beatBpm, formatBpm, (v) => c.setBpm(v));
    this.firstLineValue = this.sliderRow(
      column,
      innerW,
      "First-line distance",
      FIRST_LINE_MIN_CM,
      FIRST_LINE_MAX_CM,
      10,
      c.firstLineDistanceCm,
      formatMetres,
      (v) => c.setFirstLineDistance(v)
    );

    this.flexChild(column, innerW, BUTTON_H, (so) => this.button(so, "Finish Setup", 20, BUTTON_H, () => this.finishSetup()));
  }

  private buildCollapsedButton(): void {
    this.collapsedRoot = this.obj(this.sceneObject, "SetupCollapsed", this.collapsedOffsetCm);
    this.collapsedRoot.createComponent("Component.Canvas");
    this.button(this.collapsedRoot, "Setup", 12, BUTTON_H, () => this.reopenSetup());
  }

  /** Label, slider and numeric value; returns the value text. Values snap to `step`. */
  private sliderRow(
    column: SceneObject,
    width: number,
    name: string,
    min: number,
    max: number,
    step: number,
    initial: number,
    format: (v: number) => string,
    apply: (v: number) => void
  ): Text {
    const labelW = 10;
    const valueW = 6;
    const gap = 0.5;
    const sliderW = width - labelW - valueW - 2 * gap;
    const h = SLIDER_ROW_H;
    let valueText!: Text;
    this.flexChild(column, width, h, (rowHost) => {
      const row = this.makeFlex(rowHost, FlexDirection.Row, width, h, gap, 0);
      this.flexChild(row, labelW, h, (cell) => this.text(cell, name, "Caption", labelW));
      this.flexChild(row, sliderW, h, (cell) => {
        const so = this.obj(cell, name);
        const slider = so.createComponent(Slider.getTypeName()) as Slider;
        slider.size = new vec3(sliderW, SLIDER_H, 1); // before init: the fill and knob only size once
        slider.currentValue = (initial - min) / (max - min);
        slider.onValueChange.add((n: number) => {
          const v = Math.round((min + n * (max - min)) / step) * step;
          apply(v);
          valueText.text = format(v);
        });
      });
      this.flexChild(row, valueW, h, (cell) => {
        valueText = this.text(cell, format(initial), "Body", valueW);
      });
    });
    return valueText;
  }

  // ---------- layout helpers ----------

  private obj(parent: SceneObject, name: string, position?: vec3): SceneObject {
    const so = global.scene.createSceneObject(name);
    so.setParent(parent);
    if (position) so.getTransform().setLocalPosition(position);
    return so;
  }

  private makeFlex(parent: SceneObject, direction: FlexDirection, width: number, height: number, gap: number, padding: number): SceneObject {
    const container = this.obj(parent, "Flex", new vec3(0, 0, LAYOUT_Z_LIFT));
    const flex = container.createComponent(FlexLayout.getTypeName()) as FlexLayout;
    flex.autoDiscoverItemsOnStart = false; // items are registered explicitly by flexChild, in order
    const item = container.createComponent(FlexItem.getTypeName()) as FlexItem;
    item.overrideWidth = width;
    item.overrideHeight = height;
    flex.onInitialized.add(() => {
      flex.width = width;
      flex.height = height;
      flex.direction = direction;
      if (direction === FlexDirection.Row) flex.columnGap = gap;
      else flex.rowGap = gap;
      flex.paddingTop = padding;
      flex.paddingBottom = padding;
      flex.paddingLeft = padding;
      flex.paddingRight = padding;
      flex.justifyContent = FlexJustify.Center;
      flex.alignItems = FlexAlign.Center;
    });
    return container;
  }

  private flexChild(parent: SceneObject, w: number, h: number, builder: (child: SceneObject) => void): SceneObject {
    const child = this.obj(parent, "Item", new vec3(0, 0, LAYOUT_Z_LIFT));
    const item = child.createComponent(FlexItem.getTypeName()) as FlexItem;
    item.overrideWidth = w;
    item.overrideHeight = h;
    item.flexGrow = 0;
    item.flexShrink = 0;
    builder(child);
    const layout = parent.getComponent(FlexLayout.getTypeName()) as FlexLayout | null;
    if (layout) layout.addItems([item]);
    return child;
  }

  private button(parent: SceneObject, label: string, w: number, h: number, onClick: () => void): void {
    const so = this.obj(parent, label);
    const btn = so.createComponent(Button.getTypeName()) as Button;
    btn.size = new vec3(w, h, 1); // before init
    btn.onTriggerUp.add(onClick);
    const labelObj = this.obj(so, "ButtonLabel", new vec3(0, 0, LABEL_Z));
    this.applyText(labelObj.createComponent("Component.Text") as Text, label, "Button", w - 0.5);
  }

  private text(parent: SceneObject, s: string, role: TextRole, widthCm: number): Text {
    const t = this.obj(parent, "Text").createComponent("Component.Text") as Text;
    this.applyText(t, s, role, widthCm);
    return t;
  }

  private applyText(t: Text, s: string, role: TextRole, widthCm: number): void {
    t.text = s;
    t.depthTest = true;
    t.size = roleSize(role);
    (t as any).weight = TYPE_SCALE[role].weight;
    t.horizontalAlignment = HorizontalAlignment.Center;
    t.verticalAlignment = VerticalAlignment.Center;
    t.horizontalOverflow = HorizontalOverflow.Overflow;
    t.verticalOverflow = VerticalOverflow.Overflow;
    t.layoutRect = Rect.create(-widthCm / 2, widthCm / 2, -1.2, 1.2);
    const c = this.textColor;
    t.textFill.color = new vec4(c.x, c.y, c.z, 1);
  }
}

function friendlyName(d: Doorway): string {
  return d.sceneObject.name.replace(/^Doorway/, "") + " doorway";
}
function formatCm(v: number): string {
  return `${v} cm`;
}
function formatBpm(v: number): string {
  return `${v} BPM`;
}
function formatMetres(cm: number): string {
  return `${(cm / 100).toFixed(1)} m`;
}
