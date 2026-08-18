import { assertEquals } from "jsr:@std/assert";
import {
  compareAssignPriority,
  isExcludedFromRescue,
  minAssignPriority,
} from "./schedulingPreferences.ts";

Deno.test("Francy queda fuera del rescate y Jennifer es última opción", () => {
  assertEquals(isExcludedFromRescue("vF4kcE8kMFQiFIPLLo9OnYJ5E5l1"), true);
  assertEquals(isExcludedFromRescue("LgumzEtuf2aKlmiEofBM3KauMN32"), false);
  assertEquals(
    ["LgumzEtuf2aKlmiEofBM3KauMN32", "8Z9jgT9wQ0SDmNnv4QkZfaMD5IH3"].sort(
      compareAssignPriority,
    )[0],
    "8Z9jgT9wQ0SDmNnv4QkZfaMD5IH3",
  );
  assertEquals(
    minAssignPriority([
      "8Z9jgT9wQ0SDmNnv4QkZfaMD5IH3",
      "LgumzEtuf2aKlmiEofBM3KauMN32",
    ]),
    20,
  );
});
