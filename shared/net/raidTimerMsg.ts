import type { AbstractMsg, BitStream } from "./net.ts";

export class RaidTimerMsg implements AbstractMsg {
    remainingSeconds = 0;

    serialize(s: BitStream) {
        s.writeUint16(this.remainingSeconds);
    }

    deserialize(s: BitStream) {
        this.remainingSeconds = s.readUint16();
    }
}
