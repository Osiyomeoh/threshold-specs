import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor";
import { sleep } from "Leaf.lspkg/Utils/common/Utils";
import { ensureLeftMarked } from "./ThresholdSim";

/**
 * Helper, not a done criterion: marks the left doorway through the real setup flow and stops, leaving
 * the real preview camera in charge. Use it to walk the room by hand (or with MovePreviewCamera)
 * without repeating the setup pinches.
 */
@component
export class M0_MarkLeftThenStop extends Scenario {
  async run(): Promise<void> {
    await sleep(1000);
    await ensureLeftMarked(new DefaultLeafInteractor());
  }
}
