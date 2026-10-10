// Secure policy boundary. No runtime/client-selectable vulnerability controls.
export const baseline = Object.freeze({
  profile: "secure-baseline",
  version: 1,
  openingCredit: 1500000,
  currency: "EGP",
  maxQuantity: 10,
});
export const activeTrainingProfiles = ["secure-baseline", "B01", "B04", "B08", "B10", "R01", "B02", "B03", "B05", "B06", "B07", "B09", "B11", "B12", "R02", "R03", "R04", "R05", "R06", "open-playground"] as const;
export type TrainingProfile = (typeof activeTrainingProfiles)[number];
export const plannedCore = Object.freeze(["B01", "B04", "B08", "B10", "R01"]);
export function totalFor(
  items: { price: string | number; quantity: number; kind: string }[],
  promotion?: { percent: number; minimum: string | number },
  options: { giftEligible?: boolean; stackedDiscount?: number } = {},
) {
  const subtotal = items.reduce(
    (sum, p) => sum + Number(p.price) * p.quantity,
    0,
  );
  const eligible = items
    .filter((p) => options.giftEligible || p.kind === "physical")
    .reduce((sum, p) => sum + Number(p.price) * p.quantity, 0);
  const calculated =
    promotion && eligible >= Number(promotion.minimum)
      ? Math.floor((eligible * promotion.percent) / 100)
      : 0;
  const discount = options.stackedDiscount ?? calculated;
  return {
    subtotal,
    discount,
    total: subtotal - discount,
    eligible,
    couponEligible: (!promotion || calculated > 0) && subtotal > discount,
  };
}

export function hasWeakness(profile:string, scenario:string):boolean {
  return profile === "open-playground" || profile === scenario;
}

// A separate fictional teammate is provisioned for each RVU sign-in.
// All cross-account exercises use this predictable-internally but non-guessable
// identity rather than mutating one shared seeded target for all learners.
export const classroomColleagueEmail = (userId:string):string =>
  "colleague-"+userId.replaceAll("-","")+"@learner.rvu.test";
