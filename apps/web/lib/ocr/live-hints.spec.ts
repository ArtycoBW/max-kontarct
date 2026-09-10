import { createHintStabilizer } from "./live-hints";
import type { CaptureQuality } from "./image-quality";

const good: CaptureQuality = { dark: false, glare: false, moving: false, soft: false };
describe("readable camera instructions", () => {
  it("ignores single-tick changes and gives one prioritized instruction", () => {
    const hint = createHintStabilizer();
    expect(hint(good, 0)).toBe("checking");
    expect(hint(good, 1200)).toBe("good");
    for (let time = 1600; time <= 4000; time += 400) {
      expect(hint({ ...good, glare: time % 800 === 0, soft: time % 800 === 0 }, time)).toBe("good");
    }
    expect(hint({ ...good, dark: true, glare: true, soft: true }, 4400)).toBe("good");
    expect(hint({ ...good, dark: true, glare: true, soft: true }, 5600)).toBe("dark");
  });
  it("holds a visible message at least 2.4 seconds, then clears on sustained recovery", () => {
    const hint = createHintStabilizer();
    hint({ ...good, moving: true }, 0);
    expect(hint({ ...good, moving: true }, 1200)).toBe("moving");
    hint(good, 1600);
    expect(hint(good, 2800)).toBe("moving");
    expect(hint(good, 3600)).toBe("good");
  });
});
