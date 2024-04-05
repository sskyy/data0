import {assert} from "./util.js";

export type CleanupFrame = ManualCleanup[]


export class ManualCleanup {

    static collectFrames: CleanupFrame[] = []

    static collectEffect() {
        const frame: CleanupFrame = []
        ManualCleanup.collectFrames.push(frame)
        return () => {
            assert(ManualCleanup.collectFrames.at(-1) === frame, 'collect effect frame error')
            return ManualCleanup.collectFrames.pop()!
        }
    }

    constructor() {
        const collectFrame = ManualCleanup.collectFrames.at(-1)
        if (collectFrame) {
            collectFrame.push(this)
        }
    }

    destroy() {
        // should be override
    }
}