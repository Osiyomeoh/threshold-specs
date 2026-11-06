import { scenariosIndex } from "Leaf.lspkg/Scenarios/decorator/ScenarioIndexDecorator";
import { ScenarioMetadata } from "Leaf.lspkg/Scenarios/scenario/ScenarioMetadata";
import { C1_DoorwayMarking } from "./C1_DoorwayMarking";
import { C2_CorrectActivation } from "./C2_CorrectActivation";
import { C3_VisualAudioGuidance } from "./C3_VisualAudioGuidance";
import { C4_SettingsAndTimeout } from "./C4_SettingsAndTimeout";
import { C5_MovementRecovery } from "./C5_MovementRecovery";
import { M0_MarkLeftThenStop } from "./M0_MarkLeftThenStop";
import { X1_BriefExtras } from "./X1_BriefExtras";

/** Registers Threshold's LEAF scenarios (design brief done criteria C1–C5; X1 extra checks; M0 manual-walk helper). */
@component
export class LeafIndex extends BaseScriptComponent {
  @scenariosIndex
  static scenariosIndex: ScenarioMetadata[] = [
    { id: "C1_DoorwayMarking", typename: C1_DoorwayMarking.getTypeName() },
    { id: "C2_CorrectActivation", typename: C2_CorrectActivation.getTypeName() },
    { id: "C3_VisualAudioGuidance", typename: C3_VisualAudioGuidance.getTypeName() },
    { id: "C4_SettingsAndTimeout", typename: C4_SettingsAndTimeout.getTypeName() },
    { id: "C5_MovementRecovery", typename: C5_MovementRecovery.getTypeName() },
    { id: "X1_BriefExtras", typename: X1_BriefExtras.getTypeName() },
    { id: "M0_MarkLeftThenStop", typename: M0_MarkLeftThenStop.getTypeName() },
  ];
}
