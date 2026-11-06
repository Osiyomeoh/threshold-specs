import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor";
import { sleep } from "Leaf.lspkg/Utils/common/Utils";
import { controller, door, mustInteractable, pinch, setupUI } from "./ThresholdSim";

/**
 * Done criterion 1, doorway marking: Marking Mode, pinch a doorway, Mark as Trouble Spot, Finish Setup.
 * The marked doorway shows its outline and corner marker; the other doorway is unchanged.
 */
@component
export class C1_DoorwayMarking extends Scenario {
  async run(): Promise<void> {
    const interactor = new DefaultLeafInteractor();
    await sleep(1000);
    const ui = setupUI();
    const c = controller();
    const left = door("DoorwayLeft");
    const right = door("DoorwayRight");

    // Starting state: nothing marked, panel open, nothing can cue.
    expect(ui.isExpanded).toBe(true);
    expect(left.marked).toBe(false);
    expect(right.marked).toBe(false);
    expect(left.markedRoot.enabled).toBe(false);
    expect(right.markedRoot.enabled).toBe(false);
    expect(c.detectionEnabled).toBe(false);

    // A doorway ignores a pinch until Marking Mode is on.
    await pinch(interactor, "DoorwayLeft_Target");
    expect(left.isSelected).toBe(false);

    // Step 1: Marking Mode.
    await pinch(interactor, "Marking Mode");
    expect(ui.isMarkingMode).toBe(true);
    expect(left.isSelectable).toBe(true);
    expect(ui.status).toBe("Marking Mode on. Pinch a doorway.");

    // A doorway highlights while aimed at.
    const aim = interactor.hover(mustInteractable("DoorwayLeft_Target"), 400);
    await sleep(200);
    expect(left.highlightRoot.enabled).toBe(true);
    await aim;
    await sleep(100);
    expect(left.highlightRoot.enabled).toBe(false);

    // Step 2: pinch the doorway. It stays highlighted; nothing is marked yet.
    await pinch(interactor, "DoorwayLeft_Target");
    expect(left.isSelected).toBe(true);
    expect(left.highlightRoot.enabled).toBe(true);
    expect(left.marked).toBe(false);
    expect(left.markedRoot.enabled).toBe(false);
    expect(ui.status).toBe("Left doorway selected. Pinch Mark as Trouble Spot.");

    // Step 3: Mark as Trouble Spot.
    await pinch(interactor, "Mark as Trouble Spot");
    expect(left.marked).toBe(true);
    expect(left.markedRoot.enabled).toBe(true);
    expect(left.isSelected).toBe(false);
    expect(ui.status).toBe("Left doorway marked. Pinch Finish Setup.");

    // Step 4: Finish Setup collapses the panel and starts detection.
    await pinch(interactor, "Finish Setup");
    expect(ui.isExpanded).toBe(false);
    expect(ui.isMarkingMode).toBe(false);
    expect(c.detectionEnabled).toBe(true);
    mustInteractable("Setup");

    // The marked doorway shows its three outline bars and the corner marker.
    const names = ["OutlineLeft", "OutlineRight", "OutlineTop", "CornerMarker"];
    for (const n of names) {
      let found = false;
      for (let i = 0; i < left.markedRoot.getChildrenCount(); i++) {
        const child = left.markedRoot.getChild(i);
        if (child.name === n) {
          found = child.isEnabledInHierarchy;
          expect(child.getComponent("Component.RenderMeshVisual") !== null).toBe(true);
        }
      }
      expect(found).toBe(true);
    }

    // The other doorway is unchanged.
    expect(right.marked).toBe(false);
    expect(right.markedRoot.enabled).toBe(false);
    expect(right.highlightRoot.enabled).toBe(false);
    expect(right.isSelected).toBe(false);
  }
}
