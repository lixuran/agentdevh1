export type RaidState = "active" | "extracting" | "extracted" | "died" | "timed_out";

export type TerminalRaidState = Extract<RaidState, "extracted" | "died" | "timed_out">;

export function isTerminalRaidState(state: RaidState): state is TerminalRaidState {
    return state === "extracted" || state === "died" || state === "timed_out";
}
