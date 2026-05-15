import { describe, expect, it } from "vitest";
import {
  createSharedOpeningAnswerState,
  NON_LIVING_IDENTITY_BOUNDARY_MOVE,
  readDeterministicOpeningFollowupMove
} from "./opening";

describe("readDeterministicOpeningFollowupMove", () => {
  it("asks a local boundary question after Alive = No", () => {
    const move = readDeterministicOpeningFollowupMove(
      createSharedOpeningAnswerState("no")
    );

    expect(move).toEqual(NON_LIVING_IDENTITY_BOUNDARY_MOVE);
    expect(move?.question).toContain("real person who actually lived");
    expect(move?.question).toContain("fictional");
  });

  it("keeps Alive = Yes on the warmed model path", () => {
    expect(
      readDeterministicOpeningFollowupMove(createSharedOpeningAnswerState("yes"))
    ).toBeNull();
  });

  it("lets uncertain alive answers go to the model", () => {
    expect(
      readDeterministicOpeningFollowupMove(createSharedOpeningAnswerState("maybe"))
    ).toBeNull();
  });
});
